# How to use Spotter

Spotter answers: **Which road has the least dangerous weather for this trip and
load?** It compares road routes; it does not provide turn-by-turn navigation.

## Try the example first

The opening Chicago–Nashville trip uses real roads and **simulated weather**.
That lets you see why the fastest route might not be recommended.

1. Look at the three route options beside the map on desktop, or at the bottom
   of the map on a phone. Use **Edit trip** to open the phone's trip controls.
2. Route A takes about **8h 51m**, but encounters High-risk weather.
3. Route B takes about **9h 11m**, with no Severe or High-risk weather miles.
4. Spotter therefore recommends B. The extra **20 minutes** avoids worse
   weather in this example. Click **Why Route B?** to open the evidence.

Click a route to highlight it on the map. Click **View trip** for the weather
checkpoints, or **Compare** for the routes side by side. A colored dot on the
map is a location where the trip’s expected weather was checked.

Change load weight or checkpoint spacing and click **Refresh demo** to
recalculate the same example scenario. **Demo trip** resets the cities
to Chicago and Nashville.

## Plan with live weather

1. Enter an origin and destination, selecting each city from the search results.
2. Choose a departure within the next 48 hours. The time field uses your device’s
   time zone, which is shown beside its label.
3. Enter the truck’s load in pounds.
4. Choose how often to check weather: every 10, 25, or 50 miles. A smaller
   interval checks more locations.
5. Click **Find safest route**. This fetches real road routes and current weather
   forecasts. The data label changes from example to live.

Use the sun and moon controls in the top-right corner to select light or dark
mode. Your choice is remembered on this device. Dark mode is the default.

The backend estimates when you will reach each checkpoint and checks that
hour’s wind gusts, rain, and snow. If a checkpoint is 200 miles away and you are
expected there at 2 PM, it uses the 2 PM forecast there, rather than today’s
current weather for the whole road.

## How it chooses

First, any route containing **No Travel** weather is excluded. Among the rest,
Spotter prefers, in order:

1. Fewer Severe-weather miles.
2. Fewer High-risk miles.
3. Lower average risk across the trip.
4. Less driving time if the weather results tie.

The assessment’s load rules can raise wind risk. For example, 45 mph wind with
a load over 30,000 lb means No Travel. If every route is blocked, the app
recommends none of them.

## What the slider changes

The 0–48 hour slider shows weather across the area at **one selected time**.
It changes the colored area overlay. It **does not change the route ranking**:
that ranking still follows the truck’s arrival time at each checkpoint.

Think of the slider as a weather preview, and the route cards as the trip’s
weather assessment. Use **Layers** to preview wind, rain, snow, or combined risk.

## What to remember in the interview

“I enter a trip and load, get real road alternatives, check forecast weather at
the truck’s expected arrival time at each checkpoint, and rank the routes by
dangerous-weather mileage before travel time.”

Public OSRM driving routes do not validate truck height, bridge weight, or
hazmat restrictions. That limitation and the exact threshold interpretations
are documented in the README.
