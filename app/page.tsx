"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type NullableNumber = number | null;

type Planet = {
  name: string;
  letter: string | null;
  periodDays: NullableNumber;
  semiMajorAxisAu: NullableNumber;
  orbitSource: "measured" | "derived" | "display-only";
  eccentricity: NullableNumber;
  inclinationDeg: NullableNumber;
  radiusEarth: NullableNumber;
  massEarth: NullableNumber;
  massJupiter: NullableNumber;
  massMethod: string | null;
  equilibriumTempK: NullableNumber;
  insolationEarth: NullableNumber;
  discoveryYear: NullableNumber;
  discoveryMethod: string | null;
  discoveryFacility: string | null;
  discoveryLocale: string | null;
  isTransiting: boolean;
};

type System = {
  name: string;
  aliases: string[];
  starCount: NullableNumber;
  planetCount: number;
  distancePc: NullableNumber;
  raDeg: NullableNumber;
  decDeg: NullableNumber;
  star: {
    spectralType: string | null;
    temperatureK: NullableNumber;
    massSolar: NullableNumber;
    radiusSolar: NullableNumber;
    luminosityLogSolar: NullableNumber;
    ageGyr: NullableNumber;
    metallicityDex: NullableNumber;
  };
  planets: Planet[];
};

type Catalogue = {
  metadata: {
    planetCount: number;
    systemCount: number;
    sourceModifiedUtc: string;
    sourceUrl: string;
  };
  systems: System[];
};

type SearchEntry = {
  label: string;
  type: "system" | "planet";
  systemIndex: number;
  planetIndex: number | null;
  detail: string;
};

type SearchIndex = { entries: SearchEntry[] };
type PanelMode = "details" | "catalogue";
type CataloguePreset = "all" | "nearby" | "multi" | "habitable";
type CatalogueSort = "distance" | "planets" | "recent" | "name";
type ScaleMode = "linear" | "log";
type ViewState = { zoom: number; panX: number; panY: number };

const planetPalette = ["#bd7559", "#d2a27d", "#7e9d93", "#6f9da0", "#9c927b", "#ae8c73", "#718391", "#a98b9d"];

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  result += result << 13;
  result ^= result >>> 7;
  result += result << 3;
  result ^= result >>> 17;
  result += result << 5;
  return result >>> 0;
}

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function planetColor(name: string) {
  return planetPalette[hash(name) % planetPalette.length];
}

function starColor(temperature: NullableNumber) {
  if (temperature === null || temperature < 3700) return "#f08a5d";
  if (temperature < 5200) return "#f1b56b";
  if (temperature < 6000) return "#f0d99a";
  if (temperature < 7500) return "#e8edf3";
  return "#a9c9f8";
}

