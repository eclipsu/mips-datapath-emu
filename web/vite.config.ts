import { defineConfig } from "vite";

// Multi-page app: one HTML entry per page. Add new pages to `input`.
export default defineConfig({
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        probe: new URL("./index.html", import.meta.url).pathname,
      },
    },
  },
});
