"""Fetch a reviewable road fixture, never fake route geometry.

Run from the repository root with the backend dependencies installed.
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from routing.providers import get_routes

routes = get_routes({'lat': 41.8781, 'lon': -87.6298}, {'lat': 36.1627, 'lon': -86.7816})
result = [{k: route[k] for k in ['distance', 'duration', 'geometry', 'legs', 'road_name', 'via'] if k in route} for route in routes]
path = Path(__file__).resolve().parents[1] / 'backend/routing/fixtures/example_routes.json'
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(result, separators=(',', ':')), encoding='utf-8')
print(f'Cached {len(result)} real OSRM routes: ' + ', '.join(f'{r["distance"]/1609.344:.0f} mi via {r["road_name"]}' for r in result))
