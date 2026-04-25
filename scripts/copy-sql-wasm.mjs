// Copy sql.js's wasm into /public so the browser can fetch it from the same
// origin as the page. Runs on postinstall and again before `next build`.
import { copyFile, mkdir, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = resolve(root, "node_modules/sql.js/dist/sql-wasm.wasm");
const dst = resolve(root, "public/sql-wasm.wasm");

try {
  await access(src);
} catch {
  // sql.js not installed yet (e.g. during a fresh checkout before npm i).
  console.log("[copy-sql-wasm] sql.js not installed yet; skipping.");
  process.exit(0);
}

await mkdir(dirname(dst), { recursive: true });
await copyFile(src, dst);
console.log("[copy-sql-wasm] copied sql-wasm.wasm into /public");
