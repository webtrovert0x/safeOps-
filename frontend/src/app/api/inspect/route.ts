import { NextRequest, NextResponse } from "next/server";
import { inspectContractPermissions } from "@/lib/inspector";
import { isAddress } from "viem";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, rpcUrl } = body;

    if (!address || !isAddress(address)) {
      return NextResponse.json(
        { error: "Invalid Ethereum contract address format" },
        { status: 400 }
      );
    }

    const report = await inspectContractPermissions(address, rpcUrl);
    return NextResponse.json(report);
  } catch (error: any) {
    console.error("SafeOps inspection failed:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to inspect contract permissions",
      },
      { status: 500 }
    );
  }
}
