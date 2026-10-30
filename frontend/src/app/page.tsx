"use client";

import React, { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { isAddress, getAddress } from "viem";
import SafeOpsRegistryAbi from "@/contracts/SafeOpsRegistry.json";
import { PermissionReport, AdminAccount, PermissionFinding } from "@/lib/inspector";
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Lock,
  Unlock,
  Key,
  Users,
  Clock,
  ArrowRight,
  ExternalLink,
  Layers,
  FileCode2,
  Cpu,
  RefreshCw,
  Terminal,
  Database,
  Sliders,
  Check,
  Copy,
  Download,
  AlertCircle,
} from "lucide-react";

const REGISTRY_ADDRESS =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
    "0x098D204F9F93f855a15Ea72D5d85b7df1FFd2974") as `0x${string}`;

const DEMO_PRESETS = [
  {
    name: "SafeOpsRegistry (Botchain Mainnet)",
    address: REGISTRY_ADDRESS,
    desc: "The active on-chain SafeOps permission registry contract on Botchain Mainnet.",
  },
  {
    name: "Single-EOA Upgradeable Protocol (Discrepancy Demo)",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    desc: "Demonstrates a contract where an EOA retains administrative or direct logic authority.",
  },
  {
    name: "Multi-Sig Governed Vault (High Decentralization)",
    address: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
    desc: "Demonstrates role separation with multisig and timelock controller patterns.",
  },
];

