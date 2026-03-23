import { PhotoCardSkeleton } from "@/components/gallery/PhotoCardSkeleton";

export default function GalleryLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold">Gallery</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <PhotoCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
