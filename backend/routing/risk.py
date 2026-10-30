"""Assessment thresholds. All inputs use mph, inches/hour, and pounds."""
import math
from .errors import PlanningError

RISK_NAMES = ['Low', 'Moderate', 'High', 'Severe', 'No Travel']
RISK_COLORS = ['#32846b', '#d9aa38', '#e98738', '#d45053', '#8c375a']


def classify(wind_mph, rain_in, snow_in, load_lb):
    values = (wind_mph, rain_in, snow_in, load_lb)
    if any(not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0 for v in values):
        raise PlanningError('Weather data is missing or invalid; risk cannot be classified.', 'weather_unavailable', 502)
    wind = next((i for i, threshold in enumerate([25, 35, 45, 55]) if wind_mph < threshold), 4)
    rain = 0 if rain_in < .1 else 1 if rain_in < .25 else 2 if rain_in < .5 else 3 if rain_in <= 1 else 4
    snow = 0 if snow_in < .5 else 1 if snow_in < 1 else 2 if snow_in < 2 else 3 if snow_in <= 3 else 4
    if wind_mph >= 55 or (wind_mph >= 45 and load_lb > 30_000):
        wind = 4
    elif wind_mph >= 35 and load_lb > 40_000:
        wind = max(wind, 3)
    level = max(wind, rain, snow)
    causes = []
    if wind == level and level:
        causes.append('Wind + load' if (wind_mph < 55 and ((wind_mph >= 45 and load_lb > 30_000) or (wind_mph >= 35 and load_lb > 40_000))) else 'Wind')
    if rain == level and level:
        causes.append('Rain')
    if snow == level and level:
        causes.append('Snow')
    return {'level': level, 'label': RISK_NAMES[level], 'causes': causes or ['Clear conditions']}


def summarize(checkpoints, distance_miles):
    """Conservative interval estimate: worse of adjacent sampled checkpoints."""
    miles = [0.0] * 5
    for left, right in zip(checkpoints, checkpoints[1:]):
        length = right['mile'] - left['mile']
        miles[max(left['risk']['level'], right['risk']['level'])] += length
    weighted = sum(level * value for level, value in enumerate(miles))
    return {
        # Keep precision for lexicographic ranking; presentation rounds in React.
        'risk_miles': miles,
        'average_risk': weighted / distance_miles if distance_miles else 0,
        'max_risk': max((p['risk']['level'] for p in checkpoints), default=0),
        'eligible': miles[4] == 0 and all(p['risk']['level'] < 4 for p in checkpoints),
    }


def ranking_key(route):
    s = route['summary']
    return (s['risk_miles'][3], s['risk_miles'][2], s['average_risk'], route['duration_seconds'])


def recommend(routes):
    eligible = [r for r in routes if r['summary']['eligible']]
    if not eligible:
        return None
    return min(eligible, key=ranking_key)['id']
