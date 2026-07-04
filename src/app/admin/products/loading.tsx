export default function Loading() {
  return (
    <>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="h-9 w-56 animate-pulse rounded-lg bg-ink/10" />
        <div className="mt-2 h-4 w-32 animate-pulse rounded bg-ink/5" />

        <div className="mt-8 flex flex-wrap gap-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-9 w-24 animate-pulse rounded-full bg-ink/5" />
          ))}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-line bg-bone-soft">
              <div className="aspect-square w-full animate-pulse bg-ink/10" />
              <div className="p-3">
                <div className="h-4 w-3/4 animate-pulse rounded bg-ink/10" />
                <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-ink/5" />
                <div className="mt-3 h-4 w-16 animate-pulse rounded bg-ink/10" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
