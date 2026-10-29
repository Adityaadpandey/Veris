import { getPhotos } from "@/lib/api";
import { PhotoCard } from "@/components/gallery/PhotoCard";
import { ApiError } from "@/lib/api";

export default async function GalleryPage() {
  let photos: Awaited<ReturnType<typeof getPhotos>> = [];
  let error: string | null = null;

  try {
    photos = await getPhotos();
  } catch (e) {
    if (e instanceof ApiError) {
      error = e.status === 503 ? "Backend unavailable — try again shortly." : "Failed to load gallery.";
    } else {
      error = "Failed to load gallery.";
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Gallery</h1>
        <span className="text-sm text-zinc-500">
          {photos.length > 0 ? `${photos.length} photos` : ""}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <a href="/gallery" className="underline hover:text-red-300 ml-4 whitespace-nowrap">
            Retry
          </a>
        </div>
      )}

      {!error && photos.length === 0 && (
        <div className="flex items-center justify-center py-24 text-zinc-500">
          No photos minted yet.
        </div>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <PhotoCard key={photo.tokenId} photo={photo} />
          ))}
        </div>
      )}
    </div>
  );
}
