export default function Loading() {
  return (
    <>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-ink/10" />
        <div className="mt-2 h-4 w-40 animate-pulse rounded bg-ink/5" />

        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-line bg-bone-soft p-5">
              <div className="h-4 w-24 animate-pulse rounded bg-ink/10" />
              <div className="mt-3 h-7 w-20 animate-pulse rounded bg-ink/10" />
              <div className="mt-2 h-3 w-16 animate-pulse rounded bg-ink/5" />
            </div>
          ))}
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-line bg-bone-soft p-5">
              <div className="h-4 w-32 animate-pulse rounded bg-ink/10" />
              <div className="mt-4 space-y-3">
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="h-4 w-full animate-pulse rounded bg-ink/5" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
