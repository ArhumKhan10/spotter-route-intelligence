"""Explicit synthetic scenario over real cached OSRM road geometries."""
import json
import math
from pathlib import Path
from datetime import datetime, timezone, timedelta
from .service import build_plan


def example_forecasts(points):
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    times = [int((start+timedelta(hours=h)).timestamp()) for h in range(170)]
    result = {}
    for point in points:
        lat, lon = round(point['lat'], 3), round(point['lon'], 3)
        # A moving front east of the direct corridor; deterministic for demos.
        front = math.exp(-((lat-39.1)/.85)**2-((lon+85.6)/1.0)**2)
        hourly = {'time': times, 'wind_gusts_10m': [], 'rain': [], 'showers': [], 'snowfall': [], 'temperature_2m': []}
        for h in range(len(times)):
            strength = .65+.35*math.cos(h/7)
            hourly['wind_gusts_10m'].append(12+front*31*strength)
            hourly['rain'].append(front*10*strength)
            hourly['showers'].append(0)
            hourly['snowfall'].append(0)
            hourly['temperature_2m'].append(61-3*(lat-36)+math.sin(h/5)*4)
        result[(lat, lon)] = hourly
    return result


def example_plan(interval=25, load=35000):
    fixture = Path(__file__).parent / 'fixtures' / 'example_routes.json'
    raw = json.loads(fixture.read_text(encoding='utf-8'))
    params = {'origin': {'name': 'Chicago, IL', 'lat': 41.8781, 'lon': -87.6298},
              'destination': {'name': 'Nashville, TN', 'lat': 36.1627, 'lon': -86.7816},
              'departure': datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)+timedelta(hours=1),
              'load_lb': load, 'interval_miles': interval}
    return build_plan(params, raw_routes=raw, forecast_fn=example_forecasts, mode='demo')
