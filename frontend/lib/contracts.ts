import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import VerisABI from "@/lib/abi/Veris.json";

export const VERIS_ABI = VerisABI;

export const CONTRACT_ADDRESS = process.env
  .NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` | undefined;

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});
