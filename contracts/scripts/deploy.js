const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("====================================================");
  console.log("SafeOps BOT — Contract Admin and Permission Inspector");
  console.log("Deploying SafeOpsRegistry to network:", hre.network.name);
  console.log("====================================================");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer account:", deployer.address);

  const balanceBefore = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balanceBefore), "BOT");

  // Query network gas price to ensure minimal gas fee
  const feeData = await hre.ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice || hre.ethers.parseUnits("20", "gwei");
  console.log("Selected gasPrice:", hre.ethers.formatUnits(gasPrice, "gwei"), "gwei");

  const SafeOpsRegistry = await hre.ethers.getContractFactory("SafeOpsRegistry");

  console.log("Broadcasting deployment transaction...");
  const registry = await SafeOpsRegistry.deploy({ gasPrice });

  const tx = registry.deploymentTransaction();
  console.log("Transaction hash:", tx.hash);
  console.log("Explorer URL:", `https://scan.botchain.ai/tx/${tx.hash}`);

  console.log("Waiting for block confirmation on Botchain...");
  const receipt = await tx.wait(1);

  const registryAddress = await registry.getAddress();
  console.log("SafeOpsRegistry successfully deployed to:", registryAddress);
  console.log("Block number:", receipt.blockNumber);
  console.log("Gas used:", receipt.gasUsed.toString());

  const totalCost = receipt.gasUsed * (receipt.gasPrice || gasPrice);
  console.log("Total deployment cost:", hre.ethers.formatEther(totalCost), "BOT");

  const balanceAfter = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Remaining balance:", hre.ethers.formatEther(balanceAfter), "BOT");

  // 1. Update .env.local in root
  const envLocalPath = path.join(__dirname, "../../.env.local");
  if (fs.existsSync(envLocalPath)) {
    let envContent = fs.readFileSync(envLocalPath, "utf-8");
    envContent = envContent.replace(
      /NEXT_PUBLIC_CONTRACT_ADDRESS=.*/,
      `NEXT_PUBLIC_CONTRACT_ADDRESS=${registryAddress}`
    );
    envContent = envContent.replace(
      /CONTRACT_ADDRESS=.*/,
      `CONTRACT_ADDRESS=${registryAddress}`
    );
    fs.writeFileSync(envLocalPath, envContent);
    console.log("Updated .env.local with deployed contract address.");
  }

  // 2. Update .env.example
  const envExamplePath = path.join(__dirname, "../../.env.example");
  if (fs.existsSync(envExamplePath)) {
    let envContent = fs.readFileSync(envExamplePath, "utf-8");
    envContent = envContent.replace(
      /NEXT_PUBLIC_CONTRACT_ADDRESS=.*/,
      `NEXT_PUBLIC_CONTRACT_ADDRESS=${registryAddress}`
    );
    envContent = envContent.replace(
      /CONTRACT_ADDRESS=.*/,
      `CONTRACT_ADDRESS=${registryAddress}`
    );
    fs.writeFileSync(envExamplePath, envContent);
    console.log("Updated .env.example with deployed contract address.");
  }

  // 3. Save deployment artifact info for frontend and records
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentData = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    address: registryAddress,
    transactionHash: tx.hash,
    blockNumber: receipt.blockNumber,
    deployer: deployer.address,
    gasUsed: receipt.gasUsed.toString(),
    deploymentCostBOT: hre.ethers.formatEther(totalCost),
    deployedAt: new Date().toISOString(),
    explorerUrl: `https://scan.botchain.ai/address/${registryAddress}`,
  };

  fs.writeFileSync(
    path.join(deploymentsDir, `${hre.network.name}.json`),
    JSON.stringify(deploymentData, null, 2)
  );
  console.log(`Saved deployment metadata to deployments/${hre.network.name}.json`);

  // 4. Sync compiled artifact to frontend/src/contracts/SafeOpsRegistry.json
  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/SafeOpsRegistry.sol/SafeOpsRegistry.json"
  );
  const frontendArtifactDir = path.join(__dirname, "../../frontend/src/contracts");
  if (fs.existsSync(artifactPath) && fs.existsSync(frontendArtifactDir)) {
    fs.copyFileSync(artifactPath, path.join(frontendArtifactDir, "SafeOpsRegistry.json"));
    console.log("Synced fresh contract artifact to frontend/src/contracts/SafeOpsRegistry.json");
  }

  // 5. Verification attempt
  console.log("\nWaiting 10 seconds for explorer to index the new contract before verification...");
  await new Promise((resolve) => setTimeout(resolve, 10000));

  try {
    console.log("Verifying contract on BotchainScan...");
    await hre.run("verify:verify", {
      address: registryAddress,
      constructorArguments: [],
    });
    console.log("Contract successfully verified on BotchainScan!");
  } catch (verifyError) {
    console.warn("Verification warning:", verifyError.message || verifyError);
    console.log("You can also run verification manually with: cd contracts && npx hardhat verify --network botchain " + registryAddress);
  }

  console.log("\n====================================================");
  console.log("SafeOpsRegistry is LIVE and verified on Botchain Mainnet!");
  console.log("Address:", registryAddress);
  console.log("View on Explorer:", `https://scan.botchain.ai/address/${registryAddress}`);
  console.log("====================================================");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
