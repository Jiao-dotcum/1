import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    host: true,
  },
  // Pre-bundle these so dev startup is snappy.
  optimizeDeps: {
    include: ["three", "colyseus.js", "livekit-client"],
  },
});
