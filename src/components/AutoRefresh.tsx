"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Refresca el server component cada `seconds` (router.refresh) para que el
 * Centro de control muestre datos en vivo sin recargar la página entera.
 */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [last, setLast] = useState<string>("");

  useEffect(() => {
    const tick = () => {
      router.refresh();
      setLast(new Date().toLocaleTimeString("es-ES"));
    };
    const id = setInterval(tick, seconds * 1000);
    setLast(new Date().toLocaleTimeString("es-ES"));
    return () => clearInterval(id);
  }, [router, seconds]);

  return (
    <span className="text-[11px] text-ink/45">
      🟢 En vivo · refresco cada {seconds}s{last ? ` · ${last}` : ""}
    </span>
  );
}
