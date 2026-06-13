/* Importador ADIVIN autocontenido (Node CommonJS, corre dentro del contenedor merch-app).
 * Replica mediaHash, generateInternalRef y slugify del repo. DRY-RUN salvo COMMIT=1. */
const { PrismaClient } = require("@prisma/client");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const prisma = new PrismaClient();

const COMMIT = process.env.COMMIT === "1";
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function mediaHash(url) {
  const sha = createHash("sha1").update(url).digest();
  let bits = 0n;
  for (let i = 0; i < 10; i++) bits = (bits << 8n) | BigInt(sha[i]);
  let s = "";
  const len = BigInt(ALPHABET.length);
  for (let i = 0; i < 16; i++) { s = ALPHABET[Number((bits & 31n) % len)] + s; bits >>= 5n; }
  return s;
}
function internalRef(id) {
  const h = createHash("sha1").update(id).digest();
  let bits = 0n;
  for (let i = 0; i < 4; i++) bits = (bits << 8n) | BigInt(h[i]);
  let s = "";
  const len = BigInt(ALPHABET.length);
  for (let i = 0; i < 6; i++) { s = ALPHABET[Number((bits & 31n) % len)] + s; bits >>= 5n; }
  return "STM-" + s;
}
function slugify(x) {
  return (x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80);
}

const catCache = new Map();
async function resolveCategory(name) {
  const slug = slugify(name);
  if (!slug) return null;
  if (catCache.has(slug)) return catCache.get(slug);
  let c = await prisma.category.findFirst({ where: { slug, parentId: null }, select: { id: true } });
  if (!c && COMMIT) c = await prisma.category.create({ data: { slug, name }, select: { id: true } });
  const id = c ? c.id : null;
  catCache.set(slug, id);
  return id;
}
async function uniqueSlug(name, ref) {
  let base = slugify(name) || "adivin-" + slugify(ref);
  let slug = base, n = 1;
  while (true) {
    const p = await prisma.product.findUnique({ where: { slug }, select: { supplier: true, supplierRef: true } });
    if (!p || (p.supplier === "adivin" && p.supplierRef === ref)) return slug;
    slug = `${base}-${++n}`;
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync("/app/adivin-import-data.json", "utf8"));
  console.log(`ADIVIN import · ${COMMIT ? "COMMIT" : "DRY-RUN"} · ${data.length} productos`);
  let created = 0, updated = 0, active = 0, inactive = 0;
  for (const it of data) {
    const cents = it.pvpCents ?? null;
    cents ? active++ : inactive++;
    if (!COMMIT) {
      console.log(`  [dry] ${it.supplierRef.padEnd(7)} ${it.name.slice(0, 40).padEnd(40)} ${cents ? (cents/100).toFixed(2)+"€" : "sin precio"}`);
      continue;
    }
    const categoryId = await resolveCategory(it.category);
    let primaryImageUrl = null;
    if (it.image) {
      const hash = mediaHash(it.image);
      await prisma.mediaAsset.upsert({ where: { hash }, update: {}, create: { hash, originalUrl: it.image, kind: "product-primary" } }).catch(() => {});
      primaryImageUrl = "/api/m/" + hash;
    }
    const existing = await prisma.product.findUnique({ where: { supplier_supplierRef: { supplier: "adivin", supplierRef: it.supplierRef } }, select: { id: true, slug: true } });
    const slug = existing ? existing.slug : await uniqueSlug(it.name, it.supplierRef);
    const fields = {
      name: it.name, shortDescription: it.shortDescription || null, material: it.material || null,
      category: categoryId ? { connect: { id: categoryId } } : undefined,
      supplierCategoryCode: it.category, primaryImageUrl, fromPriceCents: cents,
      active: cents != null, syncedAt: new Date(),
    };
    const p = await prisma.product.upsert({
      where: { supplier_supplierRef: { supplier: "adivin", supplierRef: it.supplierRef } },
      create: { supplier: "adivin", supplierRef: it.supplierRef, slug, tags: [], ...fields },
      update: fields,
      select: { id: true, internalRef: true },
    });
    existing ? updated++ : created++;
    if (!p.internalRef) await prisma.product.update({ where: { id: p.id }, data: { internalRef: internalRef(p.id) } }).catch(() => {});
  }
  console.log(`\nRESULTADO: ${created} creados · ${updated} actualizados · ${active} activos · ${inactive} inactivos`);
  if (!COMMIT) console.log("DRY-RUN: nada escrito. COMMIT=1 para aplicar.");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
