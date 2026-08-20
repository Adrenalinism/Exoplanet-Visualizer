"use client";

import { useState } from "react";

const bodies = [
  { id: "star", name: "TRAPPIST-1", type: "Ultra-cool red dwarf", orbit: 0, size: 62, color: "#f08a5d" },
  { id: "b", name: "TRAPPIST-1 b", type: "Terrestrial planet", orbit: 1, size: 13, color: "#bd7559" },
  { id: "c", name: "TRAPPIST-1 c", type: "Terrestrial planet", orbit: 2, size: 14, color: "#d2a27d" },
  { id: "d", name: "TRAPPIST-1 d", type: "Terrestrial planet", orbit: 3, size: 10, color: "#7e9d93" },
  { id: "e", name: "TRAPPIST-1 e", type: "Terrestrial planet", orbit: 4, size: 12, color: "#6f9da0" },
  { id: "f", name: "TRAPPIST-1 f", type: "Terrestrial planet", orbit: 5, size: 13, color: "#9c927b" },
  { id: "g", name: "TRAPPIST-1 g", type: "Terrestrial planet", orbit: 6, size: 15, color: "#ae8c73" },
  { id: "h", name: "TRAPPIST-1 h", type: "Terrestrial planet", orbit: 7, size: 9, color: "#718391" },
];

const facts: Record<string, { label: string; value: string }[]> = {
  star: [
    { label: "Distance from Earth", value: "40.66 ly" },
    { label: "Spectral type", value: "M8 V" },
    { label: "Mass", value: "0.090 M☉" },
    { label: "Radius", value: "0.120 R☉" },
    { label: "Temperature", value: "2,566 K" },
    { label: "Known planets", value: "7" },
  ],
  e: [
    { label: "Orbital period", value: "6.10 days" },
    { label: "Orbital radius", value: "0.029 AU" },
    { label: "Radius", value: "0.920 R⊕" },
    { label: "Mass", value: "0.692 M⊕" },
    { label: "Equilibrium temp.", value: "250 K" },
    { label: "Discovery", value: "2017 · Transit" },
  ],
};

const fallbackFacts = [
  { label: "Classification", value: "Terrestrial" },
  { label: "Detection method", value: "Transit" },
  { label: "Host star", value: "TRAPPIST-1" },
  { label: "Data source", value: "NASA Exoplanet Archive" },
];

export default function Home() {
  const [selectedId, setSelectedId] = useState("e");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const selected = bodies.find((body) => body.id === selectedId) ?? bodies[0];
  const searchResults = bodies.filter((body) =>
    body.name.toLowerCase().includes(query.toLowerCase()),
  );

  function chooseBody(id: string) {
    setSelectedId(id);
    setQuery("");
    setSearchOpen(false);
  }

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
              placeholder="Search systems, stars or planets…"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearchOpen(false);
                if (event.key === "Enter" && searchResults[0]) chooseBody(searchResults[0].id);
              }}
            />
            <kbd>↵</kbd>
          </label>
          {searchOpen && query && (
            <div className="search-results">
              {searchResults.length ? searchResults.map((body) => (
                <button type="button" key={body.id} onClick={() => chooseBody(body.id)}>
                  <i style={{ background: body.color }} />
                  <span><strong>{body.name}</strong><small>{body.type}</small></span>
                  <em>{body.id === "star" ? "STAR" : "PLANET"}</em>
                </button>
              )) : <p>No matching objects in this system</p>}
            </div>
          )}
        </div>
        <button className="data-status" type="button">
          <span /> 6,336 confirmed planets
        </button>
      </header>

      <aside className="information-panel">
        <div className="eyebrow"><span /> Selected object</div>
        <div className="object-heading">
          <div>
            <p>{selected.type}</p>
            <h1>{selected.name}</h1>
          </div>
          <div className="planet-preview" style={{ "--body-color": selected.color } as React.CSSProperties} />
        </div>
        <p className="summary">
          {selected.id === "star"
            ? "An ultra-cool dwarf hosting seven known rocky worlds in a remarkably compact planetary system."
            : "A compact rocky world orbiting one of the most studied planetary systems beyond our own."}
        </p>
        <div className="fact-list">
          {(facts[selected.id] ?? fallbackFacts).map((fact) => (
            <div className="fact" key={fact.label}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>
        <div className="scale-note">
          <span>i</span>
          <p><strong>Display scale</strong>Body sizes are exaggerated for visibility. Orbital distances use a compressed scale.</p>
        </div>
        <a className="source-link" href="https://exoplanetarchive.ipac.caltech.edu/" target="_blank" rel="noreferrer">View NASA source data <span>↗</span></a>
      </aside>

      <section className="system-view" aria-label="TRAPPIST-1 planetary system visualization">
        <div className="system-meta">
          <span>Planetary system</span>
          <h2>TRAPPIST-1</h2>
          <p>40.66 light-years away · Aquarius</p>
        </div>
        <div className="view-badge"><span /> LIVE MODEL</div>

        <div className="orbit-stage" style={{ "--view-zoom": zoom } as React.CSSProperties}>
          <div className="habitable-zone" />
          {bodies.slice(1).map((body) => (
            <div className={`orbit orbit-${body.orbit}`} key={`orbit-${body.id}`} />
          ))}
          {bodies.map((body) => (
            <button
              className={`celestial-body body-${body.id} ${selectedId === body.id ? "is-selected" : ""}`}
              key={body.id}
              onClick={() => chooseBody(body.id)}
              aria-label={`Select ${body.name}`}
              style={{ "--body-color": body.color, "--body-size": `${body.size}px` } as React.CSSProperties}
            >
              <span className="body-label">{body.id === "star" ? body.name : body.id.toUpperCase()}</span>
            </button>
          ))}
        </div>

        <div className="legend">
          <span><i className="legend-line habitable" /> Habitable zone</span>
          <span><i className="legend-line orbit-line" /> Planet orbit</span>
        </div>
        <div className="view-controls">
          <button type="button" aria-label="Reset view" onClick={() => setZoom(1)}>↺</button>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.35, value + .1))}>＋</button>
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(.7, value - .1))}>−</button>
        </div>
      </section>
    </main>
  );
}
