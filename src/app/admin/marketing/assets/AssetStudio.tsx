"use client";

import { useEffect, useState, useCallback } from "react";

type TaskDTO = {
  id: string;
  provider: "magnific" | "replicate";
  type: string;
  status: string;
  inputUrl: string | null;
  outputUrl: string | null;
  previewUrl: string | null;
  prompt: string | null;
  error: string | null;
  createdAt: string;
};

type Tab =
  | "upscale"
  | "relight"
  | "mystic"
  | "remove-bg"
  | "r-upscale"
  | "r-flux"
  | "r-remove-bg";

export function AssetStudio({
  enabled,
  replicateEnabled,
  initialTasks,
}: {
  enabled: boolean;
  replicateEnabled: boolean;
  initialTasks: TaskDTO[];
}) {
  const [tab, setTab] = useState<Tab>("upscale");
  const [tasks, setTasks] = useState<TaskDTO[]>(initialTasks);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // === Polling de tasks no terminadas cada 5s ===
  // Polleo al endpoint correcto según provider (magnific o replicate).
  useEffect(() => {
    const pending = tasks.filter((t) => t.status === "queued" || t.status === "processing");
    if (pending.length === 0) return;
    const interval = setInterval(async () => {
      for (const t of pending) {
        try {
          const endpoint = t.provider === "replicate"
            ? `/api/admin/marketing/replicate/tasks/${t.id}`
            : `/api/admin/marketing/magnific/tasks/${t.id}`;
          const res = await fetch(endpoint, { credentials: "include" });
          if (!res.ok) continue;
          const data = await res.json();
          if (data.task) {
            setTasks((prev) =>
              prev.map((x) => (x.id === t.id ? mapTask(data.task, t.provider) : x)),
            );
          }
        } catch {
          /* swallow */
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [tasks]);

  const addTask = useCallback((task: TaskDTO) => {
    setTasks((prev) => [task, ...prev].slice(0, 30));
  }, []);

  return (
    <div className="space-y-6">
      <div className="space-y-2 border-b border-line pb-2">
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-[10px] uppercase tracking-wider text-ink/40">
            Magnific ⭐ premium
          </span>
          <TabButton active={tab === "upscale"} onClick={() => setTab("upscale")}>
            🔍 Upscale
          </TabButton>
          <TabButton active={tab === "relight"} onClick={() => setTab("relight")}>
            💡 Relight
          </TabButton>
          <TabButton active={tab === "mystic"} onClick={() => setTab("mystic")}>
            ✨ Mystic
          </TabButton>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-[10px] uppercase tracking-wider text-ink/40">
            Replicate 💰 económico
          </span>
          <TabButton active={tab === "r-upscale"} onClick={() => setTab("r-upscale")}>
            🚀 Upscale ECO
          </TabButton>
          <TabButton active={tab === "r-flux"} onClick={() => setTab("r-flux")}>
            ⚡ Flux (generar)
          </TabButton>
          <TabButton active={tab === "r-remove-bg"} onClick={() => setTab("r-remove-bg")}>
            ✂ Quitar fondo
          </TabButton>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-bone p-5 lg:p-6">
        {tab === "upscale" && (
          <UpscaleForm
            enabled={enabled}
            onSuccess={addTask}
            onFeedback={setFeedback}
          />
        )}
        {tab === "relight" && (
          <RelightForm
            enabled={enabled}
            onSuccess={addTask}
            onFeedback={setFeedback}
          />
        )}
        {tab === "remove-bg" && <RemoveBgForm />}
        {tab === "r-upscale" && (
          <ReplicateUpscaleForm onSuccess={addTask} onFeedback={setFeedback} />
        )}
        {tab === "r-flux" && (
          <ReplicateFluxForm onSuccess={addTask} onFeedback={setFeedback} />
        )}
        {tab === "r-remove-bg" && (
          <ReplicateRemoveBgForm onSuccess={addTask} onFeedback={setFeedback} />
        )}
        {tab === "mystic" && (
          <MysticForm
            enabled={enabled}
            onSuccess={addTask}
            onFeedback={setFeedback}
          />
        )}
      </div>

      {feedback && (
        <div
          className={`rounded-xl px-3 py-2 text-xs ${
            feedback.ok ? "bg-social/10 text-social" : "bg-accent-wash text-accent-deep"
          }`}
        >
          {feedback.ok ? "✓" : "⚠"} {feedback.msg}
        </div>
      )}

      <section>
        <h2 className="mb-3 font-display text-base font-semibold text-ink">
          Tareas recientes ({tasks.length})
        </h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-ink/50">No hay tareas todavía.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function mapTask(
  t: {
    id: string;
    type: string;
    status: string;
    inputUrl: string | null;
    outputUrl: string | null;
    previewUrl?: string | null;
    prompt: string | null;
    error: string | null;
    createdAt: string | Date;
  },
  provider: "magnific" | "replicate" = "magnific",
): TaskDTO {
  return {
    id: t.id,
    provider,
    type: t.type,
    status: t.status,
    inputUrl: t.inputUrl,
    outputUrl: t.outputUrl,
    previewUrl: t.previewUrl ?? null,
    prompt: t.prompt,
    error: t.error,
    createdAt:
      typeof t.createdAt === "string" ? t.createdAt : new Date(t.createdAt).toISOString(),
  };
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
        active
          ? "border-accent text-accent"
          : "border-transparent text-ink/60 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function UpscaleForm({
  enabled,
  onSuccess,
  onFeedback,
}: {
  enabled: boolean;
  onSuccess: (t: TaskDTO) => void;
  onFeedback: (f: { ok: boolean; msg: string }) => void;
}) {
  const [imageUrl, setImageUrl] = useState("");
  const [scale, setScale] = useState<"2x" | "4x" | "8x" | "16x">("2x");
  const [creativity, setCreativity] = useState(3);
  const [precision, setPrecision] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/marketing/magnific/upscale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          imageUrl: imageUrl.trim(),
          scale_factor: scale,
          creativity,
          precision,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onFeedback({ ok: false, msg: data.error || "Error" });
      } else {
        onSuccess(mapTask(data.task));
        onFeedback({ ok: true, msg: "Tarea enviada — actualizando estado…" });
        setImageUrl("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h3 className="font-display text-lg font-semibold text-ink">
        Upscale creativo (2x / 4x / 8x / 16x)
      </h3>
      <p className="mb-4 mt-1 text-xs text-ink/60">
        Sube una foto borrosa o pequeña del catálogo y obtén una versión nítida con detalle
        IA. Asíncrono — la tarea se procesa en ~30-90 segundos.
        <span className="block mt-1 text-[10px] text-ink/40">
          La URL debe ser pública y resolverse sin redirects. Si Magnific no puede
          descargarla, devolverá "Unable to resolve image".
        </span>
      </p>
      <Field label="URL de la imagen">
        <input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://merchandising.hubstartidea.es/uploads/producto-x.jpg"
          className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent"
        />
      </Field>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Factor de escala">
          <select
            value={scale}
            onChange={(e) => setScale(e.target.value as "2x" | "4x" | "8x" | "16x")}
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm"
          >
            <option value="2x">2x (rápido)</option>
            <option value="4x">4x (recomendado)</option>
            <option value="8x">8x (alto detalle)</option>
            <option value="16x">16x (máximo)</option>
          </select>
        </Field>
        <Field label={`Creatividad (${creativity})`}>
          <input
            type="range"
            min={0}
            max={10}
            value={creativity}
            onChange={(e) => setCreativity(Number(e.target.value))}
            className="w-full"
          />
        </Field>
        <Field label="Modo">
          <label className="mt-1 inline-flex items-center gap-2 text-xs text-ink/70">
            <input
              type="checkbox"
              checked={precision}
              onChange={(e) => setPrecision(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            <span>Precision (mejor fidelidad al original)</span>
          </label>
        </Field>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={!enabled || !imageUrl.trim() || submitting}
        className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bone hover:bg-accent-dark disabled:opacity-40"
      >
        {submitting ? "Enviando…" : "Upscale →"}
      </button>
    </>
  );
}

function RemoveBgForm() {
  return (
    <>
      <h3 className="font-display text-lg font-semibold text-ink">
        Eliminar fondo · No disponible
      </h3>
      <p className="mb-4 mt-1 text-xs text-ink/60">
        El endpoint <code className="rounded bg-bone-soft px-1 py-0.5">/v1/ai/remove-background</code>{" "}
        que documenta Magnific no está disponible en la API pública con tu plan actual
        (verificado 2026-05). En su lugar, prueba alternativas equivalentes:
      </p>
      <ul className="space-y-2 text-sm text-ink/70">
        <li className="rounded-xl border border-line bg-bone-soft p-3">
          <strong>· Mystic con prompt específico</strong>: pídele que regenere el producto
          sobre fondo plano blanco o transparente, ej. "Bolsa tote blanca sobre fondo
          transparente, vista frontal, sin sombras".
        </li>
        <li className="rounded-xl border border-line bg-bone-soft p-3">
          <strong>· Herramientas alternativas gratuitas</strong>:{" "}
          <a
            href="https://www.remove.bg"
            target="_blank"
            rel="noopener"
            className="text-accent underline"
          >
            remove.bg
          </a>
          ,{" "}
          <a
            href="https://photoroom.com"
            target="_blank"
            rel="noopener"
            className="text-accent underline"
          >
            photoroom.com
          </a>
          {" "}— quitar fondo manualmente y subir el PNG al catálogo.
        </li>
        <li className="rounded-xl border border-line bg-bone-soft p-3">
          <strong>· API alternativa</strong>: si quieres automatizarlo, te puedo conectar
          la API de remove.bg (50 imágenes/mes gratis) o photoroom (1.000/mes con plan
          básico).
        </li>
      </ul>
    </>
  );
}

const RELIGHT_PRESETS: Array<{ label: string; prompt: string }> = [
  { label: "🌅 Hora dorada cálida", prompt: "warm golden hour light, soft sunset, natural shadows" },
  { label: "☀️ Luz natural día", prompt: "soft natural daylight, diffused, even illumination" },
  { label: "💡 Estudio profesional", prompt: "professional studio lighting, three-point setup, neutral backdrop" },
  { label: "🌙 Atmósfera nocturna", prompt: "moody evening light, low key, dramatic shadows" },
  { label: "🪟 Luz de ventana", prompt: "soft window light from the left, gentle highlights" },
  { label: "✨ Producto editorial", prompt: "editorial product photography lighting, clean white background" },
];

function RelightForm({
  enabled,
  onSuccess,
  onFeedback,
}: {
  enabled: boolean;
  onSuccess: (t: TaskDTO) => void;
  onFeedback: (f: { ok: boolean; msg: string }) => void;
}) {
  const [imageUrl, setImageUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/marketing/magnific/relight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          imageUrl: imageUrl.trim(),
          prompt: prompt.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onFeedback({ ok: false, msg: data.error || "Error" });
      } else {
        onSuccess(mapTask(data.task));
        onFeedback({ ok: true, msg: "Tarea enviada — actualizando estado…" });
        setImageUrl("");
        setPrompt("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h3 className="font-display text-lg font-semibold text-ink">
        Cambiar iluminación (Relight)
      </h3>
      <p className="mb-4 mt-1 text-xs text-ink/60">
        Modifica la luz de una foto producto sin rehacer el shooting. Útil para
        adaptar fotos de mayoristas a tu estilo visual o cambiar de luz dura a luz
        natural. Asíncrono (~30-60s).
      </p>
      <Field label="URL de la imagen">
        <input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://cdn1.midocean.com/image/700X700/mo2105-23.jpg"
          className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent"
        />
      </Field>
      <Field label="Estilo de iluminación (presets)">
        <div className="mt-1 flex flex-wrap gap-2">
          {RELIGHT_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setPrompt(p.prompt)}
              className="rounded-full border border-line bg-bone-soft px-3 py-1 text-xs hover:border-accent hover:bg-accent/5"
            >
              {p.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Prompt (descripción libre, opcional)">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="Ej: warm sunset light from the right, soft shadows, golden hour"
          className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </Field>
      <button
        type="button"
        onClick={submit}
        disabled={!enabled || !imageUrl.trim() || submitting}
        className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bone hover:bg-accent-dark disabled:opacity-40"
      >
        {submitting ? "Enviando…" : "Aplicar Relight →"}
      </button>
    </>
  );
}

const MYSTIC_ASPECTS: Array<{ id: string; label: string }> = [
  { id: "square_1_1", label: "1:1 · Instagram post / LinkedIn" },
  { id: "social_post_4_5", label: "4:5 · Instagram carousel" },
  { id: "social_story_9_16", label: "9:16 · Story / Reel / TikTok" },
  { id: "widescreen_16_9", label: "16:9 · Banner web / YouTube thumbnail" },
  { id: "classic_4_3", label: "4:3 · Clásico horizontal" },
  { id: "traditional_3_4", label: "3:4 · Clásico vertical" },
  { id: "standard_3_2", label: "3:2 · Cámara DSLR horizontal" },
  { id: "portrait_2_3", label: "2:3 · Pinterest pin" },
  { id: "horizontal_2_1", label: "2:1 · Twitter/X header" },
  { id: "vertical_1_2", label: "1:2 · Banner vertical" },
  { id: "film_horizontal_21_9", label: "21:9 · Cinemascope horizontal" },
  { id: "social_5_4", label: "5:4 · Foto retrato Facebook" },
];

function MysticForm({
  enabled,
  onSuccess,
  onFeedback,
}: {
  enabled: boolean;
  onSuccess: (t: TaskDTO) => void;
  onFeedback: (f: { ok: boolean; msg: string }) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [resolution, setResolution] = useState<"1k" | "2k" | "4k">("2k");
  const [aspectRatio, setAspectRatio] = useState<string>("square_1_1");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/marketing/magnific/mystic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          prompt: prompt.trim(),
          resolution,
          aspect_ratio: aspectRatio,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onFeedback({ ok: false, msg: data.error || "Error" });
      } else {
        onSuccess(mapTask(data.task));
        onFeedback({ ok: true, msg: "Tarea enviada — actualizando estado…" });
        setPrompt("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h3 className="font-display text-lg font-semibold text-ink">
        Mystic — Generación ultra-realista
      </h3>
      <p className="mb-4 mt-1 text-xs text-ink/60">
        Describe la imagen que quieres y Mystic la genera. Asíncrono (~60-180s).
      </p>
      <Field label="Prompt">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Una bolsa tote de algodón blanco sobre una mesa de madera, luz natural, estilo editorial minimalista, producto destacado en primer plano…"
          className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </Field>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Resolución">
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as "1k" | "2k" | "4k")}
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm"
          >
            <option value="1k">1k (rápido)</option>
            <option value="2k">2k (recomendado)</option>
            <option value="4k">4k (alta calidad)</option>
          </select>
        </Field>
        <Field label="Formato">
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm"
          >
            {MYSTIC_ASPECTS.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={!enabled || prompt.trim().length < 3 || submitting}
        className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bone hover:bg-accent-dark disabled:opacity-40"
      >
        {submitting ? "Generando…" : "Generar imagen →"}
      </button>
    </>
  );
}

// === REPLICATE FORMS ============================================

function ReplicateUpscaleForm({
  onSuccess,
  onFeedback,
}: {
  onSuccess: (t: TaskDTO) => void;
  onFeedback: (f: { ok: boolean; msg: string }) => void;
}) {
  const [imageUrl, setImageUrl] = useState("");
  const [scale, setScale] = useState(2);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/marketing/replicate/upscale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ imageUrl: imageUrl.trim(), scale_factor: scale }),
      });
      const data = await res.json();
      if (!res.ok) onFeedback({ ok: false, msg: data.error || "Error" });
      else {
        onSuccess(mapTask(data.task, "replicate"));
        onFeedback({ ok: true, msg: "Tarea Replicate enviada — actualizando…" });
        setImageUrl("");
      }
    } finally { setSubmitting(false); }
  }

  return (
    <>
      <h3 className="font-display text-lg font-semibold text-ink">
        Upscale económico (Clarity Upscaler / Replicate)
      </h3>
      <p className="mb-4 mt-1 text-xs text-ink/60">
        Modelo <code>philz1337x/clarity-upscaler</code>. ~$0,005/imagen. 30-60s.
        Calidad superior a real-esrgan. Bueno para procesar lotes del catálogo.
      </p>
      <Field label="URL de la imagen">
        <input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://cdn1.midocean.com/image/700X700/mo2105-23.jpg"
          className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent"
        />
      </Field>
      <div className="mt-3">
        <Field label={`Factor (${scale}x)`}>
          <input
            type="range"
            min={2}
            max={10}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="w-full"
          />
        </Field>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={!imageUrl.trim() || submitting}
        className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bone hover:bg-accent-dark disabled:opacity-40"
      >
        {submitting ? "Enviando…" : "Upscale ECO →"}
      </button>
    </>
  );
}

const FLUX_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "2:3", "3:2", "5:4", "4:5"] as const;

function ReplicateFluxForm({
  onSuccess,
  onFeedback,
}: {
  onSuccess: (t: TaskDTO) => void;
  onFeedback: (f: { ok: boolean; msg: string }) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/marketing/replicate/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: prompt.trim(), aspect_ratio: aspectRatio }),
      });
      const data = await res.json();
      if (!res.ok) onFeedback({ ok: false, msg: data.error || "Error" });
      else {
        onSuccess(mapTask(data.task, "replicate"));
        onFeedback({ ok: true, msg: "Flux enviado — actualizando…" });
        setPrompt("");
      }
    } finally { setSubmitting(false); }
  }

  return (
    <>
      <h3 className="font-display text-lg font-semibold text-ink">
        Generar con Flux Schnell (Replicate)
      </h3>
      <p className="mb-4 mt-1 text-xs text-ink/60">
        Modelo <code>black-forest-labs/flux-schnell</code>. ~$0,003/imagen.
        Genera en 1-4 segundos. Más barato del mercado. Buena calidad pero
        menos foto-realista que Mystic.
      </p>
      <Field label="Prompt">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Tote bag de algodón blanco con logo minimalista, mesa madera, luz natural"
          className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </Field>
      <Field label="Aspect ratio">
        <select
          value={aspectRatio}
          onChange={(e) => setAspectRatio(e.target.value)}
          className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm"
        >
          {FLUX_ASPECTS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </Field>
      <button
        type="button"
        onClick={submit}
        disabled={prompt.trim().length < 3 || submitting}
        className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bone hover:bg-accent-dark disabled:opacity-40"
      >
        {submitting ? "Generando…" : "Flux →"}
      </button>
    </>
  );
}