export default function Home() {
  const { address: userAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [inputAddress, setInputAddress] = useState("");
  const [activeTab, setActiveTab] = useState<"confirmed" | "likely" | "unverified" | "admins" | "evidence">("confirmed");
  const [report, setReport] = useState<PermissionReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [analysisStep, setAnalysisStep] = useState<string>("");
  const [onChainTxHash, setOnChainTxHash] = useState<string | null>(null);
  const [isAnchoring, setIsAnchoring] = useState(false);
  const [anchoredTxHash, setAnchoredTxHash] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Wagmi contract write for recordCheck
  const {
    data: writeTxHash,
    writeContractAsync,
    isPending: isTxPending,
  } = useWriteContract();

  const { isLoading: isTxWaiting, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: writeTxHash,
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const runInspection = async (targetAddr: string, recordOnChain = false) => {
    setErrorMsg("");
    setReport(null);
    setOnChainTxHash(null);
    setAnchoredTxHash(null);

    if (!isAddress(targetAddr)) {
      setErrorMsg("Please enter a valid checksummed Ethereum/EVM contract address.");
      return;
    }

    const normalized = getAddress(targetAddr);
    setIsLoading(true);

    try {
      // Step 1: Optional On-Chain Check Record (Gas-Only)
      if (recordOnChain) {
        if (!isConnected) {
          throw new Error("Please connect your Web3 wallet to record this inspection on Botchain Mainnet.");
        }
        setAnalysisStep("Broadcasting gas-only recordCheck() to SafeOpsRegistry.sol...");
        const hash = await writeContractAsync({
          address: REGISTRY_ADDRESS,
          abi: SafeOpsRegistryAbi.abi,
          functionName: "recordCheck",
          args: [normalized, "SafeOps Web Inspector Query"],
        });
        setOnChainTxHash(hash);
        setAnalysisStep("Transaction submitted. Waiting for Botchain Mainnet block confirmation...");
      }

      // Step 2: In-depth permission analysis
      setAnalysisStep("Interrogating bytecode, ERC-1967 storage slots, and ownership state...");
      const res = await fetch("/api/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: normalized }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Inspection engine error.");
      }

      const data: PermissionReport = await res.json();
      setReport(data);
      setAnalysisStep("");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to complete permission inspection.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnchorReport = async () => {
    if (!report) return;
    setIsAnchoring(true);
    try {
      const res = await fetch("/api/anchor-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetAddress: report.targetContract,
          report,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to anchor report.");
      setAnchoredTxHash(data.transactionHash);
    } catch (e: any) {
      alert("Anchor error: " + (e.message || "Unknown error"));
    } finally {
      setIsAnchoring(false);
    }
  };

  const handleExportJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SafeOps-Report-${report.targetContract.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const confirmedFindings = report?.findings.filter((f) => f.confidence === "Confirmed") || [];
  const likelyFindings = report?.findings.filter((f) => f.confidence === "Likely") || [];
  const unverifiedFindings = report?.findings.filter((f) => f.confidence === "Unverified") || [];

  return (
    <div className="min-h-screen text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3 shrink-0">
            <img
              src="/logo.png"
              alt="SafeOps BOT"
              width={44}
              height={44}
              style={{ width: "44px", height: "44px", maxWidth: "44px", maxHeight: "44px" }}
              className="h-11 w-11 rounded-xl object-cover border border-cyan-500/40 shadow-lg shadow-cyan-500/20 shrink-0"
            />
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
                  SafeOps BOT
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono tracking-wider uppercase rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  Permission Inspector
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Administrative Power, Governance & Control Auditing
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Clickable Ecosystem Links in Navbar */}
            <div className="hidden lg:flex items-center space-x-2">
              <a
                href="https://botchain.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-xs font-medium text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/40 transition-all shadow-sm"
              >
                <img
                  src="/botchain-logo.png"
                  alt="BOT Chain Logo"
                  width={16}
                  height={16}
                  style={{ width: "16px", height: "16px", minWidth: "16px", minHeight: "16px" }}
                  className="h-4 w-4 rounded-full object-contain shrink-0"
                />
                <span className="font-mono text-[11px]">https://botchain.ai</span>
              </a>

              <a
                href="https://scan.botchain.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-xs font-medium text-slate-300 hover:text-emerald-300 border border-slate-800 hover:border-emerald-500/40 transition-all shadow-sm"
              >
                <img
                  src="/botchain-logo.png"
                  alt="BOT Chain Explorer Logo"
                  width={16}
                  height={16}
                  style={{ width: "16px", height: "16px", minWidth: "16px", minHeight: "16px" }}
                  className="h-4 w-4 rounded-full object-contain shrink-0"
                />
                <span className="font-mono text-[11px]">https://scan.botchain.ai</span>
              </a>
            </div>

            <div className="hidden md:flex items-center space-x-2 text-xs font-mono text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>BOT Chain Mainnet #677</span>
              <span className="text-slate-600">|</span>
              <span className="text-cyan-400">Gas-Only Anchor</span>
            </div>

            {/* Reown Connect Button */}
            <div className="scale-95">
              <appkit-button />
            </div>
          </div>
        </div>
      </header>

      {/* Hero & Inspection Input */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <section className="text-center max-w-3xl mx-auto space-y-4">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Who Really Controls Your Contract?
          </h1>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
            SafeOps scrutinizes administrative privileges, role-based access controls, proxy upgrade authority, and multisig governance on BOT Chain to reveal hidden single points of failure.
          </p>

          {/* Official BOT Chain Ecosystem Banner (KPI 3) */}
          <div className="inline-flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 p-2 sm:p-2.5 bg-slate-900/80 border border-slate-800 rounded-2xl backdrop-blur shadow-lg shadow-black/40">
            <div className="flex items-center space-x-2 px-2 text-xs font-semibold text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-slate-200">BOT Chain Network:</span>
            </div>

            <a
              href="https://botchain.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-950/80 hover:bg-slate-800 text-xs text-cyan-300 hover:text-cyan-200 border border-cyan-500/30 hover:border-cyan-400 transition-all shadow-sm group"
            >
              <img
                src="/botchain-logo.png"
                alt="BOT Chain Logo"
                width={16}
                height={16}
                style={{ width: "16px", height: "16px", minWidth: "16px", minHeight: "16px" }}
                className="h-4 w-4 rounded-full object-contain group-hover:scale-110 transition-transform shrink-0"
              />
              <span className="font-mono font-medium">https://botchain.ai</span>
              <ExternalLink className="h-3 w-3 text-cyan-400 opacity-70 group-hover:opacity-100" />
            </a>

            <a
              href="https://scan.botchain.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-950/80 hover:bg-slate-800 text-xs text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 hover:border-emerald-400 transition-all shadow-sm group"
            >
              <img
                src="/botchain-logo.png"
                alt="BOT Chain Logo"
                width={16}
                height={16}
                style={{ width: "16px", height: "16px", minWidth: "16px", minHeight: "16px" }}
                className="h-4 w-4 rounded-full object-contain group-hover:scale-110 transition-transform shrink-0"
              />
              <span className="font-mono font-medium">https://scan.botchain.ai</span>
              <ExternalLink className="h-3 w-3 text-emerald-400 opacity-70 group-hover:opacity-100" />
            </a>
          </div>
        </section>

        {/* Input Card */}
        <div className="glass-panel p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="space-y-4 relative z-10">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Target Smart Contract Address (Botchain Mainnet / EVM)
            </label>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                <input
                  type="text"
                  placeholder="0x... (e.g. 0x098D204F9F93f855a15Ea72D5d85b7df1FFd2974)"
                  value={inputAddress}
                  onChange={(e) => setInputAddress(e.target.value.trim())}
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 font-mono text-sm focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => runInspection(inputAddress, true)}
                  disabled={isLoading || !inputAddress}
                  className="flex-1 sm:flex-none px-5 py-3.5 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-sm flex items-center justify-center space-x-2 shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
                >
                  {isLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  <span>Inspect (On-Chain)</span>
                </button>

                <button
                  onClick={() => runInspection(inputAddress, false)}
                  disabled={isLoading || !inputAddress}
                  className="flex-1 sm:flex-none px-4 py-3.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-semibold rounded-xl text-sm border border-slate-700 flex items-center justify-center space-x-2 transition-all cursor-pointer"
                  title="Dry run without broadcasting wallet transaction"
                >
                  <Cpu className="h-4 w-4 text-cyan-400" />
                  <span>Instant Scan</span>
                </button>
              </div>
            </div>

            {/* Demo Contract Presets */}
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Quick Presets:</span>
              {DEMO_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setInputAddress(preset.address);
                    runInspection(preset.address, false);
                  }}
                  className="text-xs bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 px-2.5 py-1 rounded-md border border-slate-800 transition-colors"
                >
                  {preset.name}
                </button>
              ))}
            </div>

            {/* Live Progress / Error */}
            {analysisStep && (
              <div className="p-3 bg-cyan-950/40 border border-cyan-800/60 rounded-xl text-cyan-300 text-xs flex items-center space-x-2 animate-pulse">
                <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
                <span>{analysisStep}</span>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Results Workspace */}
        {report && (
          <div className="space-y-6">
            {/* Discrepancy Highlight Banner */}
            {report.discrepancyAlert && (
              <div className="p-5 rounded-2xl bg-gradient-to-r from-rose-950/80 via-red-950/60 to-slate-900 border-2 border-rose-500/80 shadow-xl shadow-rose-950/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start space-x-3.5">
                  <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 shrink-0">
                    <ShieldAlert className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-rose-200 font-extrabold text-sm uppercase tracking-wider">
                      Critical Administrative Discrepancy Detected
                    </h4>
                    <p className="text-rose-300/90 text-xs sm:text-sm mt-0.5 leading-relaxed">
                      {report.discrepancyAlert}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-xs font-mono bg-rose-950 px-3 py-1.5 rounded-lg border border-rose-700/60 text-rose-300">
                  High Centralization Risk
                </div>
              </div>
            )}

            {/* Overview Key Metrics Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Decentralization Score */}
              <div className="glass-panel p-5 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs uppercase font-mono text-slate-400">Decentralization Score</span>
                    <div className="text-3xl font-extrabold tracking-tight mt-1 flex items-baseline space-x-1">
                      <span
                        className={
                          report.decentralizationScore >= 80
                            ? "text-emerald-400"
                            : report.decentralizationScore >= 50
                            ? "text-amber-400"
                            : "text-rose-400"
                        }
                      >
                        {report.decentralizationScore}
                      </span>
                      <span className="text-xs text-slate-500 font-normal">/ 100</span>
                    </div>
                  </div>
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                      report.decentralizationScore >= 80
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : report.decentralizationScore >= 50
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}
                  >
                    <Sliders className="h-5 w-5" />
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-800 h-1.5 rounded-full mt-4 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      report.decentralizationScore >= 80
                        ? "bg-emerald-400"
                        : report.decentralizationScore >= 50
                        ? "bg-amber-400"
                        : "bg-rose-400"
                    }`}
                    style={{ width: `${report.decentralizationScore}%` }}
                  ></div>
                </div>
              </div>

              {/* Admin Risk Level */}
              <div className="glass-panel p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs uppercase font-mono text-slate-400">Centralization Risk</span>
                    <div className="text-2xl font-bold tracking-tight mt-1">
                      <span
                        className={
                          report.adminRiskLevel === "Low"
                            ? "text-emerald-400"
                            : report.adminRiskLevel === "Moderate"
                            ? "text-amber-400"
                            : "text-rose-400"
                        }
                      >
                        {report.adminRiskLevel} Risk
                      </span>
                    </div>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-300">
                    <Shield className="h-5 w-5" />
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-3 truncate">
                  {report.governanceDetails?.isControlledByEOA
                    ? "Single EOA controller"
                    : report.governanceDetails?.isControlledByMultisig
                    ? "Protected by Safe Multisig"
                    : "Decentralized or No Admin"}
                </p>
              </div>

              {/* Upgradeability Status */}
              <div className="glass-panel p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs uppercase font-mono text-slate-400">Upgradeability</span>
                    <div className="text-lg font-bold tracking-tight mt-1 text-slate-200">
                      {report.proxyDetails?.isProxy ? (
                        <span className="text-amber-400 flex items-center gap-1.5">
                          <Layers className="h-4 w-4" />
                          {report.proxyDetails.proxyType}
                        </span>
                      ) : (
                        <span className="text-emerald-400 flex items-center gap-1.5">
                          <Lock className="h-4 w-4" />
                          Immutable Bytecode
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-300">
                    <FileCode2 className="h-5 w-5" />
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  {report.proxyDetails?.isProxy
                    ? `Impl: ${report.proxyDetails.implementationAddress?.slice(0, 10)}...`
                    : "No proxy slots detected"}
                </p>
              </div>

              {/* Emergency Controls / Pausability */}
              <div className="glass-panel p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs uppercase font-mono text-slate-400">Emergency Pause</span>
                    <div className="text-lg font-bold tracking-tight mt-1 text-slate-200">
                      {report.pausableDetails?.isPausable ? (
                        report.pausableDetails.isCurrentlyPaused ? (
                          <span className="text-rose-400 flex items-center gap-1.5">
                            <Lock className="h-4 w-4" />
                            Currently PAUSED
                          </span>
                        ) : (
                          <span className="text-amber-400 flex items-center gap-1.5">
                            <Unlock className="h-4 w-4" />
                            Pausable
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Check className="h-4 w-4 text-emerald-400" />
                          No Pause Logic
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-300">
                    <Key className="h-5 w-5" />
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-3 truncate">
                  {report.pausableDetails?.isPausable
                    ? `Methods: ${report.pausableDetails.pauseFunctionsDetected.join(", ")}`
                    : "Unstoppable execution"}
                </p>
              </div>
            </div>

            {/* Permission Architecture Topology Map */}
            <div className="glass-panel p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-cyan-400" />
                    Permission Control Hierarchy
                  </h3>
                  <p className="text-xs text-slate-500">
                    Visual delegation pipeline from execution target to root administrative authority.
                  </p>
                </div>
                <button
                  onClick={handleExportJson}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-mono border border-slate-700 flex items-center gap-1.5 transition-colors"
                >
                  <Download className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Export JSON</span>
                </button>
              </div>

              {/* Topology Nodes */}
              <div className="p-6 bg-slate-950/80 rounded-xl border border-slate-800/80 overflow-x-auto">
                <div className="flex items-center justify-start sm:justify-center gap-4 min-w-[650px] py-4">
                  {/* Node 1: Target Contract */}
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 w-52 shrink-0 space-y-1">
                    <div className="text-[10px] font-mono uppercase text-slate-400">Target Contract</div>
                    <div className="text-xs font-mono font-bold text-cyan-400 truncate">
                      {report.targetContract}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Bytecode: {report.bytecodeSize} bytes
                    </div>
                  </div>

                  <ArrowRight className="h-5 w-5 text-slate-600 shrink-0" />

                  {/* Node 2: Proxy Layer (if any) */}
                  <div
                    className={`p-4 rounded-xl border w-52 shrink-0 space-y-1 ${
                      report.proxyDetails?.isProxy
                        ? "bg-amber-950/30 border-amber-600/40 text-amber-200"
                        : "bg-slate-900/40 border-slate-800 text-slate-500"
                    }`}
                  >
                    <div className="text-[10px] font-mono uppercase">Proxy Logic Layer</div>
                    <div className="text-xs font-bold truncate">
                      {report.proxyDetails?.isProxy ? report.proxyDetails.proxyType : "Direct Execution"}
                    </div>
                    <div className="text-[11px] truncate font-mono">
                      {report.proxyDetails?.implementationAddress
                        ? `Impl: ${report.proxyDetails.implementationAddress.slice(0, 10)}...`
                        : "Immutable logic"}
                    </div>
                  </div>

                  <ArrowRight className="h-5 w-5 text-slate-600 shrink-0" />

                  {/* Node 3: Access Control / Roles */}
                  <div
                    className={`p-4 rounded-xl border w-52 shrink-0 space-y-1 ${
                      report.rbacDetails?.usesRBAC
                        ? "bg-cyan-950/30 border-cyan-600/40 text-cyan-200"
                        : "bg-slate-900 border-slate-700 text-slate-300"
                    }`}
                  >
                    <div className="text-[10px] font-mono uppercase">Control Interface</div>
                    <div className="text-xs font-bold truncate">
                      {report.rbacDetails?.usesRBAC ? "AccessControl (RBAC)" : "Ownable Pattern"}
                    </div>
                    <div className="text-[11px] truncate">
                      {report.owner ? `Owner: ${report.owner.address.slice(0, 8)}...` : "Custom / None"}
                    </div>
                  </div>

                  <ArrowRight className="h-5 w-5 text-slate-600 shrink-0" />

                  {/* Node 4: Root Admin Controller */}
                  <div
                    className={`p-4 rounded-xl border w-56 shrink-0 space-y-1 ${
                      report.governanceDetails?.isControlledByMultisig
                        ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-200"
                        : report.governanceDetails?.isControlledByTimelock
                        ? "bg-teal-950/40 border-teal-500/50 text-teal-200"
                        : report.governanceDetails?.isControlledByEOA
                        ? "bg-rose-950/40 border-rose-500/50 text-rose-200"
                        : "bg-slate-900 border-slate-700 text-slate-300"
                    }`}
                  >
                    <div className="text-[10px] font-mono uppercase flex items-center justify-between">
                      <span>Root Authority</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase">
                        {report.governanceDetails?.primaryController?.accountType || "EOA"}
                      </span>
                    </div>
                    <div className="text-xs font-bold truncate font-mono">
                      {report.governanceDetails?.primaryController?.address || report.owner?.address || "Unknown"}
                    </div>
                    <div className="text-[11px] truncate">
                      {report.governanceDetails?.primaryController?.label || "External Account"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Findings & Evidence Tabs */}
            <div className="glass-panel p-6 space-y-5">
              {/* Tab Navigation */}
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
                <button
                  onClick={() => setActiveTab("confirmed")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                    activeTab === "confirmed"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>Confirmed Findings</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-300">
                    {confirmedFindings.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("likely")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                    activeTab === "likely"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <span>Likely Findings</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-300">
                    {likelyFindings.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("unverified")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                    activeTab === "unverified"
                      ? "bg-slate-800 text-slate-200 border border-slate-600"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <HelpCircle className="h-4 w-4 text-slate-400" />
                  <span>Unknown / Limitations</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-300">
                    {unverifiedFindings.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("admins")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                    activeTab === "admins"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <Users className="h-4 w-4 text-cyan-400" />
                  <span>Admin Accounts</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-300">
                    {report.admins.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("evidence")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                    activeTab === "evidence"
                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <Database className="h-4 w-4 text-purple-400" />
                  <span>Storage & RPC Evidence</span>
                </button>
              </div>

              {/* Tab Content: Confirmed Findings */}
              {activeTab === "confirmed" && (
                <div className="space-y-3">
                  {confirmedFindings.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4">No confirmed findings returned.</p>
                  ) : (
                    confirmedFindings.map((f) => (
                      <div
                        key={f.id}
                        className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-colors space-y-2"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider badge-confirmed">
                              Confirmed
                            </span>
                            <span className="text-xs font-mono text-slate-500 uppercase">
                              [{f.category}]
                            </span>
                            <h4 className="text-sm font-bold text-slate-200">{f.title}</h4>
                          </div>
                          <span
                            className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                              f.severity === "Critical"
                                ? "bg-rose-950 text-rose-400 border border-rose-800"
                                : f.severity === "High"
                                ? "bg-amber-950 text-amber-400 border border-amber-800"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            {f.severity}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{f.description}</p>
                        <div className="p-2.5 rounded-lg bg-slate-950 font-mono text-[11px] text-cyan-300 border border-slate-800/80">
                          <span className="text-slate-500">Evidence: </span>
                          {f.evidence}
                        </div>
                        {f.limitations && (
                          <p className="text-[11px] text-slate-500 italic">
                            Limitation: {f.limitations}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab Content: Likely Findings */}
              {activeTab === "likely" && (
                <div className="space-y-3">
                  {likelyFindings.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4">No likely heuristic findings.</p>
                  ) : (
                    likelyFindings.map((f) => (
                      <div
                        key={f.id}
                        className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-colors space-y-2"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider badge-likely">
                              Likely (Heuristic)
                            </span>
                            <span className="text-xs font-mono text-slate-500 uppercase">
                              [{f.category}]
                            </span>
                            <h4 className="text-sm font-bold text-slate-200">{f.title}</h4>
                          </div>
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            {f.severity}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{f.description}</p>
                        <div className="p-2.5 rounded-lg bg-slate-950 font-mono text-[11px] text-amber-300 border border-slate-800/80">
                          <span className="text-slate-500">Evidence: </span>
                          {f.evidence}
                        </div>
                        {f.limitations && (
                          <p className="text-[11px] text-slate-500 italic">
                            Limitation: {f.limitations}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab Content: Unknown / Limitations */}
              {activeTab === "unverified" && (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-1">
                    <span className="font-bold text-slate-300">Why are some controls unverified?</span>
                    <p>
                      Contracts implement permissions in diverse manners. Some expose ownership through standard interfaces; others employ custom access-control logic or private state variables that do not emit standard events or getters.
                    </p>
                  </div>
                  {unverifiedFindings.map((f) => (
                    <div
                      key={f.id}
                      className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider badge-unverified">
                          Unverified
                        </span>
                        <h4 className="text-sm font-bold text-slate-300">{f.title}</h4>
                      </div>
                      <p className="text-xs text-slate-400">{f.description}</p>
                      {f.limitations && (
                        <div className="p-2.5 rounded-lg bg-slate-950 font-mono text-[11px] text-slate-400 border border-slate-800">
                          <span className="text-amber-400">Analysis Note: </span>
                          {f.limitations}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Tab Content: Admin Accounts */}
              {activeTab === "admins" && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400">
                    Accounts identified with direct administrative, owner, or upgrade authority.
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-4">Account Address</th>
                          <th className="py-3 px-4">Account Type</th>
                          <th className="py-3 px-4">Assigned Roles</th>
                          <th className="py-3 px-4">Multisig / Timelock Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 font-mono">
                        {report.admins.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-4 px-4 text-center text-slate-500">
                              No explicit administrator addresses discovered via exposed interfaces.
                            </td>
                          </tr>
                        ) : (
                          report.admins.map((adm, i) => (
                            <tr key={i} className="hover:bg-slate-900/50">
                              <td className="py-3 px-4">
                                <div className="flex items-center space-x-2">
                                  <a
                                    href={`${process.env.NEXT_PUBLIC_EXPLORER_URL || "https://scan.botchain.ai"}/address/${adm.address}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-cyan-400 hover:underline flex items-center gap-1"
                                  >
                                    {adm.address.slice(0, 10)}...{adm.address.slice(-6)}
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                  <button
                                    onClick={() => handleCopy(adm.address, `adm-${i}`)}
                                    className="text-slate-500 hover:text-slate-300"
                                  >
                                    {copiedText === `adm-${i}` ? (
                                      <Check className="h-3 w-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    adm.accountType === "Safe Multisig"
                                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                      : adm.accountType === "Timelock"
                                      ? "bg-teal-950 text-teal-400 border border-teal-800"
                                      : adm.accountType === "EOA"
                                      ? "bg-rose-950 text-rose-400 border border-rose-800"
                                      : "bg-slate-800 text-slate-300"
                                  }`}
                                >
                                  {adm.accountType}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex flex-wrap gap-1">
                                  {adm.roles.map((r, ri) => (
                                    <span
                                      key={ri}
                                      className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]"
                                    >
                                      {r}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-slate-400 text-[11px]">
                                {adm.multisigDetails ? (
                                  <span>
                                    Threshold: {adm.multisigDetails.threshold} of{" "}
                                    {adm.multisigDetails.ownersCount || adm.multisigDetails.owners.length} signers
                                  </span>
                                ) : adm.timelockDetails ? (
                                  <span>Min Delay: {adm.timelockDetails.minDelaySeconds}s</span>
                                ) : (
                                  <span className="text-slate-500">N/A (Single Key)</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab Content: Storage & RPC Evidence */}
              {activeTab === "evidence" && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400">
                    Low-level EVM storage slots inspected for standard proxy implementation and admin slots.
                  </p>

                  <div className="space-y-3 font-mono text-xs">
                    {report.storageSlotsChecked.map((slot, idx) => (
                      <div key={idx} className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-slate-400 text-[11px]">
                          <span>{slot.label}</span>
                          <span className="text-slate-600">{slot.slot.slice(0, 14)}...</span>
                        </div>
                        <div className="text-slate-300 break-all text-[11px]">
                          Raw: <span className="text-cyan-400">{slot.rawValue}</span>
                        </div>
                        {slot.decodedAddress && (
                          <div className="text-emerald-400 text-[11px]">
                            Decoded Address: {slot.decodedAddress}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* On-Chain Anchoring Action Card */}
            <div className="glass-panel p-6 border-cyan-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Database className="h-4 w-4 text-cyan-400" />
                  Anchor Audit Findings On-Chain (SafeOpsRegistry.sol)
                </h4>
                <p className="text-xs text-slate-400">
                  Write the cryptographic report hash and decentralization score ({report.decentralizationScore}/100) to Botchain for permanent auditability.
                </p>
                {anchoredTxHash && (
                  <p className="text-xs text-emerald-400 pt-1 font-mono flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Anchored on Botchain! Tx:{" "}
                    <a
                      href={`${process.env.NEXT_PUBLIC_EXPLORER_URL || "https://scan.botchain.ai"}/tx/${anchoredTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {anchoredTxHash.slice(0, 16)}...
                    </a>
                  </p>
                )}
                {onChainTxHash && !anchoredTxHash && (
                  <p className="text-xs text-cyan-400 pt-1 font-mono">
                    Inspection Check Tx: {onChainTxHash.slice(0, 16)}...
                  </p>
                )}
              </div>

              <button
                onClick={handleAnchorReport}
                disabled={isAnchoring || !!anchoredTxHash}
                className="px-5 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all cursor-pointer shrink-0"
              >
                {isAnchoring ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                <span>{anchoredTxHash ? "Anchored Successfully" : "Anchor to Registry"}</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-8 text-center text-xs text-slate-400 font-mono mt-12 space-y-4">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <img
              src="/logo.png"
              alt="SafeOps BOT"
              width={32}
              height={32}
              style={{ width: "32px", height: "32px", maxWidth: "32px", maxHeight: "32px" }}
              className="h-8 w-8 rounded-xl object-cover border border-cyan-500/30 shrink-0"
            />
            <span className="font-semibold text-slate-200">
              SafeOps BOT — Contract Admin and Permission Inspector
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://botchain.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 text-xs text-slate-300 hover:text-cyan-400 transition-colors"
            >
              <img
                src="/botchain-logo.png"
                alt="BOT Chain Logo"
                width={16}
                height={16}
                style={{ width: "16px", height: "16px", minWidth: "16px", minHeight: "16px" }}
                className="h-4 w-4 rounded-full object-contain shrink-0"
              />
              <span className="font-mono">https://botchain.ai</span>
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>

            <a
              href="https://scan.botchain.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 text-xs text-slate-300 hover:text-emerald-400 transition-colors"
            >
              <img
                src="/botchain-logo.png"
                alt="BOT Chain Logo"
                width={16}
                height={16}
                style={{ width: "16px", height: "16px", minWidth: "16px", minHeight: "16px" }}
                className="h-4 w-4 rounded-full object-contain shrink-0"
              />
              <span className="font-mono">https://scan.botchain.ai</span>
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
          </div>

          <span className="text-slate-500">
            BOT Chain Mainnet (Chain ID: 677) • Registry: {REGISTRY_ADDRESS.slice(0, 8)}...{REGISTRY_ADDRESS.slice(-6)}
          </span>
        </div>
      </footer>
    </div>
  );
}
