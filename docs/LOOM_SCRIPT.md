# Loom walkthrough · approximately 7 minutes

Record with your own voice. Use a 1440 × 900 or larger browser, close unrelated
tabs, and open the deployed app. This is a speaking outline; adapt the phrasing.

## 0:00–0:40 · Problem and solution

“I built Spotter, a weather-aware truck-route planner in React and Django.
The goal is to compare the weather the driver will actually meet, taking
departure time and load weight into account. The initial example uses real
road geometry and explicitly simulated weather so the decision is easy to
inspect.”

Point out the example label, input panel, three alternatives, map, and timeline.

## 0:40–1:50 · Planning and recommendation

Show Chicago to Nashville, departure, 35,000 lb, and 25-mile spacing. Compare
Route A and recommended Route B. A slightly slower road can win because it
avoids high weather risk. Open **Compare** and show risk mileage/average risk.

“No Travel routes are excluded first. Then I compare Severe miles, High
miles, distance-weighted average risk, and finally driving time. It’s a
lexicographic ranking rather than a hidden weighted score.”

## 1:50–2:50 · Arrival-time weather

Open **View trip** and show ETAs, wind gusts, rain, snow, and risk in the
checkpoint table. Open a checkpoint on the map.

“Arrival times integrate road-segment durations rather than assuming the
truck travels at the same speed everywhere. I include origin and destination
even when the last interval is shorter.”

## 2:50–3:45 · Forecast heatmap

Move the slider to +12, +24, and +48 hours. Play/pause, select wind/rain
layers, and toggle the overlay.

“The slider shows the corridor at one fixed forecast time. Checkpoint risk
still uses the driver’s individual arrival time. Moving the slider doesn’t
change or mislabel the route recommendation. The heatmap uses one canvas
instead of hundreds of HTML elements.”

## 3:45–4:35 · Load rules and live mode

Change load to 45,000 lb and choose **Refresh** beside the example label.
Show how the route risk changes. Open methodology and show exact thresholds.
Then click **Find safest route** for live weather. Actual conditions may all
be low risk. If a public provider fails, show the explicit error and preserved
example label; do not present simulated data as live.

## 4:35–5:35 · Code architecture

Show these files briefly:

- `risk.py`: pure thresholds, strict load comparisons, and ranking.
- `sampling.py`: cumulative distance/time interpolation.
- `providers.py`: genuine routes, waypoint alternatives, caching/batching.
- `service.py`: forecast lookup, units, risk summaries, and corridor data.
- `RouteMap.tsx`: map interaction and canvas weather.

“I separated calculation logic from providers and rendering so critical
behaviors are testable without network calls.”

## 5:35–6:25 · Verification and UX

Show backend and desktop/mobile test results. Mention threshold boundaries,
all-routes-blocked behavior, nonuniform road speeds, forecast units/time
zones, and provider failures. Resize to phone width. Briefly show keyboard
city selection, saved trips, or JSON export.

## 6:25–7:10 · Tradeoffs and close

“Public OSRM driving routes do not validate bridge weights, height, or
hazmat restrictions. ETAs exclude traffic and breaks. For actual dispatch
I’d use a contracted truck-routing provider, shared cache, distributed rate
limiting, and background jobs. For the assessment, I focused on correct
risk logic, a clear interface, and a working end-to-end integration.”

Show the README, deployed app, and GitHub repository. End on the map view.
