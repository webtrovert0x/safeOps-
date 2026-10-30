import { defineChain } from "viem";

export const botchain = defineChain({
  id: 677,
  name: "Botchain Mainnet",
  nativeCurrency: {
    name: "BOT",
    symbol: "BOT",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.botchain.ai"],
    },
    public: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.botchain.ai"],
    },
  },
  blockExplorers: {
    default: {
      name: "BotchainScan",
      url: process.env.NEXT_PUBLIC_EXPLORER_URL || "https://scan.botchain.ai",
    },
  },
  testnet: false,
});

export const bohrTestnet = botchain;
export const bohrChain = botchain;