function format(value: NullableNumber, digits = 2) {
  if (value === null) return "Unknown";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function planetType(planet: Planet) {
  if (planet.radiusEarth === null) return "Confirmed exoplanet";
  if (planet.radiusEarth <= 1.6) return "Rocky-size planet";
  if (planet.radiusEarth <= 4) return "Sub-Neptune-size planet";
  return "Giant planet";
}

function habitableBounds(system: System) {
  if (system.star.luminosityLogSolar === null) return null;
  const luminositySolar = 10 ** system.star.luminosityLogSolar;
  return {
    innerAu: Math.sqrt(luminositySolar / 1.1),
    outerAu: Math.sqrt(luminositySolar / 0.53),
  };
}

function habitablePlanetCount(system: System) {
  const bounds = habitableBounds(system);
  if (!bounds) return 0;
  return system.planets.filter((planet) =>
    planet.semiMajorAxisAu !== null
    && planet.semiMajorAxisAu >= bounds.innerAu
    && planet.semiMajorAxisAu <= bounds.outerAu,
  ).length;
}

function orbitLayout(system: System, scaleMode: ScaleMode) {
  const known = system.planets.map((planet) => planet.semiMajorAxisAu).filter((value): value is number => value !== null && value > 0);
  const min = known.length ? Math.min(...known) : null;
  const max = known.length ? Math.max(...known) : null;

  const mapAxis = (axis: NullableNumber, index: number) => {
    if (axis !== null && axis > 0 && min !== null && max !== null) {
      if (scaleMode === "linear") return (axis / max) * 94;
      if (min === max) return 55;
      return 22 + ((Math.log(axis) - Math.log(min)) / (Math.log(max) - Math.log(min))) * 72;
    }
    return system.planets.length === 1 ? 55 : 22 + (index / Math.max(1, system.planets.length - 1)) * 72;
  };

  const random = seededRandom(hash(system.name));
  const sectors = system.planets.map((_, index) => index);
  for (let index = sectors.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [sectors[index], sectors[swapIndex]] = [sectors[swapIndex], sectors[index]];
  }

  const habitable = habitableBounds(system);
  const habitableInnerAu = habitable?.innerAu ?? null;
  const habitableOuterAu = habitable?.outerAu ?? null;
  const zoneFitsScale = min !== null
    && max !== null
    && habitableInnerAu !== null
    && habitableOuterAu !== null
    && habitableOuterAu <= max
    && (scaleMode === "linear" || (min < max && habitableInnerAu >= min));
  const habitableInnerSize = zoneFitsScale ? mapAxis(habitableInnerAu, 0) : null;
  const habitableOuterSize = zoneFitsScale ? mapAxis(habitableOuterAu, 0) : null;

  return {
    planets: system.planets.map((planet, index) => {
      const orbitSize = mapAxis(planet.semiMajorAxisAu, index);
      const phase = sectors.length === 1 ? random() : (sectors[index] + 0.1 + random() * 0.8) / sectors.length;
      const angle = phase * Math.PI * 2;
      return {
        ...planet,
        orbitSize,
        left: 50 + Math.cos(angle) * orbitSize / 2,
        top: 50 + Math.sin(angle) * orbitSize / 2,
      };
    }),
    mapAxis,
    habitableZone: habitableInnerSize !== null && habitableOuterSize !== null
      ? {
          outerSize: habitableOuterSize,
          innerRatio: (habitableInnerSize / habitableOuterSize) * 100,
        }
      : null,
  };
}

function useCatalogue() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [searchIndex, setSearchIndex] = useState<SearchIndex | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/data/catalogue.json").then((response) => {
        if (!response.ok) throw new Error("Catalogue failed to load");
        return response.json() as Promise<Catalogue>;
      }),
      fetch("/data/search-index.json").then((response) => {
        if (!response.ok) throw new Error("Search index failed to load");
        return response.json() as Promise<SearchIndex>;
      }),
    ]).then(([nextCatalogue, nextSearch]) => {
      setCatalogue(nextCatalogue);
      setSearchIndex(nextSearch);
    }).catch(() => setError(true));
  }, []);

  return { catalogue, searchIndex, error };
}

