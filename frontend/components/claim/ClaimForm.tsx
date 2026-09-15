"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { claimPhoto, ApiError } from "@/lib/api";
import { scoreColor, formatTimestamp, truncate } from "@/lib/utils";
import type { Photo } from "@/types";
import Image from "next/image";
import confetti from "canvas-confetti";

interface ClaimFormProps {
  tokenId: string;
  photo: Photo | null;
  loadError: string | null;
}

export function ClaimForm({ tokenId, photo, loadError }: ClaimFormProps) {
  const { address, isConnected } = useAccount();
  const [status, setStatus] = useState<"idle" | "claiming" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleClaim = async () => {
    if (!address) return;
    setStatus("claiming");
    setErrorMsg("");

    try {
      const result = await claimPhoto(tokenId, address);
      if (result.success) {
        setStatus("success");
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
          colors: ["#ffffff", "#a1a1aa", "#71717a"],
        });
      } else {
        setStatus("error");
        if (result.errorCode === "already_claimed") {
          setErrorMsg("This NFT has already been claimed.");
        } else if (result.errorCode === "contract_not_deployed") {
          setErrorMsg("Contract not yet deployed — try again later.");
        } else {
          setErrorMsg(result.message ?? "Claim failed. Please try again.");
        }
      }
    } catch (e) {
      setStatus("error");
      if (e instanceof ApiError) {
        setErrorMsg(e.message ?? "Claim failed. Please try again.");
      } else {
        setErrorMsg("An unexpected error occurred.");
      }
    }
  };

  if (status === "success") {
    return (
      <div className="text-center space-y-4 py-8">
        <div className="text-5xl">✓</div>
        <h2 className="text-2xl font-bold text-white">NFT claimed to your wallet!</h2>
        <p className="text-zinc-400 text-sm">
          Token #{tokenId} has been sent to{" "}
          <span className="font-mono text-zinc-200">
            {address?.slice(0, 6)}…{address?.slice(-4)}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
          Could not load photo details.
        </div>
      )}

      {photo && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden">
          <div className="relative aspect-video bg-zinc-900">
            <Image
              src={`https://ipfs.io/ipfs/${photo.ipfsCid}`}
              alt={`Photo #${tokenId}`}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">
                #{tokenId} · {formatTimestamp(photo.timestamp)}
              </span>
              {(() => {
                const { bg, text, label } = scoreColor(photo.authenticityScore);
                return (
                  <Badge className={`${bg} ${text}`}>
                    {photo.authenticityScore} · {label}
                  </Badge>
                );
              })()}
            </div>
            <p className="text-xs text-zinc-500 font-mono">
              {truncate(photo.deviceId, 30)}
            </p>
          </div>
        </div>
      )}

      <Separator className="bg-zinc-800" />

      {!isConnected ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-zinc-400 text-center">
            Connect your wallet to claim this NFT
          </p>
          <ConnectButton />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">
            Claiming to:{" "}
            <span className="font-mono text-zinc-300">
              {address?.slice(0, 6)}…{address?.slice(-4)}
            </span>
          </p>

          {status === "error" && (
            <div className="rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-400">
              {errorMsg}
            </div>
          )}

          <Button
            onClick={handleClaim}
            disabled={status === "claiming"}
            className="w-full bg-white text-black hover:bg-zinc-200 font-medium"
            size="lg"
          >
            {status === "claiming" ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin inline-block h-4 w-4 border-2 border-black border-t-transparent rounded-full" />
                Claiming…
              </span>
            ) : (
              "Claim NFT"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
