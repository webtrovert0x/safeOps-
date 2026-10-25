import { createPublicClient, http, getAddress, isAddress } from "viem";
import { bohrTestnet } from "@/config/bohr";

export interface AdminAccount {
  address: string;
  label: string;
  accountType: "EOA" | "Safe Multisig" | "Timelock" | "Contract" | "Unknown";
  multisigDetails?: {
    threshold: number;
    ownersCount: number;
    owners: string[];
  };
  timelockDetails?: {
    minDelaySeconds: number;
  };
  roles: string[];
  isDirectController: boolean;
}

export interface PermissionFinding {
  id: string;
  category: "Ownership" | "RBAC" | "Upgradeability" | "Pausability" | "Governance" | "Centralization";
  title: string;
  description: string;
  confidence: "Confirmed" | "Likely" | "Unverified";
  severity: "Safe" | "Info" | "Moderate" | "High" | "Critical";
  evidence: string;
  limitations?: string;
}

export interface PermissionReport {
  targetContract: string;
  contractName: string;
  isContract: boolean;
  bytecodeSize: number;
  analyzedAt: string;
  decentralizationScore: number; // 0 - 100
  adminRiskLevel: "Low" | "Moderate" | "High" | "Critical";
  discrepancyAlert?: string;
  owner?: {
    address: string;
    detectedVia: string;
    isEOA: boolean;
  };
  proxyDetails?: {
    isProxy: boolean;
    proxyType: "ERC-1967 Transparent" | "ERC-1967 UUPS" | "Beacon Proxy" | "Diamond EIP-2535" | "None";
    implementationAddress?: string;
    adminAddress?: string;
    beaconAddress?: string;
  };
  pausableDetails?: {
    isPausable: boolean;
    isCurrentlyPaused: boolean;
    pauseFunctionsDetected: string[];
    controllerLabel?: string;
  };
  rbacDetails?: {
    usesRBAC: boolean;
    recognizedRoles: { roleName: string; roleHash: string; confirmedHolders: string[] }[];
  };
  governanceDetails?: {
    isControlledByMultisig: boolean;
    isControlledByTimelock: boolean;
    isControlledByEOA: boolean;
    primaryController?: AdminAccount;
  };
  admins: AdminAccount[];
  findings: PermissionFinding[];
  storageSlotsChecked: { slot: string; label: string; rawValue: string; decodedAddress?: string }[];
}

// ERC-1967 Storage Slots
const ERC1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ERC1967_ADMIN_SLOT = "0xb5352742e0d006000522c0a4417429076779a72985382624083cd20337765710";
const ERC1967_BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

// Standard Selectors
const SELECTORS = {
  owner: "0x8da5cb5b",                // owner()
  getOwner: "0x893d20e8",             // getOwner()
  admin: "0xf851a440",                // admin()
  paused: "0x5c975abb",               // paused()
  pause: "0x8456cb59",                // pause()
  unpause: "0x3f4ba83a",              // unpause()
  hasRole: "0x91d14854",              // hasRole(bytes32,address)
  getRoleAdmin: "0x248a9ca3",         // getRoleAdmin(bytes32)
  getOwners: "0xa0e67e2b",            // Safe getOwners()
  getThreshold: "0xe75235b8",         // Safe getThreshold()
  getMinDelay: "0x19dfa94d",          // Timelock getMinDelay()
  proxiableUUID: "0x52d1902d",        // UUPS proxiableUUID()
  facets: "0x7a0ed627",               // Diamond facets()
};

const STANDARD_ROLES = [
  { name: "DEFAULT_ADMIN_ROLE", hash: "0x0000000000000000000000000000000000000000000000000000000000000000" },
  { name: "PAUSER_ROLE", hash: "0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a" },
  { name: "MINTER_ROLE", hash: "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6" },
  { name: "UPGRADER_ROLE", hash: "0x189ab7a9244e08ba82b39cc1c67640eee1f15c4778dbd50e33e1d01e8211ec3a" },
];

