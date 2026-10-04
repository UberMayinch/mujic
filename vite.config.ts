import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // The API key lives server-side only; the browser talks to this proxy.
      "/api": "http://localhost:8787",
    },
  },
});
