import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Key, 
  Users, 
  Clock, 
  Send, 
  AlertCircle, 
  CheckCircle2, 
  ArrowUpRight, 
  Copy, 
  RefreshCw,
  Lock,
  UserPlus
} from 'lucide-react';

interface Guardian {
  name: string;
  address: string;
  hasVoted: boolean;
}

interface Proposal {
  id: number;
  newOwner: string;
  proposer: string;
  approvals: number;
  threshold: number;
  timelockRemainingSeconds: number;
  executed: boolean;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'spend' | 'recovery'>('spend');
  const [activeGuardianRole, setActiveGuardianRole] = useState<number>(0);
  const [copied, setCopied] = useState<string | null>(null);

  // Vault State
  const [vaultBalance, setVaultBalance] = useState(12450);
  const [dailyLimit] = useState(1500);
  const [spentToday, setSpentToday] = useState(400);
  const [currentOwner, setCurrentOwner] = useState('GOWNER...4K9X');

  // Fast Spend form
  const [recipient, setRecipient] = useState('GRECIP...8L2M');
  const [amount, setAmount] = useState('250');
  const [spendError, setSpendError] = useState<string | null>(null);

  // Recovery Form
  const [newOwnerInput, setNewOwnerInput] = useState('GNEWKEY...99QP');

  const [guardians, setGuardians] = useState<Guardian[]>([
    { name: 'Hardware Key (Ledger)', address: 'GSEC1...7J4W', hasVoted: true },
    { name: 'Trusted Peer (Alice)', address: 'GALICE...3B1P', hasVoted: false },
    { name: 'Institution Backup', address: 'GINST...8V9K', hasVoted: false },
  ]);

  const [activeProposal, setActiveProposal] = useState<Proposal | null>({
    id: 1,
    newOwner: 'GNEWKEY...99QP',
    proposer: 'GSEC1...7J4W',
    approvals: 1,
    threshold: 2,
    timelockRemainingSeconds: 0, // ready for execution
    executed: false,
  });

  const [auditLogs, setAuditLogs] = useState<string[]>([
    'Ledger #482910: Fast Spend 400 XLM authorized by Owner (Velocity check passed)',
    'Ledger #482850: Guardian GSEC1...7J4W submitted Recovery Proposal #1 for target GNEWKEY...99QP',
    'Ledger #482700: Vault initialized on Soroban with 2-of-3 threshold & 1,500 XLM daily limit'
  ]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setAuditLogs(prev => [`[${timestamp}] ${msg}`, ...prev]);
  };

  const handleFastSpend = (e: React.FormEvent) => {
    e.preventDefault();
    setSpendError(null);
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setSpendError('Enter a valid amount');
      return;
    }
    if (spentToday + num > dailyLimit) {
      setSpendError(`Velocity limit exceeded! Max allowed today: ${dailyLimit - spentToday} XLM. Multi-sig required for larger amounts.`);
      return;
    }
    if (num > vaultBalance) {
      setSpendError('Insufficient vault balance');
      return;
    }

