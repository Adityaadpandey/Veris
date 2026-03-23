"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { WALLET_ENABLED } from "@/components/providers/WalletProvider";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-black/80 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-white hover:text-zinc-300 transition-colors"
        >
          LensMint
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/gallery"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Gallery
          </Link>
          <Link
            href="/verify"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Verify
          </Link>
          {WALLET_ENABLED && (
            <ConnectButton
              showBalance={false}
              chainStatus="none"
              accountStatus="avatar"
            />
          )}
        </div>
      </nav>
    </header>
  );
}
