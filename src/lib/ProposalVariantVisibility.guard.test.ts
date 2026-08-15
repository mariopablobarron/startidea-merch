import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("guard: la variante es visible antes de enviar una propuesta", () => {
  it("la muestra en el panel de revisión y en ambos layouts del PDF", () => {
    const admin = source("src/app/admin/propuestas/page.tsx");
    const pdf = source("src/lib/recommender-proposal-pdf.tsx");

    expect(admin).toContain("proposalVariantAdminLabel(item)");
    expect(admin).toContain('{variantLabels.join(" · ")}');
    expect(pdf).toContain(
      "const variantLabel = proposalVariantCustomerLabel(it)",
    );
    expect(pdf).not.toContain("proposalVariantAdminLabel");
    expect(pdf.match(/\{variantLabel\}/g)).toHaveLength(2);
  });
});
