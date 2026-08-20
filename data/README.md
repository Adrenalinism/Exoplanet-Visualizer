# Exoplanet catalogue

`nasa_exoplanet_archive_pscomppars.csv` is a raw snapshot of the NASA
Exoplanet Archive's Planetary Systems Composite Parameters (`pscomppars`)
table.

- Retrieved: 2026-08-20 03:31 UTC
- Rows: 6,336 confirmed exoplanets (excluding the header)
- Columns: 703
- Size: 81,520,805 bytes
- SHA-256: `7CD50EC360FD85DB347E8CEFDCFE877AF5EA903537850C1F7DCC0E3156846D46`
- Query: `select * from pscomppars`
- Format: CSV
- Source: <https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=select+*+from+pscomppars&format=csv>
- Column definitions: <https://exoplanetarchive.ipac.caltech.edu/docs/API_PS_columns.html>
- TAP documentation: <https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html>

NASA recommends `pscomppars` for statistical and visualization work because
it provides one maximally filled-in row per confirmed planet. Its values can
combine the archive's preferred measurements from different publications, so
individual parameters are not guaranteed to come from one self-consistent
paper. The CSV includes reference columns for tracing those values.

The catalogue changes as discoveries and measurements are added. Re-download
the source URL above when a fresh snapshot is needed, and update the retrieval
date, row count, size, and checksum recorded here.
