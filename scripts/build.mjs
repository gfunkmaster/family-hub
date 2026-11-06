// Builds the single-file app (dist/index.html) that is published as a Claude artifact.
// The artifact runtime only serves one self-contained HTML file, so styles, logic and UI are inlined.
// Logic is authored in TypeScript and type-stripped with Node's built-in stripper (no dependencies).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

export function buildLogic(ts) {
  const js = stripTypeScriptTypes(ts, { mode: "strip" });
  // The page script is a classic script: drop `export` so the functions become page-level bindings.
  return js.replace(/^export\s+(?=(const|function|let|class)\b)/gm, "").replace(/^export\s*\{[^}]*\};?\s*$/gm, "");
}

export function build() {
  const template = read("src/index.html");
  const out = template
    .replace("/*@@STYLES@@*/", () => read("src/styles.css").trimEnd())
    .replace("/*@@LOGIC@@*/", () => buildLogic(read("packages/logic/src/index.ts")).trimEnd())
    .replace("/*@@APP@@*/", () => read("src/app.js").trimEnd());
  if (/\/\*@@[A-Z]+@@\*\//.test(out)) throw new Error("Unreplaced placeholder in template");
  mkdirSync(new URL("dist/", root), { recursive: true });
  writeFileSync(new URL("dist/index.html", root), out);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = build();
  console.log(`dist/index.html: ${(out.length / 1024).toFixed(1)} kB`);
}
