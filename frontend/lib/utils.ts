import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ScoreTier } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function scoreTier(score: number): ScoreTier {
  if (score > 80) return "authentic";
  if (score >= 60) return "uncertain";  // spec: < 60 is suspicious; 60 itself is uncertain
  return "suspicious";
}

export function scoreColor(score: number): { bg: string; text: string; label: string } {
  const tier = scoreTier(score);
  if (tier === "authentic") return { bg: "bg-white", text: "text-black", label: "Authentic" };
  if (tier === "uncertain") return { bg: "bg-zinc-700", text: "text-zinc-200", label: "Uncertain" };
  return { bg: "bg-red-950", text: "text-red-400", label: "Suspicious" };
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatUnixTimestamp(unix: number | bigint): string {
  const ms = Number(unix) * 1000;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "…";
}
