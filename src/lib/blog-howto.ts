/**
 * Detector de estructura HowTo en blog posts markdown.
 *
 * Cuando el body tiene una secuencia clara de pasos numerados o headings
 * de tipo "Paso 1:", "1.", "Step 1", etc., podemos exportarlo como
 * Schema.org HowTo y Google lo muestra como rich result especial
 * (numbered steps + estimated time si está disponible).
 *
 * Detección conservadora: requiere ≥3 pasos consecutivos para evitar
 * falsos positivos en posts informacionales.
 */

export type HowToStep = {
  name: string;
  text: string;
  position: number;
};

/**
 * Extrae pasos HowTo del markdown del body.
 * Reconoce patrones:
 *   - Headings H2/H3: "## Paso 1:", "## 1. Hazlo", "### Step 2"
 *   - Listas ordenadas: "1. lorem ipsum\n2. lorem ipsum..."
 *
 * Devuelve [] si no detecta estructura clara (<3 pasos).
 */
export function detectHowToSteps(bodyMd: string): HowToStep[] {
  if (!bodyMd) return [];

  // Estrategia 1: headings tipo "## Paso N:" o "## N."
  const headingSteps = extractFromHeadings(bodyMd);
  if (headingSteps.length >= 3) return headingSteps;

  // Estrategia 2: lista ordenada larga (≥3 items consecutivos)
  const listSteps = extractFromOrderedList(bodyMd);
  if (listSteps.length >= 3) return listSteps;

  return [];
}

function extractFromHeadings(md: string): HowToStep[] {
  // Match líneas que son heading H2 o H3 con contenido tipo "Paso N", "N.", "Step N"
  const headingRe = /^(#{2,3})\s+(?:paso\s*\d+[:.]?\s*|\d+[.)]\s+|step\s*\d+[:.]?\s*)(.+)$/gim;
  const steps: HowToStep[] = [];
  const lines = md.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{2,3})\s+(?:paso\s*(\d+)[:.]?\s*|(\d+)[.)]\s+|step\s*(\d+)[:.]?\s*)(.+)$/i);
    if (!m) continue;
    const stepNum = parseInt(m[2] || m[3] || m[4] || "0", 10);
    const name = (m[5] || "").trim().replace(/^[—-]\s*/, "");
    if (!name) continue;

    // Capturar el texto hasta el siguiente heading o final
    const textLines: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^#{1,3}\s/.test(lines[j])) break;
      if (lines[j].trim()) textLines.push(lines[j].trim());
    }
    const text = textLines.join(" ").slice(0, 500);
    if (text.length < 30) continue; // descarta pasos demasiado vacíos

    steps.push({ name, text, position: stepNum || steps.length + 1 });
  }
  return steps.slice(0, 12); // límite razonable
}

function extractFromOrderedList(md: string): HowToStep[] {
  // Match bloques de lista ordenada con ≥3 items consecutivos
  const lines = md.split("\n");
  const steps: HowToStep[] = [];
  let consecutive: { text: string; num: number }[] = [];

  const flush = () => {
    if (consecutive.length >= 3) {
      for (const it of consecutive) {
        const text = it.text.trim();
        if (text.length < 20) continue;
        // El name es la primera oración (corta), el text es completo
        const firstSentence = text.split(/[.!?]\s/)[0].slice(0, 100);
        steps.push({
          name: firstSentence,
          text,
          position: it.num,
        });
      }
    }
    consecutive = [];
  };

  for (const line of lines) {
    const m = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (m) {
      consecutive.push({ num: parseInt(m[1], 10), text: m[2] });
    } else if (line.trim() === "") {
      // continuar (línea vacía dentro de lista)
    } else {
      flush();
    }
  }
  flush();
  return steps.slice(0, 12);
}

/**
 * Construye el Schema.org HowTo a partir de los pasos detectados.
 */
export function buildHowToSchema(args: {
  name: string;
  description: string;
  steps: HowToStep[];
  image?: string;
  url: string;
}): object {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: args.name,
    description: args.description.slice(0, 300),
    ...(args.image ? { image: args.image } : {}),
    step: args.steps.map((s) => ({
      "@type": "HowToStep",
      position: s.position,
      name: s.name,
      text: s.text,
      url: `${args.url}#paso-${s.position}`,
    })),
  };
}
