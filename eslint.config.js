// Flat config without plugins, so the project needs no extra packages.
// TypeScript (src/logic.ts) is checked by `tsc`; ESLint covers the JavaScript files.
import { readFileSync } from "node:fs";

// The UI (src/app.js) runs in the same script as the inlined logic, so logic exports are globals there.
const logicExports = [...readFileSync(new URL("./src/logic.ts", import.meta.url), "utf8")
  .matchAll(/^export\s+(?:const|function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
const ro = (names) => Object.fromEntries(names.map((n) => [n, "readonly"]));

const rules = {
  "no-undef": "error",
  "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
  "no-redeclare": "error",
  "no-dupe-keys": "error",
  "no-unreachable": "error",
  "no-const-assign": "error",
  "no-self-compare": "error",
  "no-constant-condition": ["error", { checkLoops: false }],
  "prefer-const": "error",
  "no-var": "error"
};

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  {
    files: ["src/app.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "script",
      globals: {
        ...ro(["window", "document", "location", "localStorage", "setTimeout", "clearTimeout", "CSS", "URL", "console"]),
        ...ro(logicExports)
      }
    },
    rules
  },
  {
    files: ["scripts/**/*.mjs", "test/**/*.mjs", "eslint.config.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: ro(["process", "console", "URL"]) },
    rules
  }
];
