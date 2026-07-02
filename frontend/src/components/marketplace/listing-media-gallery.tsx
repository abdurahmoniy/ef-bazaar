interface ListingMediaGalleryProps {
  title: string;
  urls: string[];
}

export function ListingMediaGallery({ title, urls }: ListingMediaGalleryProps) {
  const visibleUrls = urls.filter(Boolean).slice(0, 10);
  const [primaryUrl, ...thumbnailUrls] = visibleUrls;

  if (!primaryUrl) return null;

  return (
    <section className="grid gap-2 overflow-hidden rounded-xl border border-border bg-white p-2 shadow-card sm:grid-cols-[minmax(0,1fr)_8rem]">
      <div className="overflow-hidden rounded-lg bg-muted">
        <img
          src={primaryUrl}
          alt={`${title} rasmi 1`}
          loading="eager"
          decoding="async"
          className="aspect-[16/10] w-full object-cover"
        />
      </div>

      {thumbnailUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-1">
          {thumbnailUrls.map((url, index) => (
            <div key={url} className="overflow-hidden rounded-lg bg-muted">
              <img
                src={url}
                alt={`${title} rasmi ${index + 2}`}
                loading="lazy"
                decoding="async"
                className="aspect-[16/10] w-full object-cover sm:aspect-square"
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
