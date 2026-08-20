import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { parse } from "csv-parse";

const inputPath = resolve(process.argv[2] ?? "data/nasa_exoplanet_archive_pscomppars.csv");
const cataloguePath = resolve(process.argv[3] ?? "public/data/catalogue.json");
const searchPath = resolve(process.argv[4] ?? "public/data/search-index.json");

const number = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const text = (value) => {
  const trimmed = value?.trim();
  return trimmed || null;
};

const truthy = (value) => value === "1" || value === 1 || value === true;

function firstPresent(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (target[key] === null && value !== null) target[key] = value;
  }
}

function deriveSemiMajorAxis(periodDays, stellarMassSolar) {
  if (!periodDays || !stellarMassSolar || periodDays <= 0 || stellarMassSolar <= 0) return null;
  const periodYears = periodDays / 365.25;
  return Math.cbrt(stellarMassSolar * periodYears ** 2);
}

async function sha256(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function writeJson(path, value) {
  await fs.mkdir(dirname(path), { recursive: true });
  await new Promise((resolveWrite, rejectWrite) => {
    const output = createWriteStream(path, { encoding: "utf8" });
    output.on("error", rejectWrite);
    output.on("finish", resolveWrite);
    output.end(JSON.stringify(value));
  });
}

const systems = new Map();
let rowCount = 0;

const parser = createReadStream(inputPath).pipe(parse({
  columns: true,
  bom: true,
  skip_empty_lines: true,
  relax_column_count: true,
  relax_quotes: true,
}));

for await (const row of parser) {
  rowCount += 1;
  const hostname = text(row.hostname);
  const planetName = text(row.pl_name);
  if (!hostname || !planetName) continue;

  let system = systems.get(hostname);
  if (!system) {
    system = {
      name: hostname,
      aliases: [text(row.hd_name), text(row.hip_name), text(row.gaia_dr3_id), text(row.tic_id)].filter(Boolean),
      starCount: number(row.sy_snum),
      planetCount: number(row.sy_pnum),
      distancePc: number(row.sy_dist),
      raDeg: number(row.ra),
      decDeg: number(row.dec),
      star: {
        spectralType: text(row.st_spectype),
        temperatureK: number(row.st_teff),
        massSolar: number(row.st_mass),
        radiusSolar: number(row.st_rad),
        luminosityLogSolar: number(row.st_lum),
        ageGyr: number(row.st_age),
        metallicityDex: number(row.st_met),
      },
      planets: [],
    };
    systems.set(hostname, system);
  } else {
    firstPresent(system.star, {
      spectralType: text(row.st_spectype),
      temperatureK: number(row.st_teff),
      massSolar: number(row.st_mass),
      radiusSolar: number(row.st_rad),
      luminosityLogSolar: number(row.st_lum),
      ageGyr: number(row.st_age),
      metallicityDex: number(row.st_met),
    });
  }

  const periodDays = number(row.pl_orbper);
  const measuredAxis = number(row.pl_orbsmax);
  const derivedAxis = measuredAxis === null
    ? deriveSemiMajorAxis(periodDays, system.star.massSolar)
    : null;

  system.planets.push({
    name: planetName,
    letter: text(row.pl_letter),
    periodDays,
    semiMajorAxisAu: measuredAxis ?? derivedAxis,
    orbitSource: measuredAxis !== null ? "measured" : derivedAxis !== null ? "derived" : "display-only",
    eccentricity: number(row.pl_orbeccen),
    inclinationDeg: number(row.pl_orbincl),
    radiusEarth: number(row.pl_rade),
    massEarth: number(row.pl_bmasse),
    massJupiter: number(row.pl_bmassj),
    massMethod: text(row.pl_bmassprov),
    equilibriumTempK: number(row.pl_eqt),
    insolationEarth: number(row.pl_insol),
    discoveryYear: number(row.disc_year),
    discoveryMethod: text(row.discoverymethod),
    discoveryFacility: text(row.disc_facility),
    discoveryLocale: text(row.disc_locale),
    isTransiting: truthy(row.tran_flag),
  });
}

const systemList = [...systems.values()]
  .map((system) => ({
    ...system,
    aliases: [...new Set(system.aliases)],
    planetCount: system.planets.length,
    planets: system.planets.sort((a, b) =>
      (a.semiMajorAxisAu ?? Number.POSITIVE_INFINITY) - (b.semiMajorAxisAu ?? Number.POSITIVE_INFINITY)
      || (a.periodDays ?? Number.POSITIVE_INFINITY) - (b.periodDays ?? Number.POSITIVE_INFINITY)
      || a.name.localeCompare(b.name),
    ),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const duplicatePlanets = systemList
  .flatMap((system) => system.planets.map((planet) => planet.name))
  .filter((name, index, all) => all.indexOf(name) !== index);

if (rowCount !== systemList.reduce((sum, system) => sum + system.planets.length, 0)) {
  throw new Error("Catalogue validation failed: input and output planet counts differ.");
}
if (duplicatePlanets.length) {
  throw new Error(`Catalogue validation failed: duplicate planets found (${duplicatePlanets.slice(0, 5).join(", ")}).`);
}

const stat = await fs.stat(inputPath);
const metadata = {
  schemaVersion: 1,
  compilerVersion: 1,
  source: "NASA Exoplanet Archive Planetary Systems Composite Parameters",
  sourceTable: "pscomppars",
  sourceUrl: "https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=select+*+from+pscomppars&format=csv",
  sourceModifiedUtc: stat.mtime.toISOString(),
  sourceSha256: await sha256(inputPath),
  planetCount: rowCount,
  systemCount: systemList.length,
};

const searchEntries = systemList.flatMap((system, systemIndex) => [
  { label: system.name, type: "system", systemIndex, planetIndex: null, detail: `${system.planetCount} planet${system.planetCount === 1 ? "" : "s"}` },
  ...system.planets.map((planet, planetIndex) => ({
    label: planet.name,
    type: "planet",
    systemIndex,
    planetIndex,
    detail: system.name,
  })),
]);

await writeJson(cataloguePath, { metadata, systems: systemList });
await writeJson(searchPath, { metadata: { schemaVersion: 1, planetCount: rowCount, systemCount: systemList.length }, entries: searchEntries });

const catalogueSize = (await fs.stat(cataloguePath)).size;
const searchSize = (await fs.stat(searchPath)).size;
console.log(JSON.stringify({ ...metadata, catalogueBytes: catalogueSize, searchIndexBytes: searchSize }, null, 2));
