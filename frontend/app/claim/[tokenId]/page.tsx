"use client";

import { use, useEffect, useState } from "react";
import { getPhoto, ApiError } from "@/lib/api";
import { ClaimForm } from "@/components/claim/ClaimForm";
import type { Photo } from "@/types";

interface PageProps {
  params: Promise<{ tokenId: string }>;
}

export default function ClaimPage({ params }: PageProps) {
  const { tokenId } = use(params);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getPhoto(tokenId)
      .then(setPhoto)
      .catch((e) => {
        setLoadError(
          e instanceof ApiError ? e.message : "Failed to load photo."
        );
      });
  }, [tokenId]);

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-white">LensMint</h1>
        <p className="mt-1 text-sm text-zinc-400">Claim Your Photo NFT</p>
      </div>

      <ClaimForm tokenId={tokenId} photo={photo} loadError={loadError} />
    </div>
  );
}
