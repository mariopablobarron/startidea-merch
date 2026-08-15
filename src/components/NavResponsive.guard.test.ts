import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const cartBadge = readFileSync(
  join(process.cwd(), "src/components/NavCartBadge.tsx"),
  "utf8",
);

describe("guard: Nav sin overflow en tablet horizontal", () => {
  it("reserva el total monetario del carrito para pantallas xl", () => {
    expect(cartBadge).toContain(
      '<span className="hidden xl:inline tabular-nums">· {EUR.format(totalCents / 100)}</span>',
    );
    expect(cartBadge).not.toContain(
      '<span className="hidden sm:inline tabular-nums">· {EUR.format(totalCents / 100)}</span>',
    );
  });
});
