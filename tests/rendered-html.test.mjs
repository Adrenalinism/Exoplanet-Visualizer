import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function builtWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

test("server-renders the Orbis application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Orbis — Exoplanet Atlas<\/title>/i);
  assert.match(html, /ORBIS/);
  assert.match(html, /Loading NASA catalogue/);
  assert.match(html, /Preparing the exoplanet atlas/);
  assert.doesNotMatch(html, /codex-preview/);
});

test("generated NASA data is complete and internally consistent", async () => {
  const [catalogueText, searchText] = await Promise.all([
    readFile(new URL("../public/data/catalogue.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/search-index.json", import.meta.url), "utf8"),
  ]);
  const catalogue = JSON.parse(catalogueText);
  const search = JSON.parse(searchText);

  assert.ok(catalogue.metadata.planetCount >= 6336);
  assert.ok(catalogue.metadata.systemCount >= 4749);
  assert.equal(catalogue.systems.length, catalogue.metadata.systemCount);
  assert.equal(
    catalogue.systems.reduce((count, system) => count + system.planets.length, 0),
    catalogue.metadata.planetCount,
  );
  assert.equal(search.entries.length, catalogue.metadata.planetCount + catalogue.metadata.systemCount);
  assert.ok(!Number.isNaN(Date.parse(catalogue.metadata.retrievedUtc ?? catalogue.metadata.sourceModifiedUtc)));

  const trappist = catalogue.systems.find((system) => system.name === "TRAPPIST-1");
  assert.ok(trappist);
  assert.equal(trappist.planets.length, 7);
  assert.equal(trappist.planets.find((planet) => planet.letter === "e")?.orbitSource, "measured");
});

test("hosted data routes prefer the durable NASA cache", async () => {
  const worker = await builtWorker();
  const cachedBody = JSON.stringify({ metadata: { retrievedUtc: "2026-08-22T00:00:00.000Z" }, systems: [] });
  const response = await worker.fetch(
    new Request("http://localhost/api/catalogue.json"),
    {
      ASSETS: { fetch: async () => new Response("static fallback") },
      CATALOGUE_CACHE: {
        get: async () => ({
          body: cachedBody,
          customMetadata: { retrievedUtc: "2026-08-22T00:00:00.000Z" },
          httpEtag: '"cached"',
        }),
      },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), cachedBody);
  assert.equal(response.headers.get("cache-control"), "no-cache, must-revalidate");
});
