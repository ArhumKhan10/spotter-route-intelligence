import bisect
import math
from datetime import datetime, timezone, timedelta
from .errors import PlanningError
from .providers import get_routes, weather_forecasts
from .risk import classify, summarize, recommend, RISK_NAMES, RISK_COLORS
from .sampling import sample_route, METERS_PER_MILE


def weather_at(hourly, timestamp):
    # These are preceding-hour accumulations/maxima: use the hour ending at or
    # immediately after arrival, avoiding an earlier, non-overlapping rain hour.
    index = bisect.bisect_left(hourly['time'], timestamp)
    if index >= len(hourly['time']) or timestamp < hourly['time'][0]:
        raise PlanningError('Arrival falls outside the available weather forecast.', 'forecast_out_of_range')
    try:
        wind = hourly['wind_gusts_10m'][index]
        rain = (hourly['rain'][index]+hourly['showers'][index])/25.4
        snow = hourly['snowfall'][index]/2.54  # Snowfall is cm, even with precip_unit=mm.
        temp = hourly['temperature_2m'][index]
        if any(v is None or not math.isfinite(v) for v in [wind, rain, snow, temp]):
            raise ValueError('Missing weather')
    except (KeyError, IndexError, TypeError, ValueError) as error:
        raise PlanningError('A checkpoint forecast is incomplete. Try again later.', 'weather_unavailable', 502) from error
    return {'wind_mph': wind, 'rain_in': rain, 'snow_in': snow,
            'temperature_f': temp, 'forecast_time': datetime.fromtimestamp(hourly['time'][index], timezone.utc).isoformat()}


def corridor_points(routes):
    points = {}
    for route in routes:
        checkpoints = route['checkpoints']
        stride = max(1, len(checkpoints)//12)
        for p in checkpoints[::stride] + checkpoints[-1:]:
            for offset in [-.22, 0, .22]:
                lat, lon = round(p['lat']+offset, 2), round(p['lon'], 2)
                points[(round(lat, 1), round(lon, 1))] = {'lat': lat, 'lon': lon}
    values = list(points.values())
    if len(values) > 96:
        values = [values[round(i*(len(values)-1)/95)] for i in range(96)]
    return values


def build_plan(params, raw_routes=None, forecast_fn=weather_forecasts, mode='live'):
    raw_routes = raw_routes if raw_routes is not None else get_routes(params['origin'], params['destination'])
    routes = []
    for index, raw in enumerate(raw_routes):
        checkpoints = sample_route(raw, params['interval_miles'], params['departure'])
        routes.append({'id': f'route-{index+1}', 'name': f'Route {chr(65+index)}',
                       'road_name': raw.get('road_name', 'Connecting roads'),
                       'via': raw.get('via'), 'geometry': raw['geometry'],
                       'distance_miles': raw['distance']/METERS_PER_MILE,
                       'duration_seconds': raw['duration'], 'checkpoints': checkpoints,
                       'arrival': (params['departure']+timedelta(seconds=raw['duration'])).isoformat()})
    corridor = corridor_points(routes)
    forecasts = forecast_fn([p for route in routes for p in route['checkpoints']]+corridor)
    for route in routes:
        for point in route['checkpoints']:
            hourly = forecasts[(round(point['lat'], 3), round(point['lon'], 3))]
            point['weather'] = weather_at(hourly, datetime.fromisoformat(point['eta']).timestamp())
            w = point['weather']
            point['risk'] = classify(w['wind_mph'], w['rain_in'], w['snow_in'], params['load_lb'])
        route['summary'] = summarize(route['checkpoints'], route['distance_miles'])
    now = datetime.now(timezone.utc)
    base_time = math.ceil(now.timestamp()/3600)*3600
    times = [base_time+i*3600 for i in range(49)]
    for point in corridor:
        hourly = forecasts[(round(point['lat'], 3), round(point['lon'], 3))]
        point['hours'] = []
        for time in times:
            w = weather_at(hourly, time)
            risk = classify(w['wind_mph'], w['rain_in'], w['snow_in'], params['load_lb'])
            point['hours'].append({'risk': risk['level'], 'wind_mph': round(w['wind_mph'], 1),
                                   'rain_in': round(w['rain_in'], 3), 'snow_in': round(w['snow_in'], 3)})
    recommended = recommend(routes)
    warnings = []
    if len(routes) < 3:
        warnings.append(f'The routing provider found only {len(routes)} distinct road options for these locations.')
    if recommended is None:
        warnings.append('No route is recommended. Every option includes No Travel conditions; delay departure or change the trip.')
    return {
        'mode': mode, 'generated_at': now.isoformat(),
        'trip': {**params, 'departure': params['departure'].isoformat()},
        'routes': routes, 'recommended_id': recommended, 'warnings': warnings,
        'corridor': {'times': [datetime.fromtimestamp(t, timezone.utc).isoformat() for t in times], 'points': corridor},
        'risk_levels': [{'label': label, 'color': color} for label, color in zip(RISK_NAMES, RISK_COLORS)],
        'sources': {'routing': 'OSRM / OpenStreetMap', 'weather': 'Synthetic example forecast' if mode == 'demo' else 'Open-Meteo',
                    'wind': '10 m wind gusts', 'eta': 'Driving time only; no breaks or traffic',
                    'heatmap': 'Interpolated corridor samples; risk depends on load weight'},
    }