function cleanAddressFromHex(hex: string): string | null {
  if (!hex || hex === "0x" || hex === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    return null;
  }
  const stripped = hex.replace("0x", "").padStart(64, "0");
  const addrHex = "0x" + stripped.slice(24);
  try {
    return getAddress(addrHex);
  } catch {
    return null;
  }
}

export async function inspectContractPermissions(
  targetAddress: string,
  rpcUrl?: string
): Promise<PermissionReport> {
  const normalizedTarget = getAddress(targetAddress);
  const client = createPublicClient({
    chain: bohrTestnet,
    transport: http(rpcUrl || process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.bohr.life"),
  });

  const findings: PermissionFinding[] = [];
  const admins: AdminAccount[] = [];
  const storageSlotsChecked: { slot: string; label: string; rawValue: string; decodedAddress?: string }[] = [];

  // 1. Fetch Bytecode
  const bytecode = await client.getBytecode({ address: normalizedTarget });
  const isContract = !!bytecode && bytecode.length > 2;
  const bytecodeSize = isContract ? (bytecode.length - 2) / 2 : 0;

  if (!isContract) {
    findings.push({
      id: "no-code",
      category: "Ownership",
      title: "Target is an Externally Owned Account (EOA)",
      description: "No contract bytecode was found at this address. It behaves as a standard private-key wallet.",
      confidence: "Confirmed",
      severity: "Safe",
      evidence: "client.getBytecode returned 0x (0 bytes)",
      limitations: "EOAs do not possess smart contract administrative mechanisms.",
    });

    return {
      targetContract: normalizedTarget,
      contractName: "External Account (EOA)",
      isContract: false,
      bytecodeSize: 0,
      analyzedAt: new Date().toISOString(),
      decentralizationScore: 100,
      adminRiskLevel: "Low",
      admins: [],
      findings,
      storageSlotsChecked: [],
    };
  }

  let proxyType: "ERC-1967 Transparent" | "ERC-1967 UUPS" | "Beacon Proxy" | "Diamond EIP-2535" | "None" = "None";
  let implAddress: string | undefined;
  let proxyAdminAddress: string | undefined;
  let beaconAddress: string | undefined;

  try {
    const rawImpl = await client.getStorageAt({
      address: normalizedTarget,
      slot: ERC1967_IMPLEMENTATION_SLOT as `0x${string}`,
    });
    const decodedImpl = rawImpl ? cleanAddressFromHex(rawImpl) : null;
    storageSlotsChecked.push({
      slot: ERC1967_IMPLEMENTATION_SLOT,
      label: "ERC-1967 Implementation Slot",
      rawValue: rawImpl || "0x0",
      decodedAddress: decodedImpl || undefined,
    });

    if (decodedImpl && decodedImpl !== "0x0000000000000000000000000000000000000000") {
      implAddress = decodedImpl;
      proxyType = "ERC-1967 Transparent";
    }
  } catch (e) {
    // Storage query fallback
  }

  try {
    const rawAdmin = await client.getStorageAt({
      address: normalizedTarget,
      slot: ERC1967_ADMIN_SLOT as `0x${string}`,
    });
    const decodedAdmin = rawAdmin ? cleanAddressFromHex(rawAdmin) : null;
    storageSlotsChecked.push({
      slot: ERC1967_ADMIN_SLOT,
      label: "ERC-1967 Admin Slot",
      rawValue: rawAdmin || "0x0",
      decodedAddress: decodedAdmin || undefined,
    });

    if (decodedAdmin && decodedAdmin !== "0x0000000000000000000000000000000000000000") {
      proxyAdminAddress = decodedAdmin;
    }
  } catch (e) {
    // ignore
  }

  try {
    const rawBeacon = await client.getStorageAt({
      address: normalizedTarget,
      slot: ERC1967_BEACON_SLOT as `0x${string}`,
    });
    const decodedBeacon = rawBeacon ? cleanAddressFromHex(rawBeacon) : null;
    storageSlotsChecked.push({
      slot: ERC1967_BEACON_SLOT,
      label: "ERC-1967 Beacon Slot",
      rawValue: rawBeacon || "0x0",
      decodedAddress: decodedBeacon || undefined,
    });

    if (decodedBeacon && decodedBeacon !== "0x0000000000000000000000000000000000000000") {
      beaconAddress = decodedBeacon;
      proxyType = "Beacon Proxy";
    }
  } catch (e) {
    // ignore
  }

  // Check UUPS proxiableUUID signature in bytecode
  if (bytecode.includes("52d1902d")) {
    if (proxyType === "ERC-1967 Transparent") {
      proxyType = "ERC-1967 UUPS";
    }
  }

  // 3. Inspect Standard Ownership (owner(), getOwner(), admin())
  let detectedOwner: string | null = null;
  let ownerSource = "";

  const tryCallAddress = async (data: string): Promise<string | null> => {
    try {
      const res = await client.call({
        to: normalizedTarget,
        data: data as `0x${string}`,
      });
      if (res.data && res.data.length >= 66) {
        return cleanAddressFromHex(res.data);
      }
    } catch {
      // call failed or reverted
    }
    return null;
  };

  const ownerRes = await tryCallAddress(SELECTORS.owner);
  if (ownerRes && ownerRes !== "0x0000000000000000000000000000000000000000") {
    detectedOwner = ownerRes;
    ownerSource = "owner() [0x8da5cb5b]";
  } else {
    const getOwnerRes = await tryCallAddress(SELECTORS.getOwner);
    if (getOwnerRes && getOwnerRes !== "0x0000000000000000000000000000000000000000") {
      detectedOwner = getOwnerRes;
      ownerSource = "getOwner() [0x893d20e8]";
    } else {
      const adminRes = await tryCallAddress(SELECTORS.admin);
      if (adminRes && adminRes !== "0x0000000000000000000000000000000000000000") {
        detectedOwner = adminRes;
        ownerSource = "admin() [0xf851a440]";
      }
    }
  }

  // 4. Pausability Check
  let isPausable = false;
  let isCurrentlyPaused = false;
  const pauseFunctionsDetected: string[] = [];

  if (bytecode.includes("5c975abb")) {
    isPausable = true;
    pauseFunctionsDetected.push("paused()");
    try {
      const pausedRes = await client.call({
        to: normalizedTarget,
        data: SELECTORS.paused as `0x${string}`,
      });
      if (pausedRes.data && parseInt(pausedRes.data, 16) === 1) {
        isCurrentlyPaused = true;
      }
    } catch {
      // not actively callable
    }
  }

  if (bytecode.includes("8456cb59")) {
    isPausable = true;
    pauseFunctionsDetected.push("pause()");
  }
  if (bytecode.includes("3f4ba83a")) {
    isPausable = true;
    pauseFunctionsDetected.push("unpause()");
  }

  // 5. Role-Based Access Control (RBAC) Inspection
  let usesRBAC = false;
  const recognizedRoles: { roleName: string; roleHash: string; confirmedHolders: string[] }[] = [];

  const hasRoleSelectorInBytecode = bytecode.includes("91d14854");
  const getRoleAdminSelectorInBytecode = bytecode.includes("248a9ca3");

  if (hasRoleSelectorInBytecode || getRoleAdminSelectorInBytecode) {
    usesRBAC = true;

    for (const r of STANDARD_ROLES) {
      const holders: string[] = [];

      // Check if detectedOwner has this role
      if (detectedOwner) {
        try {
          const paddedAddr = detectedOwner.toLowerCase().replace("0x", "").padStart(64, "0");
          const callData = `${SELECTORS.hasRole}${r.hash.replace("0x", "")}${paddedAddr}`;
          const res = await client.call({
            to: normalizedTarget,
            data: callData as `0x${string}`,
          });
          if (res.data && parseInt(res.data, 16) === 1) {
            holders.push(detectedOwner);
          }
        } catch {
          // ignore
        }
      }

      // Check if proxy admin has this role
      if (proxyAdminAddress && proxyAdminAddress !== detectedOwner) {
        try {
          const paddedAddr = proxyAdminAddress.toLowerCase().replace("0x", "").padStart(64, "0");
          const callData = `${SELECTORS.hasRole}${r.hash.replace("0x", "")}${paddedAddr}`;
          const res = await client.call({
            to: normalizedTarget,
            data: callData as `0x${string}`,
          });
          if (res.data && parseInt(res.data, 16) === 1) {
            holders.push(proxyAdminAddress);
          }
        } catch {
          // ignore
        }
      }

      recognizedRoles.push({
        roleName: r.name,
        roleHash: r.hash,
        confirmedHolders: holders,
      });
    }
  }

  // 6. Deep Profile Detected Admin Accounts (EOA vs Multisig vs Timelock)
  const candidateAccounts = new Set<string>();
  if (detectedOwner) candidateAccounts.add(detectedOwner);
  if (proxyAdminAddress) candidateAccounts.add(proxyAdminAddress);

  for (const acct of candidateAccounts) {
    let accountType: AdminAccount["accountType"] = "Unknown";
    let multisigDetails: AdminAccount["multisigDetails"] | undefined;
    let timelockDetails: AdminAccount["timelockDetails"] | undefined;

    const acctCode = await client.getBytecode({ address: acct as `0x${string}` });
    const isAcctContract = !!acctCode && acctCode.length > 2;

    if (!isAcctContract) {
      accountType = "EOA";
    } else {
      // Check Safe multisig
      let isSafe = false;
      try {
        const thresholdRes = await client.call({
          to: acct as `0x${string}`,
          data: SELECTORS.getThreshold as `0x${string}`,
        });
        if (thresholdRes.data && thresholdRes.data !== "0x") {
          const threshold = parseInt(thresholdRes.data, 16);
          if (threshold > 0 && threshold <= 50) {
            isSafe = true;
            multisigDetails = {
              threshold,
              ownersCount: 0,
              owners: [],
            };

            // Call getOwners()
            try {
              const ownersRes = await client.call({
                to: acct as `0x${string}`,
                data: SELECTORS.getOwners as `0x${string}`,
              });
              if (ownersRes.data && ownersRes.data.length >= 130) {
                // Decode address array
                const countHex = ownersRes.data.slice(66, 130);
                const count = parseInt(countHex, 16);
                if (count > 0 && count <= 50) {
                  multisigDetails.ownersCount = count;
                  const ownersList: string[] = [];
                  for (let i = 0; i < count; i++) {
                    const start = 130 + i * 64;
                    const chunk = ownersRes.data.slice(start, start + 64);
                    const parsed = cleanAddressFromHex("0x" + chunk);
                    if (parsed) ownersList.push(parsed);
                  }
                  multisigDetails.owners = ownersList;
                }
              }
            } catch {
              // getOwners array decode fallback
            }
          }
        }
      } catch {
        // Not a safe
      }

      if (isSafe) {
        accountType = "Safe Multisig";
      } else {
        // Check Timelock
        try {
          const minDelayRes = await client.call({
            to: acct as `0x${string}`,
            data: SELECTORS.getMinDelay as `0x${string}`,
          });
          if (minDelayRes.data && minDelayRes.data !== "0x") {
            const minDelay = parseInt(minDelayRes.data, 16);
            timelockDetails = { minDelaySeconds: minDelay };
            accountType = "Timelock";
          } else {
            accountType = "Contract";
          }
        } catch {
          accountType = "Contract";
        }
      }
    }

    const assignedRoles: string[] = [];
    if (acct === detectedOwner) assignedRoles.push("Contract Owner");
    if (acct === proxyAdminAddress) assignedRoles.push("Proxy Admin");

    for (const r of recognizedRoles) {
      if (r.confirmedHolders.includes(acct)) {
        assignedRoles.push(r.roleName);
      }
    }

    admins.push({
      address: acct,
      label:
        accountType === "Safe Multisig"
          ? `Gnosis/Safe Multisig (${multisigDetails?.threshold || 1}-of-${multisigDetails?.ownersCount || "N"})`
          : accountType === "Timelock"
          ? `Timelock Controller (${timelockDetails?.minDelaySeconds || 0}s delay)`
          : accountType === "EOA"
          ? "Single Private Key (EOA)"
          : "Smart Contract Controller",
      accountType,
      multisigDetails,
      timelockDetails,
      roles: assignedRoles,
      isDirectController: true,
    });
  }

  // 7. Synthesize Governance Assessment & Discrepancies
  const primaryAdmin = admins.find((a) => a.roles.includes("Contract Owner")) || admins[0];
  const isControlledByEOA = primaryAdmin?.accountType === "EOA";
  const isControlledByMultisig = primaryAdmin?.accountType === "Safe Multisig";
  const isControlledByTimelock = primaryAdmin?.accountType === "Timelock";

  let decentralizationScore = 75; // baseline
  let adminRiskLevel: PermissionReport["adminRiskLevel"] = "Moderate";
  let discrepancyAlert: string | undefined;

  // Upgradeability findings
  if (implAddress) {
    findings.push({
      id: "proxy-upgradeable",
      category: "Upgradeability",
      title: `${proxyType} Pattern Confirmed`,
      description: `Contract delegates execution to implementation at ${implAddress}. Logic can be replaced by the authorized admin.`,
      confidence: "Confirmed",
      severity: isControlledByEOA ? "Critical" : "Moderate",
      evidence: `Storage slot ${ERC1967_IMPLEMENTATION_SLOT} holds non-zero address ${implAddress}`,
      limitations: "Implementation code must be reviewed independently for internal logic hazards.",
    });

    if (proxyAdminAddress) {
      const adminIsEOA = admins.find((a) => a.address === proxyAdminAddress)?.accountType === "EOA";
      findings.push({
        id: "proxy-admin",
        category: "Upgradeability",
        title: `Proxy Admin Controller: ${proxyAdminAddress}`,
        description: adminIsEOA
          ? "The proxy admin is a single Externally Owned Account (EOA). A single compromised key can replace all contract logic immediately."
          : `The proxy admin is a contract (${admins.find((a) => a.address === proxyAdminAddress)?.accountType || "Contract"}).`,
        confidence: "Confirmed",
        severity: adminIsEOA ? "Critical" : "Info",
        evidence: `Slot ${ERC1967_ADMIN_SLOT} decoded to ${proxyAdminAddress}`,
      });

      if (adminIsEOA) {
        discrepancyAlert = "CRITICAL DISCREPANCY: Upgrade authority is held by an unconstrained single private key (EOA). Any advertised decentralization is bypassed by instantaneous contract upgrade power.";
      }
    }
  } else {
    findings.push({
      id: "immutable-code",
      category: "Upgradeability",
      title: "No Standard ERC-1967 Proxy Slots Detected",
      description: "Standard proxy storage slots are empty. Contract appears immutable unless non-standard or custom delegatecall logic exists.",
      confidence: "Likely",
      severity: "Safe",
      evidence: "ERC-1967 slots (Implementation, Admin, Beacon) contain zero values.",
      limitations: "Custom delegatecall or non-standard proxy architectures (e.g. older custom storage slots) cannot be ruled out purely via standard slots.",
    });
  }

  // Ownership findings
  if (detectedOwner) {
    const ownerIsEOA = isControlledByEOA;
    findings.push({
      id: "detected-owner",
      category: "Ownership",
      title: `Contract Owner Exposed: ${detectedOwner}`,
      description: `Owner resolved via ${ownerSource}. ${
        ownerIsEOA
          ? "Owner is a single private key (EOA), representing a single point of failure."
          : `Owner is a smart contract (${primaryAdmin?.accountType || "Contract"}).`
      }`,
      confidence: "Confirmed",
      severity: ownerIsEOA ? "High" : "Safe",
      evidence: `${ownerSource} returned ${detectedOwner}`,
    });
  } else {
    findings.push({
      id: "unverified-owner",
      category: "Ownership",
      title: "No Standard Ownership Interface Exposed",
      description: "Neither owner(), getOwner(), nor admin() responded with a valid address. Contract may use custom permissions or be un-owned.",
      confidence: "Unverified",
      severity: "Info",
      evidence: "Standard owner selectors returned 0x or reverted.",
      limitations: "Contract could still enforce permission checks using internal mappings, custom getter functions, or hardcoded addresses in bytecode.",
    });
  }

  // Pausability findings
  if (isPausable) {
    findings.push({
      id: "pausable-control",
      category: "Pausability",
      title: `Emergency Control: Contract is Pausable (${pauseFunctionsDetected.join(", ")})`,
      description: isCurrentlyPaused
        ? "ALERT: The contract is CURRENTLY PAUSED on-chain. Key operational methods may be blocked."
        : "The contract contains emergency stop / pause mechanisms. If triggered by an admin, user interactions may be suspended.",
      confidence: "Confirmed",
      severity: isCurrentlyPaused ? "High" : isControlledByEOA ? "Moderate" : "Info",
      evidence: `Bytecode contains selectors for ${pauseFunctionsDetected.join(", ")}. Active state: paused() = ${isCurrentlyPaused}`,
      limitations: "Bytecode analysis confirms the presence of pause dispatches, but exact restrictions depend on contract modifier enforcement.",
    });
  }

  // RBAC findings
  if (usesRBAC) {
    findings.push({
      id: "rbac-detected",
      category: "RBAC",
      title: "Role-Based Access Control (AccessControl) Detected",
      description: "Contract incorporates granular role-based permissions (DEFAULT_ADMIN_ROLE, PAUSER_ROLE, etc.).",
      confidence: "Confirmed",
      severity: "Safe",
      evidence: "Bytecode matches OpenZeppelin AccessControl function selectors hasRole() and getRoleAdmin().",
    });
  }

  // Calculate Decentralization Score & Risk Level
  if (isControlledByEOA && implAddress) {
    decentralizationScore = 25;
    adminRiskLevel = "Critical";
  } else if (isControlledByEOA && isPausable) {
    decentralizationScore = 45;
    adminRiskLevel = "High";
  } else if (isControlledByEOA) {
    decentralizationScore = 55;
    adminRiskLevel = "Moderate";
  } else if (isControlledByMultisig) {
    decentralizationScore = 85;
    adminRiskLevel = "Low";
  } else if (isControlledByTimelock) {
    decentralizationScore = 95;
    adminRiskLevel = "Low";
  } else if (!implAddress && !detectedOwner) {
    decentralizationScore = 90;
    adminRiskLevel = "Low";
  }

  return {
    targetContract: normalizedTarget,
    contractName: isContract ? `Contract [${normalizedTarget.slice(0, 6)}...${normalizedTarget.slice(-4)}]` : "EOA Account",
    isContract,
    bytecodeSize,
    analyzedAt: new Date().toISOString(),
    decentralizationScore,
    adminRiskLevel,
    discrepancyAlert,
    owner: detectedOwner
      ? {
          address: detectedOwner,
          detectedVia: ownerSource,
          isEOA: isControlledByEOA,
        }
      : undefined,
    proxyDetails: {
      isProxy: !!implAddress,
      proxyType,
      implementationAddress: implAddress,
      adminAddress: proxyAdminAddress,
      beaconAddress,
    },
    pausableDetails: {
      isPausable,
      isCurrentlyPaused,
      pauseFunctionsDetected,
      controllerLabel: detectedOwner || proxyAdminAddress,
    },
    rbacDetails: {
      usesRBAC,
      recognizedRoles,
    },
    governanceDetails: {
      isControlledByMultisig,
      isControlledByTimelock,
      isControlledByEOA,
      primaryController: primaryAdmin,
    },
    admins,
    findings,
    storageSlotsChecked,
  };
}