export default function Home() {
  const { catalogue, searchIndex, error } = useCatalogue();
  const [systemIndex, setSystemIndex] = useState<number | null>(null);
  const [selectedPlanetIndex, setSelectedPlanetIndex] = useState<number | null>(3);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [scaleMode, setScaleMode] = useState<ScaleMode>("linear");
  const [view, setView] = useState<ViewState>({ zoom: 1, panX: 0, panY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>("details");
  const [cataloguePreset, setCataloguePreset] = useState<CataloguePreset>("nearby");
  const [catalogueSort, setCatalogueSort] = useState<CatalogueSort>("distance");
  const [catalogueLimit, setCatalogueLimit] = useState(30);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (catalogue && systemIndex === null) {
      const initial = catalogue.systems.findIndex((system) => system.name === "TRAPPIST-1");
      setSystemIndex(initial >= 0 ? initial : 0);
    }
  }, [catalogue, systemIndex]);

  const system = catalogue && systemIndex !== null ? catalogue.systems[systemIndex] : null;
  const layout = useMemo(() => system ? orbitLayout(system, scaleMode) : null, [system, scaleMode]);
  const selectedPlanet = system && selectedPlanetIndex !== null ? system.planets[selectedPlanetIndex] ?? null : null;
  const selectedColor = selectedPlanet ? planetColor(selectedPlanet.name) : starColor(system?.star.temperatureK ?? null);

  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term || !searchIndex) return [];
    return searchIndex.entries
      .filter((entry) => entry.label.toLowerCase().includes(term))
      .sort((a, b) => {
        const aStarts = a.label.toLowerCase().startsWith(term) ? 0 : 1;
        const bStarts = b.label.toLowerCase().startsWith(term) ? 0 : 1;
        return aStarts - bStarts || a.label.length - b.label.length;
      })
      .slice(0, 8);
  }, [query, searchIndex]);

  const catalogueResults = useMemo(() => {
    if (!catalogue) return [];
    const results = catalogue.systems.map((candidate, index) => ({
      system: candidate,
      index,
      habitableCount: habitablePlanetCount(candidate),
      latestDiscovery: Math.max(...candidate.planets.map((planet) => planet.discoveryYear ?? 0)),
    })).filter((entry) => {
      if (cataloguePreset === "nearby") return entry.system.distancePc !== null && entry.system.distancePc * 3.26156 <= 100;
      if (cataloguePreset === "multi") return entry.system.planetCount >= 3;
      if (cataloguePreset === "habitable") return entry.habitableCount > 0;
      return true;
    });

    results.sort((a, b) => {
      if (catalogueSort === "distance") return (a.system.distancePc ?? Number.POSITIVE_INFINITY) - (b.system.distancePc ?? Number.POSITIVE_INFINITY) || a.system.name.localeCompare(b.system.name);
      if (catalogueSort === "planets") return b.system.planetCount - a.system.planetCount || a.system.name.localeCompare(b.system.name);
      if (catalogueSort === "recent") return b.latestDiscovery - a.latestDiscovery || a.system.name.localeCompare(b.system.name);
      return a.system.name.localeCompare(b.system.name);
    });
    return results;
  }, [catalogue, cataloguePreset, catalogueSort]);

  function chooseSearchResult(entry: SearchEntry) {
    setSystemIndex(entry.systemIndex);
    setSelectedPlanetIndex(entry.type === "planet" ? entry.planetIndex : null);
    resetView();
    setQuery("");
    setSearchOpen(false);
    setPanelMode("details");
  }

  function choosePreset(preset: CataloguePreset) {
    setCataloguePreset(preset);
    setCatalogueLimit(30);
    if (preset === "nearby" || preset === "habitable") setCatalogueSort("distance");
    if (preset === "multi") setCatalogueSort("planets");
  }

  function browseSystem(index: number) {
    setSystemIndex(index);
    setSelectedPlanetIndex(null);
    resetView();
  }

  function surpriseMe() {
    if (!catalogue?.systems.length) return;
    browseSystem(Math.floor(Math.random() * catalogue.systems.length));
    setPanelMode("details");
  }

  function resetView() {
    setView({ zoom: 1, panX: 0, panY: 0 });
  }

  function changeScale(nextScale: ScaleMode) {
    setScaleMode(nextScale);
    resetView();
  }

  function zoomAt(factor: number, clientX?: number, clientY?: number, bounds?: DOMRect) {
    setView((current) => {
      const nextZoom = Math.max(0.7, Math.min(50, current.zoom * factor));
      if (!bounds || clientX === undefined || clientY === undefined || nextZoom === current.zoom) {
        return { ...current, zoom: nextZoom };
      }
      const pointerX = clientX - bounds.left;
      const pointerY = clientY - bounds.top;
      const baseX = bounds.width * 0.53;
      const baseY = bounds.height * 0.53;
      const ratio = nextZoom / current.zoom;
      return {
        zoom: nextZoom,
        panX: current.panX + (pointerX - baseX - current.panX) * (1 - ratio),
        panY: current.panY + (pointerY - baseY - current.panY) * (1 - ratio),
      };
    });
  }

  function handleWheel(event: React.WheelEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const isInsideCanvas = event.clientX >= bounds.left
      && event.clientX <= bounds.right
      && event.clientY >= bounds.top
      && event.clientY <= bounds.bottom;
    if (!isInsideCanvas) return;
    event.preventDefault();
    event.stopPropagation();
    const factor = Math.exp(-event.deltaY * 0.0015);
    zoomAt(factor, event.clientX, event.clientY, bounds);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    const isPanButton = event.pointerType === "mouse" ? event.button === 1 : event.button === 0;
    const isTouchingControl = event.pointerType !== "mouse" && (event.target as HTMLElement).closest("button");
    if (!isPanButton || isTouchingControl) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setIsDragging(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.pointerType === "mouse" && (event.buttons & 4) === 0) {
      endPointer(event);
      return;
    }
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
    setView((current) => ({ ...current, panX: current.panX + deltaX, panY: current.panY + deltaY }));
  }

  function endPointer(event: React.PointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const starFacts = system ? [
    { label: "Distance from Earth", value: system.distancePc === null ? "Unknown" : `${format(system.distancePc * 3.26156)} ly` },
    { label: "Spectral type", value: system.star.spectralType ?? "Unknown" },
    { label: "Mass", value: system.star.massSolar === null ? "Unknown" : `${format(system.star.massSolar, 4)} M☉` },
    { label: "Radius", value: system.star.radiusSolar === null ? "Unknown" : `${format(system.star.radiusSolar, 4)} R☉` },
    { label: "Temperature", value: system.star.temperatureK === null ? "Unknown" : `${format(system.star.temperatureK, 0)} K` },
    { label: "Known planets", value: String(system.planetCount) },
  ] : [];

  const planetFacts = selectedPlanet ? [
    { label: "Orbital period", value: selectedPlanet.periodDays === null ? "Unknown" : `${format(selectedPlanet.periodDays, 4)} days` },
    { label: "Orbital radius", value: selectedPlanet.semiMajorAxisAu === null ? "Unknown" : `${selectedPlanet.orbitSource === "derived" ? "≈ " : ""}${format(selectedPlanet.semiMajorAxisAu, 5)} AU` },
    { label: "Radius", value: selectedPlanet.radiusEarth === null ? "Unknown" : `${format(selectedPlanet.radiusEarth, 3)} R⊕` },
    { label: "Mass", value: selectedPlanet.massEarth === null ? "Unknown" : `${format(selectedPlanet.massEarth, 3)} M⊕` },
    { label: "Equilibrium temp.", value: selectedPlanet.equilibriumTempK === null ? "Unknown" : `${format(selectedPlanet.equilibriumTempK, 0)} K` },
    { label: "Discovery", value: [selectedPlanet.discoveryYear, selectedPlanet.discoveryMethod].filter(Boolean).join(" · ") || "Unknown" },
  ] : [];

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Orbis home">
          <span className="brand-mark" />
          <span>ORBIS</span>
          <small>EXOPLANET ATLAS</small>
        </a>
        <div className="search-wrap">
          <label className="search">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Search planetary systems"
              placeholder={catalogue ? "Search 4,749 systems and 6,336 planets…" : "Loading NASA catalogue…"}
              value={query}
              disabled={!catalogue}
              onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearchOpen(false);
                if (event.key === "Enter" && searchResults[0]) chooseSearchResult(searchResults[0]);
              }}
            />
            <kbd>↵</kbd>
          </label>
          {searchOpen && query && (
            <div className="search-results">
              {searchResults.length ? searchResults.map((entry) => (
                <button type="button" key={`${entry.type}-${entry.systemIndex}-${entry.planetIndex}`} onClick={() => chooseSearchResult(entry)}>
                  <i className={entry.type} />
                  <span><strong>{entry.label}</strong><small>{entry.detail}</small></span>
                  <em>{entry.type}</em>
                </button>
              )) : <p>No catalogue matches</p>}
            </div>
          )}
        </div>
        <div className="data-status">{catalogue ? `${catalogue.metadata.planetCount.toLocaleString()} confirmed planets` : "Loading catalogue"}</div>
      </header>

      <aside className="information-panel">
        {system ? (
          <>
            <div className="panel-tabs" role="tablist" aria-label="Information panel mode">
              <button type="button" role="tab" aria-selected={panelMode === "details"} className={panelMode === "details" ? "active" : ""} onClick={() => setPanelMode("details")}>Details</button>
              <button type="button" role="tab" aria-selected={panelMode === "catalogue"} className={panelMode === "catalogue" ? "active" : ""} onClick={() => setPanelMode("catalogue")}>Catalogue</button>
            </div>

            {panelMode === "details" ? (
              <div className="details-panel" role="tabpanel">
                <div className="eyebrow"><span /> Selected object</div>
                <div className="object-heading">
                  <div>
                    <p>{selectedPlanet ? planetType(selectedPlanet) : system.star.spectralType ? `${system.star.spectralType} host star` : "Host star"}</p>
                    <h1>{selectedPlanet?.name ?? system.name}</h1>
                  </div>
                  <div className={`planet-preview ${selectedPlanet ? "" : "star-preview"}`} style={{ "--body-color": selectedColor } as React.CSSProperties} />
                </div>
                <p className="summary">
                  {selectedPlanet
                    ? `${selectedPlanet.name} is one of ${system.planetCount} confirmed planet${system.planetCount === 1 ? "" : "s"} orbiting ${system.name}.${selectedPlanet.discoveryMethod ? ` It was identified using ${selectedPlanet.discoveryMethod.toLowerCase()}.` : ""}`
                    : `${system.name} hosts ${system.planetCount} confirmed planet${system.planetCount === 1 ? "" : "s"}${system.distancePc === null ? "." : `, approximately ${format(system.distancePc * 3.26156)} light-years from Earth.`}`}
                </p>
                <div className="fact-list">
                  {(selectedPlanet ? planetFacts : starFacts).map((fact) => (
                    <div className="fact" key={fact.label}><span>{fact.label}</span><strong>{fact.value}</strong></div>
                  ))}
                </div>
                <div className="scale-note">
                  <span>i</span>
                  <p>
                    <strong>{selectedPlanet?.orbitSource === "derived" ? "Derived orbit" : selectedPlanet?.orbitSource === "display-only" ? "Illustrative orbit" : "Display scale"}</strong>
                    {selectedPlanet?.orbitSource === "derived"
                      ? "Orbital radius was calculated from period and stellar mass. The ≈ symbol marks this derived value."
                      : selectedPlanet?.orbitSource === "display-only"
                        ? "NASA has insufficient orbital data, so this planet’s placement is illustrative only."
                        : `Body sizes are exaggerated for visibility. Orbital distances use a ${scaleMode === "linear" ? "linear" : "logarithmic"} scale. Scroll over the planetary view to zoom; hold the middle mouse button and drag to pan.`}
                  </p>
                </div>
                <a className="source-link" href={catalogue?.metadata.sourceUrl ?? "https://exoplanetarchive.ipac.caltech.edu/"} target="_blank" rel="noreferrer">View NASA source data <span>↗</span></a>
              </div>
            ) : (
              <div className="catalogue-panel" role="tabpanel">
                <div className="catalogue-heading">
                  <div><span>Explore</span><h1>Planetary systems</h1></div>
                  <button type="button" className="surprise-button" onClick={surpriseMe}>Surprise me</button>
                </div>
                <p className="catalogue-intro">Browse the NASA archive without needing to know a name first.</p>

                <div className="preset-list" aria-label="Catalogue collections">
                  {([
                    ["nearby", "Nearby", "≤ 100 ly"],
                    ["multi", "Multi-planet", "3+ worlds"],
                    ["habitable", "Est. habitable zone", "orbit candidates"],
                    ["all", "All systems", "complete archive"],
                  ] as [CataloguePreset, string, string][]).map(([value, label, note]) => (
                    <button type="button" key={value} className={cataloguePreset === value ? "active" : ""} onClick={() => choosePreset(value)}>
                      <strong>{label}</strong><small>{note}</small>
                    </button>
                  ))}
                </div>

                <div className="catalogue-toolbar">
                  <span>{catalogueResults.length.toLocaleString()} systems</span>
                  <label>Sort
                    <select value={catalogueSort} onChange={(event) => { setCatalogueSort(event.target.value as CatalogueSort); setCatalogueLimit(30); }}>
                      <option value="distance">Nearest</option>
                      <option value="planets">Most planets</option>
                      <option value="recent">Recently discovered</option>
                      <option value="name">A–Z</option>
                    </select>
                  </label>
                </div>

                <div className="system-list">
                  {catalogueResults.slice(0, catalogueLimit).map((entry) => (
                    <button
                      type="button"
                      key={entry.system.name}
                      className={systemIndex === entry.index ? "system-card active" : "system-card"}
                      onClick={() => browseSystem(entry.index)}
                    >
                      <span className="system-card-copy">
                        <strong>{entry.system.name}</strong>
                        <small>{entry.system.star.spectralType ?? "Unknown stellar type"} · {entry.system.distancePc === null ? "Distance unknown" : `${format(entry.system.distancePc * 3.26156)} ly`}</small>
                        {entry.habitableCount > 0 && <em>{entry.habitableCount} orbit{entry.habitableCount === 1 ? "" : "s"} in estimated HZ</em>}
                      </span>
                      <span className="planet-count"><strong>{entry.system.planetCount}</strong><small>planet{entry.system.planetCount === 1 ? "" : "s"}</small></span>
                    </button>
                  ))}
                </div>
                {catalogueLimit < catalogueResults.length && (
                  <button type="button" className="load-more" onClick={() => setCatalogueLimit((value) => value + 30)}>Load 30 more</button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="catalogue-loading"><span className="brand-mark" /><p>{error ? "The catalogue could not be loaded." : "Preparing the exoplanet atlas…"}</p></div>
        )}
      </aside>

      <section
        className={`system-view ${isDragging ? "is-dragging" : ""}`}
        aria-label={system ? `${system.name} planetary system visualization` : "Planetary system visualization"}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onAuxClick={(event) => { if (event.button === 1) event.preventDefault(); }}
      >
        {system && layout ? (
          <>
            <div className="system-meta">
              <span>Planetary system</span>
              <h2>{system.name}</h2>
              <p>{system.distancePc === null ? "Distance unknown" : `${format(system.distancePc * 3.26156)} light-years away`} · {system.planetCount} confirmed planet{system.planetCount === 1 ? "" : "s"}</p>
            </div>
            <div className="view-badge">NASA SNAPSHOT</div>
            <div
              className="orbit-pan-layer"
              style={{ "--pan-x": `${view.panX}px`, "--pan-y": `${view.panY}px` } as React.CSSProperties}
            >
            <div className="orbit-stage">
              {layout.habitableZone && (
                <div
                  className="habitable-zone"
                  aria-label="Approximate habitable zone"
                  style={{
                    "--zone-outer": `${layout.habitableZone.outerSize * view.zoom}%`,
                    "--zone-inner-ratio": `${layout.habitableZone.innerRatio}%`,
                  } as React.CSSProperties}
                />
              )}
              {layout.planets.map((planet) => (
                <div className="orbit dynamic-orbit" key={`orbit-${planet.name}`} style={{ "--orbit-size": `${planet.orbitSize * view.zoom}%` } as React.CSSProperties} />
              ))}
              <button
                className={`celestial-body body-star ${selectedPlanetIndex === null ? "is-selected" : ""}`}
                type="button"
                onClick={() => { setSelectedPlanetIndex(null); setPanelMode("details"); }}
                aria-label={`Select ${system.name}`}
                style={{ "--body-color": starColor(system.star.temperatureK), "--body-size": "62px" } as React.CSSProperties}
              ><span className="body-label">{system.name}</span></button>
              {layout.planets.map((planet, index) => (
                <button
                  className={`celestial-body dynamic-body ${selectedPlanetIndex === index ? "is-selected" : ""}`}
                  type="button"
                  key={planet.name}
                  onClick={() => { setSelectedPlanetIndex(index); setPanelMode("details"); }}
                  aria-label={`Select ${planet.name}`}
                  style={{
                    "--body-color": planetColor(planet.name),
                    "--body-size": `${Math.max(9, Math.min(20, 8 + (planet.radiusEarth ?? 1) * 2.2))}px`,
                    left: `${50 + (planet.left - 50) * view.zoom}%`,
                    top: `${50 + (planet.top - 50) * view.zoom}%`,
                  } as React.CSSProperties}
                ><span className="body-label">{planet.letter?.toUpperCase() ?? index + 1}</span></button>
              ))}
            </div>
            </div>
            <div className="legend">
              {layout.habitableZone && <span><i className="legend-line habitable" /> Approx. habitable zone</span>}
              <span><i className="legend-line measured" /> Measured orbit</span>
              <span><i className="legend-line derived" /> Derived when needed</span>
            </div>
            <div className="view-controls">
              <button type="button" className={`scale-control ${scaleMode === "linear" ? "active" : ""}`} aria-label="Use linear orbit scale" aria-pressed={scaleMode === "linear"} onClick={() => changeScale("linear")}>LIN</button>
              <button type="button" className={`scale-control ${scaleMode === "log" ? "active" : ""}`} aria-label="Use logarithmic orbit scale" aria-pressed={scaleMode === "log"} onClick={() => changeScale("log")}>LOG</button>
              <button type="button" aria-label="Reset view" onClick={resetView}>↺</button>
              <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1.25)}>＋</button>
              <button type="button" aria-label="Zoom out" onClick={() => zoomAt(.8)}>−</button>
            </div>
          </>
        ) : <div className="space-loader"><span /></div>}
      </section>
    </main>
  );
}
