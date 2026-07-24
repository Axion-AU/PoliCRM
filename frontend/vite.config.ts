import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../src/api/static/dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-leaflet": ["leaflet", "react-leaflet"],
          "vendor-framer-motion": ["framer-motion"],
          "vendor-ui": [
            "lucide-react",
            "@radix-ui/react-slot",
            "class-variance-authority",
            "clsx",
            "tailwind-merge",
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/auth": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/persons": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/import": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/analytics": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/stats": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/users": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/branches": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/tasks": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/memberships": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/donations": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/events": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/email-campaigns": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/sms": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/prospects": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/automations": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/pages": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/p": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/activity": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/era": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
      },
    },
  },
});
