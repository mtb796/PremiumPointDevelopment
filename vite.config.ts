import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The pure engine (engine/) is imported directly by the app — no runtime deps.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", sourcemap: true },
});
