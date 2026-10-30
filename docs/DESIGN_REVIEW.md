# Visual review

Direction: a map-first dispatch workspace with forest ink, chalk surfaces,
a restrained orange identity, self-hosted Geist, and weather colors reserved
for actual risk. The road and checkpoint data supply the imagery. The
installed high-end-visual-design and minimalist-ui skills informed typography,
surfaces, and interactions. Marketing-page layouts were not applied to this
product screen.

The first browser review caught a tile provider returning API-key notices
and mobile icon controls losing their names when text was hidden. The app
now uses attributed OpenStreetMap tiles and explicit accessible labels.

Desktop and mobile screenshots are reviewed for overflow, legibility, map
controls, and complete flows. Desktop planner content scrolls independently
when screen height is limited. Mobile follows a natural sequence of planner,
map, and route options. Map colors are reinforced by text labels, and all
checkpoint data is available in an HTML table. Heatmap rendering uses one
low-resolution canvas while roads and checkpoints remain crisp vector layers.
Reduced-motion preferences disable interface transitions.

The final pass moves the phone trip summary below the map and narrows the
desktop summary, keeping the destination marker unobstructed. A browser
regression assertion checks the destination label against the summary bounds.
Route fitting also updates when the map resizes.
