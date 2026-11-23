// Lets `node --test` run the TypeScript sources directly: imports in src/ end in .js (NodeNext style),
// so map a relative ./x.js to ./x.ts when only the .ts file exists. Node 22.18+ strips types itself.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && specifier.endsWith(".js") && context.parentURL) {
    const ts = new URL(specifier.slice(0, -3) + ".ts", context.parentURL);
    if (existsSync(fileURLToPath(ts))) return next(ts.href, context);
  }
  return next(specifier, context);
}
