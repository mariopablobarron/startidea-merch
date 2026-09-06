/**
 * Spell A1 — Confetti minimalista, sin dependencias.
 *
 * Vanilla canvas confetti que emerge de un punto concreto del viewport.
 * ~80 partículas, 1.5s de duración, self-cleanup.
 *
 * Uso:
 *   import { spellConfetti } from "@/lib/spells/confetti";
 *   spellConfetti(buttonEl); // o spellConfetti({ x: 200, y: 400 })
 *
 * Paleta brand Startidea por defecto. Override con `colors`.
 *
 * Por qué vanilla y no canvas-confetti (npm):
 *  - 0 KB extra al bundle vs ~6 KB de la lib
 *  - Sin riesgo de update romper nada
 *  - Es el primer spell del "Spellbook" — debe ser self-contained
 */

type Origin = HTMLElement | { x: number; y: number };

export type ConfettiOptions = {
  /** Número de partículas (default 80) */
  count?: number;
  /** Duración en ms (default 1500) */
  duration?: number;
  /** Velocidad inicial radial (default 14) */
  speed?: number;
  /** Ángulo de dispersión en grados desde la vertical (default 50) */
  spread?: number;
  /** Colores hex (default paleta Startidea) */
  colors?: string[];
  /** Tamaño base de partícula en px (default 8) */
  size?: number;
};

const DEFAULT_COLORS = [
  "#C41D51", // magenta brand
  "#F472B6", // magenta light
  "#FBBF24", // amber accent
  "#F5F0E6", // bone
  "#10B981", // social green
];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  color: string;
  shape: "rect" | "circle";
  life: number;
};

export function spellConfetti(origin: Origin, opts: ConfettiOptions = {}) {
  // SSR / motion-reduced safe guard
  if (typeof window === "undefined") return;
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  const {
    count = 80,
    duration = 1500,
    speed = 14,
    spread = 50,
    colors = DEFAULT_COLORS,
    size = 8,
  } = opts;

  // Origin → coordinates viewport
  let cx: number, cy: number;
  if (origin instanceof HTMLElement) {
    const r = origin.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
  } else {
    cx = origin.x;
    cy = origin.y;
  }

  // Canvas overlay full-viewport, pointer-events none → no interfiere
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    document.body.removeChild(canvas);
    return;
  }

  // Partículas iniciales — dispersión radial alrededor del origen
  const particles: Particle[] = [];
  const spreadRad = (spread * Math.PI) / 180;
  for (let i = 0; i < count; i++) {
    // Ángulo principal hacia arriba (-π/2) con dispersión
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * spreadRad * 2;
    const v = speed * (0.6 + Math.random() * 0.6);
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.4,
      size: size * (0.6 + Math.random() * 0.8),
      color: colors[Math.floor(Math.random() * colors.length)] ?? colors[0]!,
      shape: Math.random() < 0.7 ? "rect" : "circle",
      life: 1,
    });
  }

  const start = performance.now();
  const gravity = 0.45;
  const friction = 0.985;
  let raf = 0;

  const draw = (now: number) => {
    const elapsed = now - start;
    const t = elapsed / duration; // 0 → 1

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (t >= 1) {
      canvas.remove();
      return;
    }

    for (const p of particles) {
      // Físicas
      p.vx *= friction;
      p.vy = p.vy * friction + gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      // Fade out en el último 30%
      p.life = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      if (p.shape === "rect") {
        // Rectángulo girando (efecto papel cayendo)
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    raf = requestAnimationFrame(draw);
  };

  raf = requestAnimationFrame(draw);

  // Safety cleanup si la pestaña pierde foco en mitad
  const visHandler = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      canvas.remove();
      document.removeEventListener("visibilitychange", visHandler);
    }
  };
  document.addEventListener("visibilitychange", visHandler);
}
