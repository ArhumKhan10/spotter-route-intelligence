# Verification

Checked on 2026-10-31 using Python 3.12, Node 22, and Microsoft Edge.

- **38 Django tests pass.** They cover threshold edges, strict load boundaries,
  worst-condition selection, blocked-route exclusion, every ranking priority,
  distance-weighted summaries, nonuniform road-speed ETAs, endpoint spacing,
  units, time zones, unrounded risk mileage, invalid input, and upstream failures.
  Departure checks verify shifted arrival forecasts, identical load rules,
  nonmutation of the current trip, forecast gaps, the 48-hour window, and reuse
  of one forecast fetch for all departure options.
- **26 Playwright checks pass locally and were verified on the public deployment** across
  1440px desktop and 390px phone viewports. They exercise route comparison,
  checkpoint inspection, JSON export, slider playback, layer selection,
  overlay controls, keyboard city selection, input changes, explicit provider
  errors, horizontal overflow, and destination-label visibility beside the
  route summary. The added explanation checks verify example-data labeling,
  the recommended route’s risk evidence, and the displayed time tradeoff.
  Both themes are checked through reloads and modal interactions. Main-screen
  copy stays below 160 words and contains no em dashes. These checks isolate
  external raster tiles. Separate dark and light visual captures wait for all
  visible real basemap tiles to load; public tile requests can stall and are
  not used as a pass/fail signal for application interactions.
  Added flows cover explicit recommendation tradeoffs, keyboard weather-strip
  inspection, comparison detail toggles, applying later starts, unavailable
  weather versus No Travel, 44px phone controls, sheet focus trapping, and
  returning keyboard focus to Edit trip.
  One hosted navigation check was retried after Edge reported
  `ERR_NETWORK_IO_SUSPENDED` before loading the page; the retry passed.
- **Live hosted smoke checks pass:** health, React HTML and JavaScript/CSS,
  example data, live Austin geocoding, and live Chicago–Nashville planning.
  The trip returned three road options, 60 checkpoints at 25-mile spacing,
  96 corridor samples, and 49 hourly heatmap frames.
  Every live road also returned current, +2 hour, and +4 hour departure options
  whose risk-mile totals matched its distance.
- **TypeScript check and production build pass.** Self-hosted font assets and
  the React frontend are served separately from the same-origin Django API.
- **Visual review:** desktop/phone screenshots are in this folder. A tile
  provider requiring a new API key was replaced during review, mobile icon
  controls gained explicit accessible labels, and map captions/legend gained
  readable surfaces independent of the tile background.
  The current Taste Skill inspector reports **0 FAIL and 0 WARN** at 1440,
  768, and 390px. It measured 113 desktop words and 67 phone words in the
  map-first screen, with no horizontal overflow or UI text below 13px.

The Docker deployment definition is provided but was not executed locally
because Docker is not installed. The Vercel deployment is the verified host.
The lightweight file cache/throttle is not a distributed rate limiter. Public
forecast/routing services are subject to availability; live failures remain
explicit and never silently become synthetic weather.
