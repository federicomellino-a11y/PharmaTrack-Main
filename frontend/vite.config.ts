import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const port = Number(process.env.PORT || 3000);

// Il commit finisce nel bundle: ogni evento Sentry dice da quale build arriva.
const appRelease =
  process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local";

// Lo stesso valore finisce nel <meta name="app-build">: chi guarda il sorgente
// della pagina sa subito se il browser sta usando una build vecchia.
const buildStamp = `${String(appRelease).slice(0, 7)} · ${new Date()
  .toISOString()
  .slice(0, 16)
  .replace("T", " ")} UTC`;

export default defineConfig({
  base: "/",
  define: { __APP_RELEASE__: JSON.stringify(String(appRelease).slice(0, 7)) },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "app-build-meta",
      transformIndexHtml(html: string) {
        return html.replace("__APP_BUILD__", buildStamp);
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // L'entry era un unico file da 785 kB che cambia a ogni deploy, quindi
        // ogni rilascio costringeva a riscaricare anche React, Router e Leaflet
        // che non erano cambiati. Separando i vendor in chunk propri il loro
        // hash resta stabile fra un deploy e l'altro e il browser li riusa.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // Solo le librerie grandi e autosufficienti hanno un chunk proprio:
          // spezzare anche react, router e le utility crea cicli fra chunk
          // (vendor -> vendor-utils -> vendor-react) che Rollup segnala e che
          // possono rompere l'ordine di inizializzazione.
          if (id.includes("leaflet")) return "vendor-leaflet";
          if (id.includes("recharts") || id.includes("d3-") || id.includes("victory")) return "vendor-charts";
          return "vendor";
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    strictPort: true,
    watch: {
      usePolling: true,
    },
    hmr: {
      clientPort: 443,
      protocol: "wss",
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
