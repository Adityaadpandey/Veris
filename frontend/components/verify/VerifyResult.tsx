"use client";

import { motion } from "framer-motion";
import { CheckCircle, XCircle, ExternalLink, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { scoreColor, scoreTier, formatUnixTimestamp } from "@/lib/utils";

interface PhotoData {
  imageHash: `0x${string}`;
  authenticityScore: number;
  timestamp: bigint;
  deviceId: string;
  ipfsCid: string;
  minter: `0x${string}`;
}

interface VerifyResultProps {
  tokenId: string;
  data: PhotoData;
}

export function VerifyResult({ tokenId, data }: VerifyResultProps) {
  const [copied, setCopied] = useState(false);
  const { bg, text, label } = scoreColor(data.authenticityScore);
  const tier = scoreTier(data.authenticityScore);
  const isAuthentic = tier === "authentic";

  const copyHash = () => {
    navigator.clipboard.writeText(data.imageHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <Card className="border-zinc-800 bg-zinc-950 text-white">
        <CardContent className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            {isAuthentic ? (
              <CheckCircle className="h-10 w-10 text-green-400 flex-shrink-0" />
            ) : (
              <XCircle className="h-10 w-10 text-red-400 flex-shrink-0" />
            )}
            <div>
              <p className="text-sm text-zinc-400">Photo #{tokenId}</p>
              <h2 className="text-2xl font-bold">
                {isAuthentic ? "Verified Authentic" : "Authenticity Uncertain"}
              </h2>
            </div>
            <div className="ml-auto">
              <Badge className={`${bg} ${text} text-lg px-3 py-1 font-bold`}>
                {data.authenticityScore}
              </Badge>
              <p className="text-center text-xs text-zinc-500 mt-1">{label}</p>
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Metadata */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-zinc-500 mb-1">Device ID</p>
              <p className="font-mono text-zinc-200 break-all">{data.deviceId}</p>
            </div>
            <div>
              <p className="text-zinc-500 mb-1">Timestamp</p>
              <p className="text-zinc-200">{formatUnixTimestamp(data.timestamp)}</p>
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          {/* IPFS Link */}
          <div className="text-sm">
            <p className="text-zinc-500 mb-2">IPFS Image</p>
            <a
              href={`https://ipfs.io/ipfs/${data.ipfsCid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-zinc-200 hover:text-white transition-colors font-mono break-all"
            >
              {data.ipfsCid}
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
            </a>
          </div>

          {/* SHA-256 Hash */}
          <div className="text-sm">
            <p className="text-zinc-500 mb-2">SHA-256 Hash</p>
            <div className="flex items-start gap-2">
              <code className="flex-1 break-all rounded bg-zinc-900 p-3 text-xs text-zinc-300 font-mono">
                {data.imageHash}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={copyHash}
                className="text-zinc-400 hover:text-white flex-shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
