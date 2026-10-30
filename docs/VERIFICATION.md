# Verification

Checked on 2026-10-30 using Python 3.12, Node 22, and Microsoft Edge.

- **31 Django tests pass.** They cover threshold edges, strict load boundaries,
  worst-condition selection, blocked-route exclusion, every ranking priority,
  distance-weighted summaries, nonuniform road-speed ETAs, endpoint spacing,
  units, time zones, unrounded risk mileage, invalid input, and upstream failures.
- **10 Playwright checks pass** across 1440px desktop and 390px phone viewports,
  locally and against the public deployment. They exercise route comparison,
  checkpoint inspection, JSON export, slider playback, layer selection,
  overlay controls, keyboard city selection, input changes, explicit provider
  errors, and horizontal overflow.
- **Live hosted smoke checks pass:** health, React HTML and JavaScript/CSS,
  example data, live Austin geocoding, and live Chicago–Nashville planning.
  The trip returned three road options, 60 checkpoints at 25-mile spacing,
  96 corridor samples, and 49 hourly heatmap frames.
- **TypeScript check and production build pass.** Self-hosted font assets and
  the React frontend are served separately from the same-origin Django API.
- **Visual review:** desktop/phone screenshots are in this folder. A tile
  provider requiring a new API key was replaced during review, mobile icon
  controls gained explicit accessible labels, and map captions/legend gained
  readable surfaces independent of the tile background.

The Docker deployment definition is provided but was not executed locally
because Docker is not installed. The Vercel deployment is the verified host.
The lightweight file cache/throttle is not a distributed rate limiter. Public
forecast/routing services are subject to availability; live failures remain
explicit and never silently become synthetic weather.
