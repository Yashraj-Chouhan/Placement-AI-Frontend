import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";


// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/auth": {
        target: "http://localhost:8081",
        changeOrigin: true,
        secure: false,
      },
      "/users": {
        target: "http://localhost:8081",
        changeOrigin: true,
        secure: false,
      },
      "/tests": {
        target: "http://localhost:8081",
        changeOrigin: true,
        secure: false,
      },
      "/interviews": {
        target: "http://localhost:8081",
        changeOrigin: true,
        secure: false,
      },
      "/results": {
        target: "http://localhost:8081",
        changeOrigin: true,
        secure: false,
      },
      "/ai": {
        target: "http://localhost:8081",
        changeOrigin: true,
        secure: false,
      },
      "/coach": {
        target: "http://localhost:8081",
        changeOrigin: true,
        secure: false,
      },
    },
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
