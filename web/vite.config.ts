import { defineConfig } from "vite";

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
