import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export function PhotoCardSkeleton() {
  return (
    <Card className="border-zinc-800 bg-zinc-950 overflow-hidden">
      <Skeleton className="aspect-square w-full bg-zinc-800" />
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-20 bg-zinc-800" />
          <Skeleton className="h-4 w-16 bg-zinc-800" />
        </div>
        <Skeleton className="h-4 w-32 bg-zinc-800" />
      </CardContent>
    </Card>
  );
}
