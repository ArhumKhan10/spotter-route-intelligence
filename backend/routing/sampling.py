import bisect
import math
from datetime import timedelta
from .errors import PlanningError

METERS_PER_MILE = 1609.344


def haversine(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, [*a, *b])
    value = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6_371_000 * 2 * math.asin(min(1, math.sqrt(value)))


def sample_route(route, interval_miles, departure):
    coords = route['geometry']['coordinates']
    if len(coords) < 2 or route['distance'] <= 0:
        raise PlanningError('The provider returned an empty road geometry.', 'invalid_route', 502)
    distances = [d for leg in route['legs'] for d in leg.get('annotation', {}).get('distance', [])]
    durations = [d for leg in route['legs'] for d in leg.get('annotation', {}).get('duration', [])]
    if len(distances) != len(coords)-1 or len(durations) != len(coords)-1:
        raise PlanningError('The routing provider omitted segment timing. Please try another route.', 'invalid_route', 502)
    total_dist, total_time = sum(distances), sum(durations)
    if total_dist <= 0 or total_time <= 0:
        raise PlanningError('The provider returned invalid route timing.', 'invalid_route', 502)
    # Scale segment annotations to provider totals, accounting for turn costs.
    cumulative_dist, cumulative_time = [0.0], [0.0]
    for distance, duration in zip(distances, durations):
        cumulative_dist.append(cumulative_dist[-1] + distance * route['distance']/total_dist)
        cumulative_time.append(cumulative_time[-1] + duration * route['duration']/total_time)
    spacing = interval_miles * METERS_PER_MILE
    targets = [i * spacing for i in range(math.ceil(route['distance']/spacing))] + [route['distance']]
    checkpoints = []
    for index, target in enumerate(targets):
        segment = min(max(0, bisect.bisect_right(cumulative_dist, target)-1), len(coords)-2)
        span = cumulative_dist[segment+1]-cumulative_dist[segment]
        fraction = min(1, max(0, (target-cumulative_dist[segment])/span)) if span else 0
        lon, lat = [coords[segment][j] + fraction*(coords[segment+1][j]-coords[segment][j]) for j in (0, 1)]
        elapsed = cumulative_time[segment] + fraction*(cumulative_time[segment+1]-cumulative_time[segment])
        checkpoints.append({'id': index, 'lat': lat, 'lon': lon, 'mile': target/METERS_PER_MILE,
                            'elapsed_seconds': elapsed, 'eta': (departure+timedelta(seconds=elapsed)).isoformat()})
    return checkpoints
