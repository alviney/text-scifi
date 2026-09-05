import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { viteSingleFile } from "vite-plugin-singlefile";

// The build target is one self-contained HTML file. Artifacts (and a Capacitor
// WebView, later) both want that, and it keeps the prototype trivially shareable.
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  build: { target: "es2022", assetsInlineLimit: 100000000, cssCodeSplit: false },
});
