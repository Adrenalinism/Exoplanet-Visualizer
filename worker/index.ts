/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { compileCatalogue, NASA_SOURCE_URL } from "../lib/catalogue-core.mjs";

const CATALOGUE_KEY = "catalogue.json";
const SEARCH_KEY = "search-index.json";
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
let refreshInFlight: Promise<void> | null = null;

interface Env {
  ASSETS: Fetcher;
  CATALOGUE_CACHE?: R2Bucket;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

function jsonHeaders(etag?: string) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache, must-revalidate",
  });
  if (etag) headers.set("etag", etag);
  return headers;
}

async function refreshCatalogue(env: Env) {
  if (!env.CATALOGUE_CACHE) return;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const response = await fetch(NASA_SOURCE_URL, {
      headers: { "user-agent": "Orbis Exoplanet Atlas/1.0" },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`NASA catalogue refresh returned HTTP ${response.status}.`);

    const rows = await response.json<Record<string, unknown>[]>();
    const retrievedUtc = new Date().toISOString();
    const { catalogue, searchIndex } = compileCatalogue(rows, { retrievedUtc });
    const customMetadata = { retrievedUtc };

    // Write the search index first and the catalogue last. The catalogue object
    // is the commit marker, so clients never observe a new catalogue with an old index.
    await env.CATALOGUE_CACHE.put(SEARCH_KEY, JSON.stringify(searchIndex), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata,
    });
    await env.CATALOGUE_CACHE.put(CATALOGUE_KEY, JSON.stringify(catalogue), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata,
    });
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

async function cachedCatalogueResponse(pathname: string, env: Env, ctx: ExecutionContext) {
  if (!env.CATALOGUE_CACHE) return null;
  const key = pathname.endsWith(`/${SEARCH_KEY}`) ? SEARCH_KEY : CATALOGUE_KEY;
  const object = await env.CATALOGUE_CACHE.get(key);

  if (key === CATALOGUE_KEY) {
    const retrievedAt = Date.parse(object?.customMetadata?.retrievedUtc ?? "");
    const stale = !Number.isFinite(retrievedAt) || Date.now() - retrievedAt >= REFRESH_INTERVAL_MS;
    if (stale) ctx.waitUntil(refreshCatalogue(env).catch((error) => console.error("NASA catalogue refresh failed", error)));
  }

  if (!object) return null;
  return new Response(object.body, { headers: jsonHeaders(object.httpEtag) });
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith(`/data/${CATALOGUE_KEY}`) || url.pathname.endsWith(`/data/${SEARCH_KEY}`)) {
      const cached = await cachedCatalogueResponse(url.pathname, env, ctx);
      if (cached) return cached;
      if (url.pathname.endsWith(`/data/${CATALOGUE_KEY}`) && env.CATALOGUE_CACHE) {
        ctx.waitUntil(refreshCatalogue(env).catch((error) => console.error("Initial NASA catalogue refresh failed", error)));
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
