export default function Loading() {
  return (
    <>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-ink/10" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded bg-ink/5" />

        <div className="mt-6 flex gap-1.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-8 w-28 animate-pulse rounded-full bg-ink/5" />
          ))}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-line bg-bone-soft p-5">
              <div className="h-4 w-24 animate-pulse rounded bg-ink/10" />
              <div className="mt-3 h-7 w-20 animate-pulse rounded bg-ink/10" />
            </div>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-line bg-bone-soft p-5">
              <div className="h-4 w-24 animate-pulse rounded bg-ink/10" />
              <div className="mt-3 h-7 w-20 animate-pulse rounded bg-ink/10" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
