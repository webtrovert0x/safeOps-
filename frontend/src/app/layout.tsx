import type { Metadata } from "next";
import "./globals.css";
import Web3Provider from "@/context/Web3Provider";

export const metadata: Metadata = {
  title: "SafeOps BOT — Contract Admin and Permission Inspector",
  description:
    "Audit who controls a smart contract and what administrators are allowed to do. Deep administrative power, role, proxy upgradeability, and multisig governance analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
