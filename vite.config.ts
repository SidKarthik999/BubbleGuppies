import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Web app (Agent 1) proxies same-origin /api calls to the analysis server
// (Agent 2), which listens on 127.0.0.1:8787. See README for the two-process
// dev workflow: `npm run dev` + `npm run api`.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
