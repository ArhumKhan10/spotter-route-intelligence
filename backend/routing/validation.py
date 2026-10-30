import math
from datetime import datetime, timezone, timedelta
from .errors import PlanningError


def validate_plan(data, now=None):
    now = now or datetime.now(timezone.utc)
    if not isinstance(data, dict):
        raise PlanningError('Send a JSON object.', 'invalid_input', 400)
    result = {}
    for field in ['origin', 'destination']:
        location = data.get(field)
        if not isinstance(location, dict):
            raise PlanningError(f'Select an {field} from the city results.', 'invalid_input', 400)
        try:
            lat, lon = float(location['lat']), float(location['lon'])
        except (KeyError, ValueError, TypeError):
            raise PlanningError(f'Invalid {field} coordinates.', 'invalid_input', 400)
        if not math.isfinite(lat) or not math.isfinite(lon) or not -85 <= lat <= 85 or not -180 <= lon <= 180:
            raise PlanningError(f'Invalid {field} coordinates.', 'invalid_input', 400)
        result[field] = {'lat': lat, 'lon': lon, 'name': str(location.get('name', field))[:120]}
    if result['origin']['lat'] == result['destination']['lat'] and result['origin']['lon'] == result['destination']['lon']:
        raise PlanningError('Origin and destination must be different.', 'invalid_input', 400)
    try:
        load = float(data['load_lb'])
        interval = float(data.get('interval_miles', 25))
        departure = datetime.fromisoformat(data['departure'].replace('Z', '+00:00'))
    except (KeyError, ValueError, TypeError, AttributeError):
        raise PlanningError('Enter a valid load and departure date/time.', 'invalid_input', 400)
    if not math.isfinite(load) or not 0 <= load <= 80_000:
        raise PlanningError('Load must be between 0 and 80,000 lb.', 'invalid_input', 400)
    if interval not in [10, 25, 50]:
        raise PlanningError('Choose a checkpoint interval of 10, 25, or 50 miles.', 'invalid_input', 400)
    if departure.tzinfo is None:
        raise PlanningError('Departure must include a time zone.', 'invalid_input', 400)
    departure = departure.astimezone(timezone.utc)
    if departure < now-timedelta(minutes=5) or departure > now+timedelta(hours=48):
        raise PlanningError('Departure must be within the next 48 hours.', 'invalid_input', 400)
    result.update(load_lb=load, interval_miles=int(interval), departure=departure)
    return result
