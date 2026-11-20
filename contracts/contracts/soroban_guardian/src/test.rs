#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::{Address as _, Ledger}, vec, Env};

#[test]
fn test_vault_velocity_spending() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SorobanGuardianVault, ());
    let client = SorobanGuardianVaultClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let g1 = Address::generate(&env);
    let g2 = Address::generate(&env);
    let recipient = Address::generate(&env);

    let guardians = vec![&env, g1, g2];
    let daily_limit = 1000_0000000i128;
    let initial_balance = 5000_0000000i128;

    client.init_vault(&owner, &guardians, &2, &daily_limit, &3600, &initial_balance);

    // Spend 400 (within 1000 limit)
    let balance1 = client.spend(&owner, &recipient, &400_0000000i128);
    assert_eq!(balance1, 4600_0000000i128);

    // Attempt to spend 700 (400 + 700 = 1100 > 1000 daily limit) -> Should fail
    let overspend = client.try_spend(&owner, &recipient, &700_0000000i128);
    assert!(overspend.is_err());

    // Advance ledger time by 1 day (86401 seconds) to reset velocity window
    env.ledger().set_timestamp(86401);

    // Now spending 700 should succeed on the new day
    let balance2 = client.spend(&owner, &recipient, &700_0000000i128);
    assert_eq!(balance2, 3900_0000000i128);
}

#[test]
fn test_social_recovery_workflow() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SorobanGuardianVault, ());
    let client = SorobanGuardianVaultClient::new(&env, &contract_id);

    let original_owner = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let g1 = Address::generate(&env);
    let g2 = Address::generate(&env);
    let g3 = Address::generate(&env);

    let guardians = vec![&env, g1.clone(), g2.clone(), g3.clone()];
    // 2-of-3 threshold, 3600s timelock
    client.init_vault(&original_owner, &guardians, &2, &1000_0000000i128, &3600, &5000_0000000i128);

    // Guardian 1 proposes recovery
    env.ledger().set_timestamp(100);
    let proposal_id = client.propose_recovery(&g1, &new_owner);
    assert_eq!(proposal_id, 0);

    // Guardian 2 approves recovery (Reaches 2-of-3 threshold)
    client.approve_recovery(&g2, &proposal_id);

    // Attempt execution before timelock (100 + 3600 = 3700) -> Should fail
    env.ledger().set_timestamp(2000);
    let early_exec = client.try_execute_recovery(&proposal_id);
    assert!(early_exec.is_err());

    // Advance time past timelock
    env.ledger().set_timestamp(3701);
    client.execute_recovery(&proposal_id);

    // Verify ownership successfully migrated to new_owner
    let vault_info = client.get_vault_info();
    assert_eq!(vault_info.owner, new_owner);
}