function ReplicateRemoveBgForm({
  onSuccess,
  onFeedback,
}: {
  onSuccess: (t: TaskDTO) => void;
  onFeedback: (f: { ok: boolean; msg: string }) => void;
}) {
  const [imageUrl, setImageUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/marketing/replicate/remove-bg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ imageUrl: imageUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) onFeedback({ ok: false, msg: data.error || "Error" });
      else {
        onSuccess(mapTask(data.task, "replicate"));
        onFeedback({ ok: true, msg: "Remove BG enviado — actualizando…" });
        setImageUrl("");
      }
    } finally { setSubmitting(false); }
  }

  return (
    <>
      <h3 className="font-display text-lg font-semibold text-ink">
        Quitar fondo (Replicate)
      </h3>
      <p className="mb-4 mt-1 text-xs text-ink/60">
        Modelo <code>851-labs/background-remover</code>. ~$0,005/imagen.
        Devuelve PNG con alfa transparente. ~10-30s.
      </p>
      <Field label="URL de la imagen">
        <input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://..."
          className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent"
        />
      </Field>
      <button
        type="button"
        onClick={submit}
        disabled={!imageUrl.trim() || submitting}
        className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bone hover:bg-accent-dark disabled:opacity-40"
      >
        {submitting ? "Procesando…" : "Quitar fondo →"}
      </button>
    </>
  );
}

