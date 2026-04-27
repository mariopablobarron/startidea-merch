"use client";

import Link from "next/link";

export function ProductQuoteCta({
  productSlug,
  productRef,
  productName,
}: {
  productSlug: string;
  productRef: string;
  productName: string;
}) {
  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    const detail = `${productName} (ref. ${productRef})`;
    const ev = new CustomEvent("merch:prefill-product", { detail });
    window.dispatchEvent(ev);
    // navegamos al cotizador de la home, prefill se aplica al renderizar
    sessionStorage.setItem("merch:prefill", detail);
    sessionStorage.setItem("merch:prefill-ref", productRef);
    sessionStorage.setItem("merch:prefill-slug", productSlug);
    window.location.href = "/#cotizar";
  }

  return (
    <div className="mt-10 flex flex-wrap gap-3">
      <Link
        href="/#cotizar"
        onClick={onClick}
        className="rounded-full bg-ink px-8 py-4 text-base font-medium text-bone transition hover:bg-accent"
      >
        Cotizar este producto
      </Link>
      <a
        href={`mailto:hola@merchandising.startidea.es?subject=${encodeURIComponent(`Cotización ${productName} (${productRef})`)}`}
        className="rounded-full border border-ink/15 bg-bone-soft px-8 py-4 text-base font-medium text-ink transition hover:border-ink/40"
      >
        Email directo
      </a>
    </div>
  );
}
