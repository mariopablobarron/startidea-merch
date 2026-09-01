import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { CrearPresupuestoBoton } from "@/components/admin/CrearPresupuestoBoton";
import type { QuoteStatus } from "@prisma/client";

export const metadata: Metadata = {
  title: "Cotización",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ALL_STATUS: QuoteStatus[] = ["NEW", "IN_PROGRESS", "SENT", "WON", "LOST", "ARCHIVED"];

const STATUS_LABEL: Record<QuoteStatus, string> = {
  NEW: "Nueva",
  IN_PROGRESS: "En curso",
  SENT: "Enviada",
  WON: "Ganada",
  LOST: "Perdida",
  ARCHIVED: "Archivada",
};

async function changeStatus(formData: FormData) {
  "use server";
  if (!(await isAdmin())) redirect("/admin/login");
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "") as QuoteStatus;
  if (!id || !ALL_STATUS.includes(status)) return;
  await prisma.quoteRequest.update({ where: { id }, data: { status } });
  revalidatePath(`/admin/quotes/${id}`);
  revalidatePath("/admin/quotes");
}

async function addNote(formData: FormData) {
  "use server";
  if (!(await isAdmin())) redirect("/admin/login");
  const id = String(formData.get("id") || "");
  const body = String(formData.get("body") || "").trim();
  const author = String(formData.get("author") || "admin").trim() || "admin";
  if (!id || !body) return;
  await prisma.quoteNote.create({ data: { requestId: id, body, author } });
  revalidatePath(`/admin/quotes/${id}`);
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { id } = await params;
  const q = await prisma.quoteRequest.findUnique({
    where: { id },
    include: { notes: { orderBy: { createdAt: "desc" } } },
  });
  if (!q) notFound();

  return (
    <>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link href="/admin/quotes" className="text-sm text-ink/60 hover:text-accent">
          ← Volver al listado
        </Link>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink">{q.name}</h1>
            {q.company && <p className="mt-1 text-ink/60">{q.company}</p>}
            <p className="mt-2 text-xs text-ink/50">
              {new Date(q.createdAt).toLocaleString("es-ES")}
            </p>
            <div className="mt-3">
              <CrearPresupuestoBoton endpoint={`/api/admin/quotes/${q.id}/presupuesto`} />
            </div>
          </div>

          <form action={changeStatus} className="flex items-center gap-2">
            <input type="hidden" name="id" value={q.id} />
            <label className="text-xs uppercase tracking-wider text-ink/50">Estado</label>
            <select
              name="status"
              defaultValue={q.status}
              className="rounded-full border border-line bg-bone-soft px-4 py-2 text-sm outline-none transition focus:border-accent"
            >
              {ALL_STATUS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-bone transition hover:bg-accent"
            >
              Guardar
            </button>
          </form>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr,1fr]">
          <section className="rounded-2xl border border-line bg-bone-soft p-6">
            <h2 className="text-xs font-medium uppercase tracking-wider text-ink/50">Brief</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <Field label="Producto" value={q.productHint} />
              <Field label="Cantidad" value={q.quantity?.toString()} />
              <Field label="Plazo" value={q.deadline} />
              <Field label="Presupuesto" value={q.budget} />
              <Field label="Origen" value={q.source} />
            </dl>
            <div className="mt-6 border-t border-line pt-6">
              <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Mensaje</p>
              <p className="mt-3 whitespace-pre-wrap text-[15px] text-ink/80">{q.message}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-bone-soft p-6">
            <h2 className="text-xs font-medium uppercase tracking-wider text-ink/50">Contacto</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <Field
                label="Email"
                value={
                  <a
                    href={`mailto:${q.email}?subject=Cotización ${q.name}`}
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    {q.email}
                  </a>
                }
              />
              {q.phone && (
                <Field
                  label="Teléfono"
                  value={
                    <a
                      href={`tel:${q.phone}`}
                      className="text-accent underline-offset-4 hover:underline"
                    >
                      {q.phone}
                    </a>
                  }
                />
              )}
            </dl>

            <div className="mt-6 flex flex-wrap gap-2">
              <a
                href={`mailto:${q.email}?subject=Cotización ${q.name}`}
                className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-bone transition hover:bg-accent"
              >
                Responder por email
              </a>
              {q.phone && (
                <a
                  href={`https://wa.me/${q.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola ${q.name.split(" ")[0]}, te escribimos desde todomerchandising sobre tu cotización.`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-line px-4 py-2 text-xs font-medium text-ink transition hover:border-accent"
                >
                  WhatsApp
                </a>
              )}
            </div>
          </section>
        </div>

        <section className="mt-10 rounded-2xl border border-line bg-bone-soft p-6">
          <h2 className="text-xs font-medium uppercase tracking-wider text-ink/50">
            Notas internas
          </h2>

          <form action={addNote} className="mt-4 grid gap-3">
            <input type="hidden" name="id" value={q.id} />
            <textarea
              name="body"
              required
              rows={3}
              placeholder="Añade una nota interna…"
              className="rounded-xl border border-line bg-bone px-4 py-3 text-sm outline-none transition focus:border-accent"
            />
            <div className="flex flex-wrap items-center gap-3">
              <input
                name="author"
                defaultValue="admin"
                className="rounded-full border border-line bg-bone px-3 py-1.5 text-xs outline-none transition focus:border-accent"
              />
              <button
                type="submit"
                className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-bone transition hover:bg-accent"
              >
                Añadir nota
              </button>
            </div>
          </form>

          {q.notes.length > 0 ? (
            <ul className="mt-6 space-y-4">
              {q.notes.map((n) => (
                <li key={n.id} className="rounded-xl bg-bone p-4 text-sm">
                  <div className="flex items-center justify-between text-xs text-ink/50">
                    <span>{n.author}</span>
                    <span>{new Date(n.createdAt).toLocaleString("es-ES")}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-ink/80">{n.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-ink/40">Sin notas todavía.</p>
          )}
        </section>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[100px,1fr] gap-3">
      <dt className="text-ink/50">{label}</dt>
      <dd className="text-ink/85">{value}</dd>
    </div>
  );
}
