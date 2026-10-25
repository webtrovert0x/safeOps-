// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SafeOpsRegistry
 * @dev On-chain registry for SafeOps BOT - Contract Admin and Permission Inspector.
 * Records user inspection requests (gas only) and anchors administrative permission analyses.
 */
contract SafeOpsRegistry {
    // Inspection request record
    struct InspectionRecord {
        uint256 checkCount;
        uint256 firstCheckedAt;
        uint256 lastCheckedAt;
        bool hasAnchoredReport;
        bytes32 reportHash;
        uint8 decentralizationScore; // 0 to 100
        uint8 adminRiskLevel;        // 0 = Low, 1 = Moderate, 2 = High, 3 = Critical
        string summaryUri;           // IPFS CID or metadata reference
    }

    address public owner;
    
    // contract address => inspection record
    mapping(address => InspectionRecord) private _inspections;
    
    // contract address => list of requester addresses
    mapping(address => address[]) private _requesters;

    // Track all unique inspected target contracts
    address[] private _allInspectedContracts;
    mapping(address => bool) private _isContractTracked;

    // Total check transactions recorded across the protocol
    uint256 public totalChecksRecorded;

    // Events
    event InspectionRequested(
        address indexed targetContract,
        address indexed requester,
        uint256 totalContractChecks,
        uint256 timestamp,
        string notes
    );

    event ReportAnchored(
        address indexed targetContract,
        address indexed reporter,
        bytes32 reportHash,
        uint8 decentralizationScore,
        uint8 adminRiskLevel,
        string summaryUri,
        uint256 timestamp
    );

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "SafeOpsRegistry: caller is not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    /**
     * @notice Records an inspection check for a target contract.
     * @dev Gas-only payment model. No protocol fee is charged.
     * @param targetContract The deployed address being inspected.
     * @param notes Optional notes or client identifier.
     */
    function recordCheck(address targetContract, string calldata notes) external {
        require(targetContract != address(0), "Invalid target address");

        InspectionRecord storage record = _inspections[targetContract];

        if (record.checkCount == 0) {
            record.firstCheckedAt = block.timestamp;
            if (!_isContractTracked[targetContract]) {
                _isContractTracked[targetContract] = true;
                _allInspectedContracts.push(targetContract);
            }
        }

        record.checkCount += 1;
        record.lastCheckedAt = block.timestamp;
        _requesters[targetContract].push(msg.sender);
        totalChecksRecorded += 1;

        emit InspectionRequested(
            targetContract,
            msg.sender,
            record.checkCount,
            block.timestamp,
            notes
        );
    }

    /**
     * @notice Anchors verified permission inspection findings on-chain.
     * @param targetContract The contract address analyzed.
     * @param reportHash Cryptographic digest of the comprehensive findings report.
     * @param decentralizationScore 0-100 metric reflecting governance decentralization.
     * @param adminRiskLevel Risk rating (0=Low, 1=Moderate, 2=High, 3=Critical).
     * @param summaryUri Reference URI or IPFS hash containing full breakdown.
     */
    function anchorReport(
        address targetContract,
        bytes32 reportHash,
        uint8 decentralizationScore,
        uint8 adminRiskLevel,
        string calldata summaryUri
    ) external {
        require(targetContract != address(0), "Invalid target address");
        require(decentralizationScore <= 100, "Score exceeds 100");
        require(adminRiskLevel <= 3, "Invalid risk level");

        InspectionRecord storage record = _inspections[targetContract];
        if (record.checkCount == 0) {
            record.firstCheckedAt = block.timestamp;
            if (!_isContractTracked[targetContract]) {
                _isContractTracked[targetContract] = true;
                _allInspectedContracts.push(targetContract);
            }
            record.checkCount = 1;
        }

        record.lastCheckedAt = block.timestamp;
        record.hasAnchoredReport = true;
        record.reportHash = reportHash;
        record.decentralizationScore = decentralizationScore;
        record.adminRiskLevel = adminRiskLevel;
        record.summaryUri = summaryUri;

        emit ReportAnchored(
            targetContract,
            msg.sender,
            reportHash,
            decentralizationScore,
            adminRiskLevel,
            summaryUri,
            block.timestamp
        );
    }

    /**
     * @notice Get full inspection record for a contract.
     */
    function getInspection(address targetContract)
        external
        view
        returns (InspectionRecord memory record, uint256 requesterCount)
    {
        return (_inspections[targetContract], _requesters[targetContract].length);
    }

    /**
     * @notice Returns total unique contracts ever inspected.
     */
    function getTotalUniqueContracts() external view returns (uint256) {
        return _allInspectedContracts.length;
    }

    /**
     * @notice Returns paginated list of all inspected contracts.
     */
    function getInspectedContracts(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory contracts)
    {
        uint256 total = _allInspectedContracts.length;
        if (offset >= total) {
            return new address[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        uint256 resultLength = end - offset;
        contracts = new address[](resultLength);
        for (uint256 i = 0; i < resultLength; i++) {
            contracts[i] = _allInspectedContracts[offset + i];
        }
    }

    /**
     * @notice Returns recent requesters for a specific contract.
     */
    function getRecentRequesters(address targetContract, uint256 limit)
        external
        view
        returns (address[] memory requesters)
    {
        address[] storage all = _requesters[targetContract];
        uint256 total = all.length;
        if (total == 0 || limit == 0) {
            return new address[](0);
        }

        uint256 count = limit > total ? total : limit;
        requesters = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            requesters[i] = all[total - 1 - i];
        }
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner is zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
