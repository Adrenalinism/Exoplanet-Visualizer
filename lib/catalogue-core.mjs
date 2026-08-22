const number = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const text = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
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

export const NASA_COLUMNS = [
  "hostname", "pl_name", "hd_name", "hip_name", "gaia_dr3_id", "tic_id",
  "sy_snum", "sy_pnum", "sy_dist", "ra", "dec", "st_spectype", "st_teff",
  "st_mass", "st_rad", "st_lum", "st_age", "st_met", "pl_letter", "pl_orbper",
  "pl_orbsmax", "pl_orbeccen", "pl_orbincl", "pl_rade", "pl_bmasse", "pl_bmassj",
  "pl_bmassprov", "pl_eqt", "pl_insol", "disc_year", "discoverymethod",
  "disc_facility", "disc_locale", "tran_flag",
];

export const NASA_SOURCE_URL = `https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=${encodeURIComponent(`select ${NASA_COLUMNS.join(",")} from pscomppars`)}&format=json`;

export function compileCatalogue(rows, { retrievedUtc, sourceSha256 = null } = {}) {
  if (!Array.isArray(rows) || rows.length < 6000) {
    throw new Error(`NASA catalogue validation failed: expected at least 6,000 rows, received ${Array.isArray(rows) ? rows.length : "invalid data"}.`);
  }

  const systems = new Map();

  for (const row of rows) {
    const hostname = text(row.hostname);
    const planetName = text(row.pl_name);
    if (!hostname || !planetName) throw new Error("NASA catalogue validation failed: a row is missing its host or planet name.");

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
    const derivedAxis = measuredAxis === null ? deriveSemiMajorAxis(periodDays, system.star.massSolar) : null;
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
        || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const planetNames = systemList.flatMap((system) => system.planets.map((planet) => planet.name));
  if (new Set(planetNames).size !== rows.length) {
    throw new Error("NASA catalogue validation failed: duplicate planet names were returned.");
  }

  const retrievalTime = retrievedUtc ?? new Date().toISOString();
  const metadata = {
    schemaVersion: 1,
    compilerVersion: 2,
    source: "NASA Exoplanet Archive Planetary Systems Composite Parameters",
    sourceTable: "pscomppars",
    sourceUrl: NASA_SOURCE_URL,
    retrievedUtc: retrievalTime,
    sourceModifiedUtc: retrievalTime,
    sourceSha256,
    planetCount: rows.length,
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

  return {
    catalogue: { metadata, systems: systemList },
    searchIndex: { metadata: { schemaVersion: 1, retrievedUtc: retrievalTime, planetCount: rows.length, systemCount: systemList.length }, entries: searchEntries },
  };
}
