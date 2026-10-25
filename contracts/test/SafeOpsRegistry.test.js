const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SafeOpsRegistry", function () {
  let safeOpsRegistry;
  let owner, user1, user2;
  const target1 = "0x0000000000000000000000000000000000000001";
  const target2 = "0x0000000000000000000000000000000000000002";

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    const SafeOpsRegistryFactory = await ethers.getContractFactory("SafeOpsRegistry");
    safeOpsRegistry = await SafeOpsRegistryFactory.deploy();
  });

  it("should record inspection checks correctly (gas-only)", async function () {
    // User1 requests inspection of target1
    await expect(safeOpsRegistry.connect(user1).recordCheck(target1, "initial check"))
      .to.emit(safeOpsRegistry, "InspectionRequested")
      .withArgs(target1, user1.address, 1, (val) => val > 0, "initial check");

    let [record, reqCount] = await safeOpsRegistry.getInspection(target1);
    expect(record.checkCount).to.equal(1);
    expect(reqCount).to.equal(1);
    expect(record.hasAnchoredReport).to.be.false;

    // User2 checks the same contract (must pay gas and increments count)
    await safeOpsRegistry.connect(user2).recordCheck(target1, "follow up");
    [record, reqCount] = await safeOpsRegistry.getInspection(target1);
    expect(record.checkCount).to.equal(2);
    expect(reqCount).to.equal(2);

    expect(await safeOpsRegistry.totalChecksRecorded()).to.equal(2);
    expect(await safeOpsRegistry.getTotalUniqueContracts()).to.equal(1);
  });

  it("should anchor analysis report with decentralization & risk score", async function () {
    const reportHash = ethers.keccak256(ethers.toUtf8Bytes("admin-permissions-verified"));
    const score = 85;
    const riskLevel = 1; // Moderate
    const uri = "ipfs://QmSafeOpsReport123";

    await expect(
      safeOpsRegistry.anchorReport(target1, reportHash, score, riskLevel, uri)
    ).to.emit(safeOpsRegistry, "ReportAnchored");

    const [record] = await safeOpsRegistry.getInspection(target1);
    expect(record.hasAnchoredReport).to.be.true;
    expect(record.reportHash).to.equal(reportHash);
    expect(record.decentralizationScore).to.equal(score);
    expect(record.adminRiskLevel).to.equal(riskLevel);
    expect(record.summaryUri).to.equal(uri);
  });

  it("should support pagination and requester history", async function () {
    await safeOpsRegistry.connect(user1).recordCheck(target1, "check 1");
    await safeOpsRegistry.connect(user2).recordCheck(target2, "check 2");

    const contracts = await safeOpsRegistry.getInspectedContracts(0, 10);
    expect(contracts.length).to.equal(2);
    expect(contracts[0]).to.equal(target1);
    expect(contracts[1]).to.equal(target2);

    const requesters = await safeOpsRegistry.getRecentRequesters(target1, 5);
    expect(requesters.length).to.equal(1);
    expect(requesters[0]).to.equal(user1.address);
  });
});
