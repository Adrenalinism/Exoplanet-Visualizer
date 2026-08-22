import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, resolve } from "node:path";
import { compileCatalogue, NASA_SOURCE_URL } from "../lib/catalogue-core.mjs";

const cataloguePath = resolve(process.argv[2] ?? "public/data/catalogue.json");
const searchPath = resolve(process.argv[3] ?? "public/data/search-index.json");

async function fetchWithRetry(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`NASA returned HTTP ${response.status}.`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolveWait) => setTimeout(resolveWait, attempt * 2_000));
    }
  }
  throw lastError;
}

async function atomicWrite(path, value) {
  await fs.mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.next`;
  await fs.writeFile(temporaryPath, JSON.stringify(value));
  await fs.rename(temporaryPath, path);
}

const retrievedUtc = new Date().toISOString();
const sourceText = await fetchWithRetry(NASA_SOURCE_URL);
const sourceSha256 = createHash("sha256").update(sourceText).digest("hex");
const rows = JSON.parse(sourceText);
const { catalogue, searchIndex } = compileCatalogue(rows, { retrievedUtc, sourceSha256 });

await Promise.all([
  atomicWrite(cataloguePath, catalogue),
  atomicWrite(searchPath, searchIndex),
]);

console.log(JSON.stringify({ ...catalogue.metadata, cataloguePath, searchPath }, null, 2));
