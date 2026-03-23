import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import LensMintABI from "@/lib/abi/LensMint.json";

export const LENSMINT_ABI = LensMintABI;

export const CONTRACT_ADDRESS = process.env
  .NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` | undefined;

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});
