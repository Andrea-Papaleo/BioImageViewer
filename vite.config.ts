/// <reference types="vitest" />
import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  base: "",
  resolve: {
    alias: {
      "@/": path.resolve(__dirname, "src") + "/",
    },
  },
  plugins: [react(), tailwindcss()],
  test: {
    setupFiles: ["./test-setup.ts"],
    environment: "happy-dom",
  },
});