// === TASK CARD =================================================

function TaskCard({ task }: { task: TaskDTO }) {
  const statusColor: Record<string, string> = {
    queued: "bg-bone-soft text-ink/50",
    processing: "bg-accent-mist text-accent-deep",
    ready: "bg-social/15 text-social",
    failed: "bg-accent-wash text-accent-deep",
  };
  const typeIcon: Record<string, string> = {
    upscale: "🔍",
    "remove-bg": "✂",
    mystic: "✨",
    relight: "💡",
    expand: "↔",
    generate: "⚡",
  };
  return (
    <li className="rounded-2xl border border-line bg-bone p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs">
          <span>{typeIcon[task.type] || "•"}</span>
          <span className="font-mono uppercase text-ink/60">{task.type}</span>
          <span className="ml-1 rounded-full bg-bone-soft px-1.5 py-0.5 text-[9px] text-ink/40">
            {task.provider === "replicate" ? "R" : "M"}
          </span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
            statusColor[task.status] || "bg-bone-soft text-ink/50"
          }`}
        >
          {task.status}
        </span>
      </div>
      {task.outputUrl ? (
        <a
          href={task.outputUrl}
          target="_blank"
          rel="noopener"
          className="mt-2 block aspect-square overflow-hidden rounded-xl bg-bone-soft"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={task.previewUrl || task.outputUrl}
            alt="Resultado"
            className="h-full w-full object-cover"
          />
        </a>
      ) : task.inputUrl ? (
        <div className="mt-2 aspect-square overflow-hidden rounded-xl bg-bone-soft opacity-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={task.inputUrl} alt="Input" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="mt-2 aspect-square rounded-xl bg-bone-soft flex items-center justify-center text-xs text-ink/40">
          {task.status === "processing" ? "Generando…" : "—"}
        </div>
      )}
      {task.prompt && (
        <p className="mt-2 line-clamp-2 text-[11px] text-ink/60">{task.prompt}</p>
      )}
      {task.error && (
        <p className="mt-1 line-clamp-2 text-[10px] text-accent-deep">{task.error}</p>
      )}
      <p className="mt-1 text-[10px] text-ink/40">
        {new Date(task.createdAt).toLocaleString("es-ES")}
      </p>
      {task.outputUrl && (
        <a
          href={task.outputUrl}
          download
          className="mt-2 inline-block text-[11px] text-accent underline"
        >
          Descargar
        </a>
      )}
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink/60">
        {label}
      </label>
      {children}
    </div>
  );
}
