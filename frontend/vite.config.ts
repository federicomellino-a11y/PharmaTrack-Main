import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const port = Number(process.env.PORT || 3000);

// Il commit finisce nel bundle: ogni evento Sentry dice da quale build arriva.
const appRelease =
  process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local";

export default defineConfig({
  base: "/",
  define: { __APP_RELEASE__: JSON.stringify(String(appRelease).slice(0, 7)) },
  plugins: [react(), tailwindcss()],
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
