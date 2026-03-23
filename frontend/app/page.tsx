import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, ShieldCheck, Link2 } from "lucide-react";

const steps = [
  {
    icon: Camera,
    title: "Capture & Sign",
    description: "Photo is captured on device and cryptographically signed at the moment of creation.",
  },
  {
    icon: ShieldCheck,
    title: "AI Verify",
    description: "Our AI model scores the image for authenticity based on device attestation signals.",
  },
  {
    icon: Link2,
    title: "Blockchain Proof",
    description: "An immutable ERC-1155 token is minted on Base, creating a permanent on-chain record.",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center py-24 text-center gap-6">
        <div className="inline-flex items-center rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
          Powered by Base Sepolia · ERC-1155
        </div>
        <h1 className="text-5xl font-bold tracking-tight sm:text-7xl">
          Every photo,{" "}
          <span className="text-zinc-400">provably real</span>
        </h1>
        <p className="max-w-xl text-lg text-zinc-400">
          Cryptographic proof of authenticity, on-chain forever. No more questions about what&apos;s real.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button asChild size="lg" className="bg-white text-black hover:bg-zinc-200">
            <Link href="/verify">Verify a photo</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-white text-white hover:bg-white hover:text-black"
          >
            <Link href="/gallery">View gallery</Link>
          </Button>
        </div>
      </section>

      {/* 3-Step Flow */}
      <section className="pb-24">
        <h2 className="mb-10 text-center text-sm font-medium uppercase tracking-widest text-zinc-500">
          How it works
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {steps.map((step, i) => (
            <Card
              key={i}
              className="border-zinc-800 bg-zinc-950 text-white"
            >
              <CardContent className="flex flex-col gap-4 p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900">
                    <step.icon className="h-5 w-5 text-zinc-300" />
                  </div>
                  <span className="text-xs font-medium text-zinc-500">
                    Step {i + 1}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-white">{step.title}</h3>
                  <p className="mt-1 text-sm text-zinc-400">{step.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
