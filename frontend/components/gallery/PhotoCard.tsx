import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { scoreColor, formatTimestamp, truncate } from "@/lib/utils";
import type { Photo } from "@/types";

export function PhotoCard({ photo }: { photo: Photo }) {
  const { bg, text, label } = scoreColor(photo.authenticityScore);

  return (
    <Link href={`/verify?tokenId=${photo.tokenId}`}>
      <Card className="border-zinc-800 bg-zinc-950 overflow-hidden hover:border-zinc-600 transition-colors cursor-pointer">
        <div className="relative aspect-square bg-zinc-900">
          <Image
            src={`https://ipfs.io/ipfs/${photo.ipfsCid}`}
            alt={`Photo #${photo.tokenId}`}
            fill
            className="object-cover"
            unoptimized
          />
          <div className="absolute top-2 right-2">
            <Badge className={`${bg} ${text} font-medium text-xs`}>
              {photo.authenticityScore} · {label}
            </Badge>
          </div>
        </div>
        <CardContent className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>#{photo.tokenId}</span>
            <span>{formatTimestamp(photo.timestamp)}</span>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-xs text-zinc-400 font-mono truncate">
                  {truncate(photo.deviceId, 12)}
                </p>
              </TooltipTrigger>
              <TooltipContent className="bg-zinc-900 text-white border-zinc-700">
                <p className="font-mono text-xs">{photo.deviceId}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardContent>
      </Card>
    </Link>
  );
}
