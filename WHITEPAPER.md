# SafeOps BOT — Whitepaper
### Contract Admin & Permission Inspector: Verifying Decentralization, Administrative Power, and Control Structures

![SafeOps BOT Logo](assets/logo.png)

**Document Version:** 1.0.0  
**Status:** Mainnet Deployment Active  
**Target Chain:** Botchain Mainnet (Chain ID: `677`, Native Token: `BOT`)  
**Active Contract Address:** [`0x098D204F9F93f855a15Ea72D5d85b7df1FFd2974`](https://scan.botchain.ai/address/0x098D204F9F93f855a15Ea72D5d85b7df1FFd2974)  
**Authors:** SafeOps Core Protocol Team  

---

## Abstract

Smart contracts are often celebrated for being trustless and immutable, yet a substantial majority of modern decentralized finance (DeFi) protocols and token ecosystems retain privileged administrative backdoors. These include single-key proxy upgrade authority, arbitrary token minting, fee diversion, and emergency pause mechanisms. While standard smart contract vulnerability scanners focus on syntactic flaws such as reentrancy or integer overflows, they frequently overlook the **systemic centralization risk** posed by the accounts holding the administrative keys.

**SafeOps BOT** is a purpose-built on-chain audit and inspection protocol designed to examine **who controls a contract and what those administrators are empowered to do**. By interrogating low-level EVM storage slots, bytecode function dispatchers, role-based access control mappings, and controller account architectures (distinguishing single Externally Owned Accounts from Gnosis/Safe multisigs and Timelock controllers), SafeOps exposes hidden centralization bottlenecks and flags critical governance discrepancies. Inspection records and cryptographic audit digests are permanently anchored on Botchain Mainnet via `SafeOpsRegistry.sol` under a gas-only user model.

---

## 1. Introduction & The Core Problem

### 1.1 The Decentralization Dilemma
A recurring issue in Web3 security is the gap between advertised decentralization and actual on-chain control:
- A protocol may market itself as a community-governed DAO while an unconstrained **single Externally Owned Account (EOA)** retains the private key required to upgrade the proxy contract logic or drain user deposits.
- Emergency pause controls (`pause()`, `unpause()`) can freeze user collateral indefinitely without timelock delays or multi-signature thresholds.
- Token contracts may contain hidden mint or burn privileges assigned to non-governance developer wallets.

### 1.2 The Role of SafeOps BOT
Standard static analysis tools evaluate code safety under the assumption that the deployed bytecode is static and trustworthy. **SafeOps BOT** approaches security from an administrative and operational threat model:
1. **Who is the root authority?** (EOA private key, multisig, timelock, or autonomous code).
2. **What capabilities does this authority possess?** (Upgrades, pausing, role delegation, fee extraction).
3. **What is the structural degree of centralization?** (Quantified through an on-chain verifiable Decentralization Score).

---

## 2. System Architecture & Detection Engine

SafeOps BOT operates a modular, multi-tier inspection pipeline capable of analyzing arbitrary EVM contract addresses in real time.

```
                      +-----------------------------+
                      |   Target Smart Contract     |
                      +--------------+--------------+
                                     |
              +----------------------+----------------------+
              |                      |                      |
      [Storage Slots]       [Bytecode & Signatures]   [RPC View Calls]
      - ERC-1967 Impl       - Pausable Selectors      - owner()
      - ERC-1967 Admin      - AccessControl Roles     - getOwner()
      - ERC-1967 Beacon     - UUPS proxiableUUID      - paused()
              |                      |                      |
              +----------------------+----------------------+
                                     |
                       +-------------v-------------+
                       |    Controller Profiler    |
                       |  - EOA vs Contract        |
                       |  - Safe Multisig (m-of-n) |
                       |  - Timelock Delay Windows |
                       +-------------+-------------+
                                     |
                       +-------------v-------------+
                       |   Decentralization & Risk |
                       |        Scoring Engine     |
                       +-------------+-------------+
                                     |
         +---------------------------+---------------------------+
         |                                                       |
+--------v----------------------+             +------------------v---------+
| Frontend Command Center UI    |             | On-Chain Anchor Registry   |
| - Interactive Topology Flow   |             | (SafeOpsRegistry.sol)      |
| - Confirmed/Likely/Unknown    |             | - Gas-only check record    |
| - Discrepancy Warnings        |             | - Hash & score notarized   |
+-------------------------------+             +----------------------------+
```

### 2.1 Storage Slot Interrogation (ERC-1967 Proxies)
To determine if a contract is upgradeable, SafeOps queries standard storage slots defined in EIP-1967:
- **Implementation Slot:** `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`  
  Calculated as `bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)`. Non-zero values confirm that contract logic delegates execution to a secondary contract.
- **Admin Slot:** `0xb5352742e0d006000522c0a4417429076779a72985382624083cd20337765710`  
  Identifies the account authorized to trigger logic upgrades.
- **Beacon Slot:** `0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50`  
  Identifies beacon proxy patterns.

Additionally, bytecode is parsed for EIP-1822 UUPS `proxiableUUID()` (`0x52d1902d`) and EIP-2535 Diamond facets (`0x7a0ed627`).

### 2.2 Access Control & Ownership Hierarchy
SafeOps evaluates ownership semantics across standard interfaces:
- `owner()` (`0x8da5cb5b`)
- `getOwner()` (`0x893d20e8`)
- `admin()` (`0xf851a440`)

For OpenZeppelin `AccessControl` implementations, SafeOps queries `hasRole(bytes32,address)` (`0x91d14854`) and `getRoleAdmin(bytes32)` (`0x248a9ca3`) against recognized standard roles:
- `DEFAULT_ADMIN_ROLE` (`0x00...00`)
- `PAUSER_ROLE` (`keccak256("PAUSER_ROLE")`)
- `MINTER_ROLE` (`keccak256("MINTER_ROLE")`)
- `UPGRADER_ROLE` (`keccak256("UPGRADER_ROLE")`)

### 2.3 Controller Account Profiling (EOA vs. Multisig vs. Timelock)
When an administrative address is identified, SafeOps executes deep profiling:
1. **Externally Owned Account (EOA):** If `eth_getCode(address)` returns `0x`, the controller is a private key representing a **single point of failure**.
2. **Gnosis / Safe Multisig:** SafeOps probes `getThreshold()` (`0xe75235b8`) and `getOwners()` (`0xa0e67e2b`). If recognized, SafeOps extracts the threshold and signer list (e.g., 3-of-5 multisig), confirming collaborative custody.
3. **Timelock Controller:** SafeOps probes `getMinDelay()` (`0x19dfa94d`). If non-zero, upgrades and administrative calls cannot occur instantly, giving community members an exit window in the event of malicious governance proposals.

---

## 3. Confidence Classification Model

Smart contracts are implemented in diverse languages and custom architectures. SafeOps explicitly distinguishes between three confidence tiers:

| Tier | Definition | Examples |
| :--- | :--- | :--- |
| **Confirmed** | Supported by deterministic on-chain query returns or explicit storage slot matches. | Storage slot `0x3608...` containing target address; `owner()` returning valid address; active `paused() == true`. |
| **Likely** | Supported by bytecode opcode heuristics, function selectors, and standard pattern matching. | Bytecode includes `pause()` / `unpause()` selectors, but modifiers or internal state restrictions cannot be confirmed without transaction execution. |
| **Unverified / Unknown** | Opaque or custom permission logic that does not follow recognized open-source standards. | Private mapping storage variables without public getters; custom role registries; obfuscated bytecode. |

---

## 4. On-Chain Registry: `SafeOpsRegistry.sol`

`SafeOpsRegistry.sol` anchors permission analyses on Botchain, creating a verifiable and censorship-resistant audit trail.

### 4.1 Payment Model: Gas-Only
To democratize security intelligence, SafeOps charges **no protocol fee**. Users pay standard network gas fees only to submit check requests or anchor reports.

### 4.2 Core Smart Contract Interface
```solidity
struct InspectionRecord {
    uint256 checkCount;
    uint256 firstCheckedAt;
    uint256 lastCheckedAt;
    bool hasAnchoredReport;
    bytes32 reportHash;
    uint8 decentralizationScore; // 0 - 100
    uint8 adminRiskLevel;        // 0=Low, 1=Moderate, 2=High, 3=Critical
    string summaryUri;           // Reference URI
}

function recordCheck(address targetContract, string calldata notes) external;

function anchorReport(
    address targetContract,
    bytes32 reportHash,
    uint8 decentralizationScore,
    uint8 adminRiskLevel,
    string calldata summaryUri
) external;

function getInspection(address targetContract) 
    external 
    view 
    returns (InspectionRecord memory record, uint256 requesterCount);
```

---

## 5. Decentralization Scoring & Risk Matrix

SafeOps computes a **Decentralization Score (0 to 100)** based on key governance metrics:

```
Score Range:
  80 - 100 : Low Centralization Risk (Multisig with high threshold + Timelock + Immutable logic)
  50 - 79  : Moderate Centralization Risk (Multisig or Pausable contract with role segregation)
  25 - 49  : High Centralization Risk (Single EOA with emergency pause or minting authority)
  0  - 24  : Critical Centralization Risk (Single EOA holding direct, unconstrained proxy upgrade authority)
```

### 5.1 The Discrepancy Flag
If an inspected protocol displays governance branding while delegating proxy upgradeability or contract draining authority to an unconstrained single EOA, SafeOps triggers a high-visibility **Discrepancy Alert**, warning users that the protocol can be altered instantly by a single keyholder.

---

## 6. Botchain Mainnet Deployment Specifications

| Parameter | Value |
| :--- | :--- |
| **Network** | Botchain Mainnet |
| **Chain ID** | `677` |
| **Native Currency** | `BOT` |
| **RPC Endpoint** | `https://rpc.botchain.ai` |
| **Block Explorer** | `https://scan.botchain.ai` |
| **SafeOpsRegistry Contract** | `0x098D204F9F93f855a15Ea72D5d85b7df1FFd2974` |

---

## 7. Roadmap & Future Work

1. **Phase 1 (Complete):** Core permission inspection engine, ERC-1967 storage slot analysis, Safe multisig/timelock detection, Botchain deployment, and Next.js command center UI.
2. **Phase 2:** Historical event indexing to track permission alterations over time (`OwnershipTransferred`, `RoleGranted`, `RoleRevoked`, `Upgraded`).
3. **Phase 3:** Automated cross-chain scanning (Ethereum, Arbitrum, Base, Optimism) with unified anchoring to Botchain.
4. **Phase 4:** Deep integration with VerifyBOT for comprehensive 360-degree smart contract security auditing.

---

## 8. Conclusion

Decentralization is not a marketing buzzword; it is an on-chain reality that can be forensically measured. By inspecting proxy implementation storage, administrative roles, emergency pause levers, and multisig thresholds, **SafeOps BOT** brings transparency to smart contract custody and empowers users, investors, and security researchers to distinguish genuine decentralization from centralized control.

---
*SafeOps BOT is open-source and deployed on Botchain.*
