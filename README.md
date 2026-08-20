# Orbis — Exoplanet Atlas

Orbis is an interactive browser-based atlas of every confirmed exoplanet in a
NASA Exoplanet Archive snapshot. Search for a host star or planet, inspect its
known properties, and explore a compressed top-down model of the system.

## Development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run data:build
npm run dev
```

Use `npm run build` to verify the production build.

## Data workflow

The raw 81.5 MB NASA CSV is stored under `data/` and intentionally excluded
from Git. `npm run data:build` compiles it into the compact, browser-ready files
under `public/data/`. See `data/README.md` for the source query, checksum,
validation counts, and handling of derived or illustrative orbital placement.

Planet and star sizes are exaggerated for visibility. Orbital distances are
shown on a logarithmic scale; this is stated in the interface.
