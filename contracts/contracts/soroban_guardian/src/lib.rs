#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VaultError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    VelocityLimitExceeded = 4,
    InvalidGuardianConfig = 5,
    NotAGuardian = 6,
    ProposalNotFound = 7,
    AlreadyApproved = 8,
    TimelockNotExpired = 9,
    ThresholdNotMet = 10,
    ProposalAlreadyExecuted = 11,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct VaultConfig {
    pub owner: Address,
    pub guardians: Vec<Address>,
    pub threshold: u32,
    pub daily_limit: i128,
    pub timelock_delay: u64,
    pub last_spend_reset: u64,
    pub current_day_spent: i128,
    pub balance: i128,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct RecoveryProposal {
    pub id: u32,
    pub proposed_owner: Address,
    pub proposer: Address,
    pub approvals: Vec<Address>,
    pub timelock_expiration: u64,
    pub executed: bool,
}

const VAULT_KEY: Symbol = symbol_short!("VAULT");
const PROPOSAL_COUNT_KEY: Symbol = symbol_short!("P_COUNT");
const PROPOSALS_KEY: Symbol = symbol_short!("PROPS");

const DAY_IN_SECONDS: u64 = 86400;

#[contract]
pub struct SorobanGuardianVault;

#[contractimpl]
impl SorobanGuardianVault {
    /// Initialize the Smart Account Vault with Social Guardians and Velocity Limits
    pub fn init_vault(
        env: Env,
        owner: Address,
        guardians: Vec<Address>,
        threshold: u32,
        daily_limit: i128,
        timelock_delay: u64,
        initial_balance: i128,
    ) -> Result<(), VaultError> {
        if env.storage().instance().has(&VAULT_KEY) {
            return Err(VaultError::AlreadyInitialized);
        }

        owner.require_auth();

        let guardian_count = guardians.len();
        if guardian_count == 0 || threshold == 0 || threshold > guardian_count {
            return Err(VaultError::InvalidGuardianConfig);
        }
        if daily_limit <= 0 {
            return Err(VaultError::InvalidGuardianConfig);
        }

        let now = env.ledger().timestamp();
        let config = VaultConfig {
            owner,
            guardians,
            threshold,
            daily_limit,
            timelock_delay,
            last_spend_reset: now,
            current_day_spent: 0,
            balance: initial_balance,
        };

        env.storage().instance().set(&VAULT_KEY, &config);
        env.storage().instance().set(&PROPOSAL_COUNT_KEY, &0u32);
        let empty_proposals: Vec<RecoveryProposal> = Vec::new(&env);
        env.storage().instance().set(&PROPOSALS_KEY, &empty_proposals);

        Ok(())
    }

    /// Fast-path spend: Owner spends funds immediately up to the configured daily limit
    pub fn spend(
        env: Env,
        caller: Address,
        _recipient: Address,
        amount: i128,
    ) -> Result<i128, VaultError> {
        let mut config: VaultConfig = env.storage().instance().get(&VAULT_KEY).ok_or(VaultError::NotInitialized)?;
        
        if caller != config.owner {
            return Err(VaultError::Unauthorized);
        }
        caller.require_auth();

        if amount <= 0 || amount > config.balance {
            return Err(VaultError::VelocityLimitExceeded);
        }

        let now = env.ledger().timestamp();
        if now >= config.last_spend_reset + DAY_IN_SECONDS {
            config.current_day_spent = 0;
            config.last_spend_reset = now;
        }

        let new_spent = config.current_day_spent.checked_add(amount).ok_or(VaultError::VelocityLimitExceeded)?;
        if new_spent > config.daily_limit {
            return Err(VaultError::VelocityLimitExceeded);
        }

        config.current_day_spent = new_spent;
        config.balance -= amount;

        env.storage().instance().set(&VAULT_KEY, &config);
        Ok(config.balance)
    }

    /// Guardian proposes account recovery to a new owner
    pub fn propose_recovery(
        env: Env,
        proposer: Address,
        new_owner: Address,
    ) -> Result<u32, VaultError> {
        let config: VaultConfig = env.storage().instance().get(&VAULT_KEY).ok_or(VaultError::NotInitialized)?;
        
        proposer.require_auth();

        let mut is_guardian = false;
        for i in 0..config.guardians.len() {
            if config.guardians.get(i).unwrap() == proposer {
                is_guardian = true;
                break;
            }
        }
        if !is_guardian {
            return Err(VaultError::NotAGuardian);
        }

        let mut count: u32 = env.storage().instance().get(&PROPOSAL_COUNT_KEY).unwrap_or(0);
        let proposal_id = count;
        count += 1;
        env.storage().instance().set(&PROPOSAL_COUNT_KEY, &count);

        let now = env.ledger().timestamp();
        let timelock_exp = now + config.timelock_delay;

        let mut approvals: Vec<Address> = Vec::new(&env);
        approvals.push_back(proposer.clone());

        let proposal = RecoveryProposal {
            id: proposal_id,
            proposed_owner: new_owner,
            proposer,
            approvals,
            timelock_expiration: timelock_exp,
            executed: false,
        };

        let mut proposals: Vec<RecoveryProposal> = env.storage().instance().get(&PROPOSALS_KEY).unwrap();
        proposals.push_back(proposal);
        env.storage().instance().set(&PROPOSALS_KEY, &proposals);

        Ok(proposal_id)
    }

    /// Another Guardian approves an existing recovery proposal
    pub fn approve_recovery(
        env: Env,
        guardian: Address,
        proposal_id: u32,
    ) -> Result<(), VaultError> {
        let config: VaultConfig = env.storage().instance().get(&VAULT_KEY).ok_or(VaultError::NotInitialized)?;
        guardian.require_auth();

        let mut is_guardian = false;
        for i in 0..config.guardians.len() {
            if config.guardians.get(i).unwrap() == guardian {
                is_guardian = true;
                break;
            }
        }
        if !is_guardian {
            return Err(VaultError::NotAGuardian);
        }

        let mut proposals: Vec<RecoveryProposal> = env.storage().instance().get(&PROPOSALS_KEY).unwrap();
        let mut target_prop = proposals.get(proposal_id).ok_or(VaultError::ProposalNotFound)?;

        if target_prop.executed {
            return Err(VaultError::ProposalAlreadyExecuted);
        }

        for i in 0..target_prop.approvals.len() {
            if target_prop.approvals.get(i).unwrap() == guardian {
                return Err(VaultError::AlreadyApproved);
            }
        }

        target_prop.approvals.push_back(guardian);
        proposals.set(proposal_id, target_prop);
        env.storage().instance().set(&PROPOSALS_KEY, &proposals);

        Ok(())
    }

    /// Execute recovery once threshold is met and timelock has passed
    pub fn execute_recovery(
        env: Env,
        proposal_id: u32,
    ) -> Result<(), VaultError> {
        let mut config: VaultConfig = env.storage().instance().get(&VAULT_KEY).ok_or(VaultError::NotInitialized)?;
        let mut proposals: Vec<RecoveryProposal> = env.storage().instance().get(&PROPOSALS_KEY).unwrap();
        let mut proposal = proposals.get(proposal_id).ok_or(VaultError::ProposalNotFound)?;

        if proposal.executed {
            return Err(VaultError::ProposalAlreadyExecuted);
        }

        if proposal.approvals.len() < config.threshold {
            return Err(VaultError::ThresholdNotMet);
        }

        let now = env.ledger().timestamp();
        if now < proposal.timelock_expiration {
            return Err(VaultError::TimelockNotExpired);
        }

        // Migrate ownership
        config.owner = proposal.proposed_owner.clone();
        proposal.executed = true;

        proposals.set(proposal_id, proposal);
        env.storage().instance().set(&VAULT_KEY, &config);
        env.storage().instance().set(&PROPOSALS_KEY, &proposals);

        Ok(())
    }

    /// Query current vault configuration and status
    pub fn get_vault_info(env: Env) -> Result<VaultConfig, VaultError> {
        env.storage().instance().get(&VAULT_KEY).ok_or(VaultError::NotInitialized)
    }

    /// Query proposals
    pub fn get_proposals(env: Env) -> Result<Vec<RecoveryProposal>, VaultError> {
        env.storage().instance().get(&PROPOSALS_KEY).ok_or(VaultError::NotInitialized)
    }
}

#[cfg(test)]
mod test;
