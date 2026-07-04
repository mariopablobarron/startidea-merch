"use client";

type Sort = "name" | "stock" | "recent";

const SORT_LABELS: Record<Sort, string> = {
  name: "Nombre A–Z",
  stock: "Más stock primero",
  recent: "Sincronizados recientemente",
};

export function SortSelect({
  current,
  q,
  cat,
  color,
  talla,
  mat,
}: {
  current: Sort;
  q: string;
  cat: string;
  color: string;
  talla?: string;
  mat: string;
}) {
  const opts: Sort[] = ["name", "stock", "recent"];
  return (
    <form className="flex items-center gap-2">
      {q && <input type="hidden" name="q" value={q} />}
      {cat && <input type="hidden" name="cat" value={cat} />}
      {color && <input type="hidden" name="color" value={color} />}
      {talla && <input type="hidden" name="talla" value={talla} />}
      {mat && <input type="hidden" name="mat" value={mat} />}
      <label className="text-xs text-ink/50">Ordenar por</label>
      <select
        name="sort"
        defaultValue={current}
        onChange={(e) => e.currentTarget.form?.submit()}
        className="rounded-full border border-line bg-bone-soft px-3 py-1.5 text-xs outline-none focus:border-accent"
      >
        {opts.map((o) => (
          <option key={o} value={o}>
            {SORT_LABELS[o]}
          </option>
        ))}
      </select>
    </form>
  );
}
