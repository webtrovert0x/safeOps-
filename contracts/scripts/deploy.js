const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("----------------------------------------------------");
  console.log("SafeOps BOT — Contract Admin and Permission Inspector");
  console.log("Deploying SafeOpsRegistry to network:", hre.network.name);
  console.log("----------------------------------------------------");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "BOT");

  const SafeOpsRegistry = await hre.ethers.getContractFactory("SafeOpsRegistry");
  const registry = await SafeOpsRegistry.deploy();
  await registry.waitForDeployment();

  const registryAddress = await registry.getAddress();
  console.log(" SafeOpsRegistry successfully deployed to:", registryAddress);

  // Update .env.local in root
  const envPath = path.join(__dirname, "../../.env.local");
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, "utf-8");
    envContent = envContent.replace(
      /NEXT_PUBLIC_CONTRACT_ADDRESS=.*/,
      `NEXT_PUBLIC_CONTRACT_ADDRESS=${registryAddress}`
    );
    envContent = envContent.replace(
      /CONTRACT_ADDRESS=.*/,
      `CONTRACT_ADDRESS=${registryAddress}`
    );
    fs.writeFileSync(envPath, envContent);
    console.log(" Updated .env.local with deployed contract address.");
  }

  // Save deployment artifact info for frontend
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentData = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    address: registryAddress,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(deploymentsDir, `${hre.network.name}.json`),
    JSON.stringify(deploymentData, null, 2)
  );

  console.log(" Deployment metadata saved to deployments/" + hre.network.name + ".json");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
