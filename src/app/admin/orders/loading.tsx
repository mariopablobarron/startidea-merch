export default function Loading() {
  return (
    <>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="h-9 w-56 animate-pulse rounded-lg bg-ink/10" />
        <div className="mt-2 h-4 w-32 animate-pulse rounded bg-ink/5" />

        <div className="mt-8 flex gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-9 w-24 animate-pulse rounded-full bg-ink/5" />
          ))}
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-bone-soft">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex gap-6 border-b border-line px-5 py-5 last:border-0">
              <div className="h-4 w-20 animate-pulse rounded bg-ink/10" />
              <div className="h-4 w-32 animate-pulse rounded bg-ink/10" />
              <div className="h-4 w-40 animate-pulse rounded bg-ink/10" />
              <div className="h-4 w-24 animate-pulse rounded bg-ink/10" />
              <div className="ml-auto h-6 w-24 animate-pulse rounded-full bg-ink/10" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
