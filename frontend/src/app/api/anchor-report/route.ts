import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http, keccak256, toHex, stringToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bohrTestnet } from "@/config/bohr";
import SafeOpsRegistryAbi from "@/contracts/SafeOpsRegistry.json";

export async function POST(req: NextRequest) {
  try {
    const { targetAddress, report } = await req.json();

    const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS;
    const privateKey = process.env.PRIVATE_KEY;

    if (!contractAddress || !privateKey) {
      return NextResponse.json(
        { error: "Server contract or private key not configured" },
        { status: 500 }
      );
    }

    const formattedKey = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
    const account = privateKeyToAccount(formattedKey);

    const client = createWalletClient({
      account,
      chain: bohrTestnet,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.bohr.life"),
    });

    const publicClient = createPublicClient({
      chain: bohrTestnet,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.bohr.life"),
    });

    const reportJson = JSON.stringify(report);
    const reportHash = keccak256(stringToBytes(reportJson));

    const riskLevels: Record<string, number> = {
      Low: 0,
      Moderate: 1,
      High: 2,
      Critical: 3,
    };

    const riskNum = riskLevels[report.adminRiskLevel] ?? 1;
    const score = Math.min(100, Math.max(0, report.decentralizationScore || 50));
    const summaryUri = `safeops://report/${reportHash.slice(0, 16)}`;

    const hash = await client.writeContract({
      address: contractAddress as `0x${string}`,
      abi: SafeOpsRegistryAbi.abi,
      functionName: "anchorReport",
      args: [targetAddress, reportHash, score, riskNum, summaryUri],
    });

    await publicClient.waitForTransactionReceipt({ hash });

    return NextResponse.json({
      success: true,
      transactionHash: hash,
      reportHash,
      explorerUrl: `${process.env.NEXT_PUBLIC_EXPLORER_URL || "https://scan.bohr.life"}/tx/${hash}`,
    });
  } catch (error: any) {
    console.error("Failed to anchor report:", error);
    return NextResponse.json(
      { error: error.message || "Failed to anchor report on-chain" },
      { status: 500 }
    );
  }
}
