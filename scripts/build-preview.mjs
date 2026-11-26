// Builds dist/preview.html: one self-contained page (inline JS + CSS) of the app without a server.
// Usage: npm run build:preview
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { THEME_BOOT } from "./theme-boot.mjs";

const out = await build({
  entryPoints: ["src/preview/main.tsx"],
  bundle: true,
  minify: true,
  write: false,
  outdir: "dist/.preview",
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  tsconfig: "tsconfig.json",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
const js = out.outputFiles.find((f) => f.path.endsWith(".js")).text.replace(/<\/script/gi, "<\\/script");
const css = out.outputFiles.find((f) => f.path.endsWith(".css")).text.replace(/<\/style/gi, "<\\/style");

const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>עִתִּים · Ittim — preview</title>
<script>${THEME_BOOT}</script>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`;
mkdirSync("dist", { recursive: true });
writeFileSync("dist/preview.html", html);
console.log(`dist/preview.html  ${(html.length / 1024).toFixed(0)} KB`);
