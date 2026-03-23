"use client";

import { use, useState } from "react";
import { useReadContract } from "wagmi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VerifyResult } from "@/components/verify/VerifyResult";
import LensMintABI from "@/lib/abi/LensMint.json";

const CONTRACT_ADDRESS = process.env
  .NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` | undefined;

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function VerifyPage({ searchParams }: PageProps) {
  const params = use(searchParams);
  const rawTokenId = params.tokenId;
  const initialTokenId = Array.isArray(rawTokenId)
    ? rawTokenId[0]
    : rawTokenId;

  const [input, setInput] = useState(initialTokenId ?? "");
  const [tokenId, setTokenId] = useState(initialTokenId ?? "");

  // All hooks must be called unconditionally (Rules of Hooks).
  // CONTRACT_ADDRESS absence is handled via `enabled: false`, not an early return.
  const { data, isLoading, isError, error } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: LensMintABI,
    functionName: "getPhotoData",
    args: tokenId ? [BigInt(tokenId)] : undefined,
    query: {
      enabled: !!tokenId && !!CONTRACT_ADDRESS,
    },
  });

  type PhotoData = {
    imageHash: `0x${string}`;
    authenticityScore: number;
    timestamp: bigint;
    deviceId: string;
    ipfsCid: string;
    minter: `0x${string}`;
  };
  const photoData = data as PhotoData | undefined;

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = input.trim();
    if (clean) setTokenId(clean);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Verify Photo</h1>
        <p className="text-zinc-400 text-sm">
          Enter a token ID to verify its authenticity on-chain.
        </p>
      </div>

      {!CONTRACT_ADDRESS && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
          Contract not yet deployed on Base Sepolia.
        </div>
      )}

      <form onSubmit={handleVerify} className="flex gap-3">
        <Input
          type="number"
          min="1"
          placeholder="Token ID (e.g. 42)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="bg-zinc-950 border-zinc-700 text-white placeholder:text-zinc-600 focus:border-zinc-500"
        />
        <Button
          type="submit"
          disabled={!input.trim() || isLoading || !CONTRACT_ADDRESS}
          className="bg-white text-black hover:bg-zinc-200 font-medium"
        >
          {isLoading ? "Verifying…" : "Verify"}
        </Button>
      </form>

      {isLoading && (
        <div className="text-center text-zinc-500 text-sm animate-pulse">
          Reading from blockchain…
        </div>
      )}

      {isError && tokenId && (
        <div className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-400">
          {(error as Error)?.message?.includes("TokenDoesNotExist")
            ? `Token #${tokenId} does not exist.`
            : "Failed to read contract — check your connection."}
        </div>
      )}

      {photoData && tokenId && !isLoading && (
        <VerifyResult tokenId={tokenId} data={photoData} />
      )}
    </div>
  );
}
