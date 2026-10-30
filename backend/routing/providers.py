"""Provider adapters. Upstream errors never turn into invented safe weather."""
import hashlib
import json
import math
from concurrent.futures import ThreadPoolExecutor
import httpx
from django.conf import settings
from django.core.cache import cache
from .errors import PlanningError
from .sampling import haversine


def cached_get(url, params, ttl=600):
    key = 'provider:' + hashlib.sha256((url+json.dumps(params, sort_keys=True)).encode()).hexdigest()
    cached = cache.get(key)
    if cached is not None:
        return cached
    try:
        with httpx.Client(timeout=httpx.Timeout(25, connect=8), headers={'User-Agent': 'SpotterAssessment/1.0 (weather route planner)'}) as client:
            response = client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise PlanningError('A routing or weather provider is unavailable. Try again shortly, or explore the example trip.', 'provider_unavailable', 502) from error
    cache.set(key, data, ttl)
    return data


def geocode(query):
    data = cached_get(settings.GEOCODING_BASE_URL, {'name': query, 'count': 7, 'language': 'en', 'format': 'json'}, 86400)
    return [{'name': ', '.join(filter(None, [p['name'], p.get('admin1'), p.get('country_code')])),
             'lat': p['latitude'], 'lon': p['longitude'], 'timezone': p.get('timezone', 'UTC')}
            for p in data.get('results', [])]


def _request_routes(locations, alternatives='3'):
    coordinates = ';'.join(f'{p[0]:.6f},{p[1]:.6f}' for p in locations)
    data = cached_get(f'{settings.OSRM_BASE_URL}/route/v1/driving/{coordinates}', {
        'alternatives': alternatives, 'geometries': 'geojson', 'overview': 'full',
        'annotations': 'distance,duration', 'steps': 'true',
    }, 86400)
    if data.get('code') != 'Ok' or not data.get('routes'):
        raise PlanningError('No connected driving route was found between these cities.', 'no_route')
    routes = []
    for route in data['routes']:
        roads = {}
        for leg in route['legs']:
            for step in leg.pop('steps', []):
                name = step.get('ref') or step.get('name', '')
                if name:
                    roads[name] = roads.get(name, 0) + step.get('distance', 0)
        route['road_name'] = ' / '.join(sorted(roads, key=roads.get, reverse=True)[:2]) or 'Connecting roads'
        routes.append(route)
    return routes


def _distinct(route, existing):
    # Compare evenly spaced geographic samples; reject near-identical shapes.
    geometry = route['geometry']['coordinates']
    probes = [geometry[round(i*(len(geometry)-1)/20)] for i in range(21)]
    for previous in existing:
        other = previous['geometry']['coordinates']
        nearest = [min(haversine(p, q) for q in other[::max(1, len(other)//300)]) for p in probes]
        if sum(d > 2000 for d in nearest) < 3 and abs(route['distance']-previous['distance']) < 5000:
            return False
    return True


def get_routes(origin, destination):
    start, end = (origin['lon'], origin['lat']), (destination['lon'], destination['lat'])
    routes = []
    for candidate in _request_routes([start, end]):
        if _distinct(candidate, routes):
            routes.append(candidate)
    if len(routes) < 3:
        # Ask the routing engine for genuine roads through lateral via points.
        # A waypoint route is explicitly labeled; no synthetic line is a route.
        dx, dy = end[0]-start[0], end[1]-start[1]
        length = math.hypot(dx, dy) or 1
        offset = min(.8, max(.08, length*.15))
        for sign in [1, -1]:
            via = ((start[0]+end[0])/2-sign*dy/length*offset,
                   (start[1]+end[1])/2+sign*dx/length*offset)
            try:
                options = _request_routes([start, via, end], 'false')
            except PlanningError:
                continue
            for candidate in options:
                candidate['via'] = {'lat': via[1], 'lon': via[0]}
                if _distinct(candidate, routes):
                    routes.append(candidate)
            if len(routes) >= 3:
                break
    routes = sorted(routes, key=lambda r: r['duration'])[:3]
    if any(r['distance'] > 3_200_000 for r in routes):
        raise PlanningError('Choose a trip under 2,000 miles to keep checkpoint forecasts responsive.', 'trip_too_long')
    return routes


def weather_forecasts(points):
    """Batch coordinates, use UTC Unix hours, retain hourly source units."""
    unique = list(dict.fromkeys((round(p['lat'], 3), round(p['lon'], 3)) for p in points))
    if len(unique) > 400:
        raise PlanningError('This trip has too many checkpoints. Choose a 25 or 50 mile interval.', 'trip_too_large')
    batches = [unique[i:i+40] for i in range(0, len(unique), 40)]

    def fetch(batch):
        data = cached_get(settings.WEATHER_BASE_URL, {
            'latitude': ','.join(str(p[0]) for p in batch), 'longitude': ','.join(str(p[1]) for p in batch),
            'hourly': 'temperature_2m,rain,showers,snowfall,wind_gusts_10m',
            'wind_speed_unit': 'mph', 'temperature_unit': 'fahrenheit',
            'precipitation_unit': 'mm', 'timeformat': 'unixtime', 'timezone': 'GMT', 'forecast_days': 7,
        })
        entries = data if isinstance(data, list) else [data]
        if len(entries) != len(batch) or any('hourly' not in p for p in entries):
            raise PlanningError('Incomplete weather forecast. Risk cannot be calculated.', 'weather_unavailable', 502)
        return dict(zip(batch, [p['hourly'] for p in entries]))

    forecasts = {}
    with ThreadPoolExecutor(max_workers=3) as executor:
        for result in executor.map(fetch, batches):
            forecasts.update(result)
    return forecasts
