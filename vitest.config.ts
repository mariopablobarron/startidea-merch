import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // El tsconfig de Next lleva `jsx: "preserve"` (lo compila Next, no esbuild),
  // y Vite lo respeta: sin esto, importar un `.tsx` desde un test peta con
  // «invalid JS syntax». Hace falta desde que `recommender-proposal-pdf.fuga`
  // renderiza el PDF de verdad en vez de leer su fuente como texto. Solo
  // afecta a los tests — `next build` no usa este fichero.
  // (Este Vite transforma con oxc, no con esbuild: poner las opciones en
  // `esbuild` se ignora en silencio y solo avisa por consola.)
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    // No tocamos red ni BD desde tests — solo módulos puros.
    // Si en el futuro añadimos tests E2E que necesitan BD, los aislamos en
    // src/**/*.integration.test.ts con su propio config.
    testTimeout: 5_000,
  },
});