    setSpentToday(prev => prev + num);
    setVaultBalance(prev => prev - num);
    addLog(`Fast-path spend executed: ${num} XLM to ${recipient}. Remaining velocity quota: ${dailyLimit - (spentToday + num)} XLM.`);
    setAmount('');
  };

  const handleGuardianVote = (idx: number) => {
    if (!activeProposal || activeProposal.executed) return;
    if (guardians[idx].hasVoted) return;

    const updated = [...guardians];
    updated[idx].hasVoted = true;
    setGuardians(updated);

    setActiveProposal(prev => prev ? {
      ...prev,
      approvals: prev.approvals + 1
    } : null);

    addLog(`Guardian #${idx + 1} (${guardians[idx].name}) signed approval for Proposal #${activeProposal.id}. Current votes: ${activeProposal.approvals + 1}/${activeProposal.threshold}.`);
  };

  const handleExecuteRecovery = () => {
    if (!activeProposal) return;
    if (activeProposal.approvals < activeProposal.threshold) return;

    setCurrentOwner(activeProposal.newOwner);
    setActiveProposal(prev => prev ? { ...prev, executed: true } : null);
    addLog(`SOCIAL RECOVERY EXECUTED: Vault ownership officially migrated to ${activeProposal.newOwner}! Compromised key revoked.`);
  };

  const handleCreateProposal = () => {
    if (!newOwnerInput) return;
    const prop: Proposal = {
      id: 2,
      newOwner: newOwnerInput,
      proposer: guardians[activeGuardianRole].address,
      approvals: 1,
      threshold: 2,
      timelockRemainingSeconds: 60,
      executed: false
    };
    setActiveProposal(prop);
    const updated = guardians.map((g, i) => ({ ...g, hasVoted: i === activeGuardianRole }));
    setGuardians(updated);
    addLog(`Guardian (${guardians[activeGuardianRole].name}) initiated Recovery Proposal for ${newOwnerInput}. 2-of-3 threshold required.`);
  };

  const dailyRemaining = Math.max(0, dailyLimit - spentToday);
  const velocityUsagePercent = Math.min(100, Math.round((spentToday / dailyLimit) * 100));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      {/* Top Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between border-b border-slate-800 pb-5 mb-8 gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-600/20 border border-emerald-500/30 rounded-xl text-emerald-400">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-sky-400 bg-clip-text text-transparent">
              SorobanGuardian Vault
            </h1>
            <p className="text-xs text-slate-400">Smart Account Abstraction, M-of-N Social Recovery & Spending Policies</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 font-mono">
            <span className="text-slate-500 mr-2">Owner:</span>
            <span className="text-emerald-400 font-semibold">{currentOwner}</span>
            <button onClick={() => copyToClipboard(currentOwner, 'owner')} className="ml-2 text-slate-400 hover:text-white">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center space-x-1.5 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Stellar Testnet</span>
          </div>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Vault Reserves</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white">{vaultBalance.toLocaleString()} <span className="text-xs text-emerald-400 font-normal">XLM</span></p>
          <span className="text-[11px] text-slate-400 mt-1 block">≈ ${(vaultBalance * 0.248).toFixed(2)} USD</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Daily Velocity Allowance</span>
            <Clock className="w-4 h-4 text-teal-400" />
          </div>
          <p className="text-2xl font-bold text-teal-300">{dailyRemaining} <span className="text-xs text-slate-400 font-normal">/ {dailyLimit} XLM</span></p>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div className="bg-teal-400 h-full transition-all" style={{ width: `${velocityUsagePercent}%` }}></div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Guardians & Quorum</span>
            <Users className="w-4 h-4 text-sky-400" />
          </div>
          <p className="text-2xl font-bold text-white">2-of-3 <span className="text-xs text-sky-400 font-normal">Threshold</span></p>
          <span className="text-[11px] text-slate-400 mt-1 block">3 Active Guardians registered</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Security Timelock</span>
            <Lock className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400">Enforced</p>
          <span className="text-[11px] text-slate-400 mt-1 block">Recovery requires timelock delay</span>
        </div>
      </div>

      {/* Main Interface */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column (7 cols): Actions (Fast Spend vs Social Recovery) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
            {/* Tabs */}
            <div className="flex items-center space-x-2 border-b border-slate-800 pb-4 mb-6">
              <button
                onClick={() => setActiveTab('spend')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                  activeTab === 'spend' 
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Daily Fast Spend</span>
              </button>
              <button
                onClick={() => setActiveTab('recovery')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                  activeTab === 'recovery' 
                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-950/40' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>Social Recovery Desk</span>
              </button>
            </div>

            {/* Tab 1: Fast Spend */}
            {activeTab === 'spend' && (
              <form onSubmit={handleFastSpend} className="space-y-4">
                <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl text-xs text-emerald-300">
                  ⚡ <strong>Fast Velocity Mode</strong>: As long as the transaction is within the daily limit ({dailyLimit} XLM/day), the owner can spend instantly without requiring guardian multi-signatures.
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Recipient Address</label>
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                    placeholder="G..."
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <label className="font-semibold text-slate-300">Amount (XLM)</label>
                    <span className="text-slate-400">Available Daily: {dailyRemaining} XLM</span>
                  </div>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                    placeholder="250"
                  />
                </div>

                {spendError && (
                  <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{spendError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-emerald-950/40"
                >
                  Sign & Spend Instantly
                </button>
              </form>
            )}

            {/* Tab 2: Social Recovery Desk */}
            {activeTab === 'recovery' && (
              <div className="space-y-6">
                <div className="p-3.5 bg-sky-950/30 border border-sky-800/40 rounded-xl text-xs text-sky-300">
                  🛡️ <strong>Social Recovery Protocol</strong>: If the owner loses their private key or device, any guardian can initiate recovery. Once 2-of-3 guardians confirm and the timelock elapses, ownership shifts to the new key.
                </div>

                {/* Active Proposal View */}
                {activeProposal && (
                  <div className={`p-4 rounded-xl border ${
                    activeProposal.executed 
                      ? 'bg-emerald-950/20 border-emerald-800/60' 
                      : 'bg-slate-950/60 border-slate-800'
                  }`}>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
                        Recovery Proposal #{activeProposal.id}
                      </span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                        activeProposal.executed 
                          ? 'bg-emerald-500/20 text-emerald-300' 
                          : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {activeProposal.executed ? 'Executed' : 'Pending Approvals'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">New Proposed Owner:</span>
                        <span className="font-mono text-white font-semibold">{activeProposal.newOwner}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Guardian Votes:</span>
                        <span className="font-bold text-sky-400">{activeProposal.approvals} / {activeProposal.threshold} Threshold</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Timelock Security Window:</span>
                        <span className="text-emerald-400 font-semibold">
                          {activeProposal.timelockRemainingSeconds === 0 ? 'Expired (Ready)' : `${activeProposal.timelockRemainingSeconds}s remaining`}
                        </span>
                      </div>
                    </div>

                    {!activeProposal.executed && (
                      <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
                        <button
                          onClick={handleExecuteRecovery}
                          disabled={activeProposal.approvals < activeProposal.threshold}
                          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                            activeProposal.approvals >= activeProposal.threshold
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          Execute Recovery & Rotate Owner Key
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Guardian Voting Console */}
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Guardian Voting Console</h4>
                  <div className="space-y-2">
                    {guardians.map((g, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl">
                        <div>
                          <div className="text-xs font-semibold text-white">{g.name}</div>
                          <div className="text-[11px] font-mono text-slate-500">{g.address}</div>
                        </div>

                        <div>
                          {g.hasVoted ? (
                            <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                            </span>
                          ) : (
                            <button
                              onClick={() => handleGuardianVote(idx)}
                              className="px-3 py-1.5 bg-sky-600/30 hover:bg-sky-600/50 text-sky-300 border border-sky-600/40 rounded-lg text-xs font-semibold transition"
                            >
                              Sign as Guardian
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Audit Trail & Guardians Map */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-base font-bold text-white mb-4">On-Chain Audit Trail</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto font-mono text-[11px]">
              {auditLogs.map((log, i) => (
                <div key={i} className="p-2.5 bg-slate-950/80 border border-slate-800/70 rounded-lg text-slate-300 leading-relaxed border-l-2 border-emerald-500">
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
