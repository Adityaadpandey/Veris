import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { WalletProvider } from "@/components/providers/WalletProvider";
import { Navbar } from "@/components/layout/Navbar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "LensMint — Every photo, provably real",
  description:
    "Cryptographic proof of photo authenticity on the blockchain. Verify, claim, and own your authentic moments.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read nonce set by proxy.ts so this layout is dynamic (not statically cached).
  // Nonce is available for future <Script nonce={_nonce}> tags.
  const _nonce = (await headers()).get("x-nonce") ?? "";

  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-black text-white antialiased font-sans">
        <WalletProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-zinc-800 py-6 text-center text-sm text-zinc-500">
            LensMint © 2026
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
