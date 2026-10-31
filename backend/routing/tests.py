import json
import math
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
from pathlib import Path
from django.test import SimpleTestCase, override_settings
from .errors import PlanningError
from .risk import classify, summarize, recommend
from .sampling import sample_route, METERS_PER_MILE
from .validation import validate_plan
from .service import weather_at, assess_checkpoints, departure_choices, build_plan
from .demo import example_plan, example_forecasts

NOW = datetime(2026, 10, 30, 12, tzinfo=timezone.utc)


def payload():
    return {'origin': {'name': 'Chicago', 'lat': 41.88, 'lon': -87.63},
            'destination': {'name': 'Nashville', 'lat': 36.16, 'lon': -86.78},
            'departure': (NOW+timedelta(hours=1)).isoformat(), 'load_lb': 35000, 'interval_miles': 25}


class RiskTests(SimpleTestCase):
    def test_wind_boundaries(self):
        for wind, expected in [(0, 0), (24.999, 0), (25, 1), (34.999, 1), (35, 2), (44.999, 2), (45, 3), (54.999, 3), (55, 4), (90, 4)]:
            with self.subTest(wind=wind):
                self.assertEqual(classify(wind, 0, 0, 0)['level'], expected)

    def test_rain_boundaries(self):
        for rain, expected in [(0, 0), (.0999, 0), (.1, 1), (.2499, 1), (.25, 2), (.4999, 2), (.5, 3), (1, 3), (1.0001, 4)]:
            with self.subTest(rain=rain):
                self.assertEqual(classify(0, rain, 0, 0)['level'], expected)

    def test_snow_boundaries(self):
        for snow, expected in [(.4999, 0), (.5, 1), (.9999, 1), (1, 2), (1.9999, 2), (2, 3), (3, 3), (3.0001, 4)]:
            with self.subTest(snow=snow):
                self.assertEqual(classify(0, 0, snow, 0)['level'], expected)

    def test_load_strict_boundaries(self):
        for wind, load, expected in [(45, 30000, 3), (45, 30001, 4), (44.999, 30001, 2), (35, 40000, 2), (35, 40001, 3), (34.999, 40001, 1), (55, 0, 4), (55, 80000, 4)]:
            with self.subTest(wind=wind, load=load):
                self.assertEqual(classify(wind, 0, 0, load)['level'], expected)

    def test_maximum_condition_wins(self):
        self.assertEqual(classify(25, .5, 0, 100)['level'], 3)
        self.assertEqual(classify(10, 0, 3.1, 0)['level'], 4)
        self.assertIn('Wind + load', classify(46, 0, 0, 35000)['causes'])

    def test_missing_or_invalid_weather_is_not_safe(self):
        for value in [None, math.nan, math.inf, -1, '10']:
            with self.subTest(value=value), self.assertRaises(PlanningError):
                classify(value, 0, 0, 0)

    def test_conservative_risk_miles_sum_to_distance(self):
        points = [{'mile': m, 'risk': {'level': r}} for m, r in [(0, 0), (25, 2), (50, 0), (62, 1)]]
        summary = summarize(points, 62)
        self.assertEqual(summary['risk_miles'], [0, 12, 50, 0, 0])
        self.assertAlmostEqual(summary['average_risk'], 112/62)

    def test_risk_miles_retain_precision_for_ranking(self):
        points = [{'mile': m, 'risk': {'level': r}} for m, r in [(0, 0), (.0004, 3), (.0008, 0), (1, 0)]]
        summary = summarize(points, 1)
        self.assertAlmostEqual(summary['risk_miles'][3], .0008)
        self.assertAlmostEqual(sum(summary['risk_miles']), 1)


class RankingTests(SimpleTestCase):
    def route(self, id, miles, duration=3600, eligible=True, avg=None):
        return {'id': id, 'summary': {'eligible': eligible, 'risk_miles': miles,
                'average_risk': avg if avg is not None else sum(i*m for i,m in enumerate(miles))/sum(miles)}, 'duration_seconds': duration}

    def test_severe_precedes_high(self):
        a = self.route('a', [0, 0, 99, 1, 0])
        b = self.route('b', [0, 0, 100, 0, 0], 9000)
        self.assertEqual(recommend([a, b]), 'b')

    def test_high_precedes_average(self):
        a = self.route('a', [98, 0, 2, 0, 0])
        b = self.route('b', [0, 100, 0, 0, 0])
        self.assertEqual(recommend([a, b]), 'b')

    def test_average_precedes_time(self):
        a = self.route('a', [100, 0, 0, 0, 0], 9000)
        b = self.route('b', [0, 100, 0, 0, 0], 1000)
        self.assertEqual(recommend([a, b]), 'a')

    def test_time_breaks_risk_tie(self):
        a = self.route('a', [100, 0, 0, 0, 0], 9000)
        b = self.route('b', [100, 0, 0, 0, 0], 1000)
        self.assertEqual(recommend([a, b]), 'b')

    def test_no_travel_is_excluded(self):
        a = self.route('a', [99, 0, 0, 0, 1], eligible=False)
        b = self.route('b', [0, 0, 0, 100, 0])
        self.assertEqual(recommend([a, b]), 'b')
        self.assertIsNone(recommend([a]))
        self.assertIsNone(recommend([]))


class SamplingTests(SimpleTestCase):
    def raw(self, miles=60):
        return {'distance': miles*METERS_PER_MILE, 'duration': 7200,
                'geometry': {'coordinates': [[0, 0], [1, 0], [2, 0]]},
                'legs': [{'annotation': {'distance': [30*METERS_PER_MILE, 30*METERS_PER_MILE], 'duration': [1800, 5400]}}]}

    def test_spacing_includes_endpoints(self):
        points = sample_route(self.raw(), 25, NOW)
        self.assertEqual([p['mile'] for p in points], [0, 25, 50, 60])
        self.assertAlmostEqual(points[1]['lon'], 25/30)
        self.assertEqual(points[0]['eta'], NOW.isoformat())
        self.assertEqual(points[-1]['eta'], (NOW+timedelta(hours=2)).isoformat())

    def test_eta_uses_segment_duration_not_distance_fraction(self):
        points = sample_route(self.raw(), 10, NOW)
        self.assertAlmostEqual(points[3]['elapsed_seconds'], 1800)
        self.assertAlmostEqual(points[4]['elapsed_seconds'], 3600)

    def test_exact_multiple_has_one_destination(self):
        points = sample_route(self.raw(50), 25, NOW)
        self.assertEqual([p['mile'] for p in points], [0, 25, 50])

    def test_short_route(self):
        self.assertEqual(len(sample_route(self.raw(5), 50, NOW)), 2)

    def test_missing_annotations_fail(self):
        raw = self.raw(); raw['legs'] = [{}]
        with self.assertRaises(PlanningError):
            sample_route(raw, 25, NOW)


class ValidationTests(SimpleTestCase):
    def test_valid_timezone_normalization(self):
        data = payload(); data['departure'] = '2026-10-30T18:00:00+05:00'
        self.assertEqual(validate_plan(data, NOW)['departure'].hour, 13)

    def test_invalid_inputs(self):
        for field, value in [('load_lb', -1), ('load_lb', 'NaN'), ('load_lb', 80001), ('interval_miles', 12), ('interval_miles', 25.9), ('departure', '2026-10-30T13:00:00'), ('departure', '2026-11-30T13:00:00Z'), ('departure', 'bad'), ('origin', {'lat': 999, 'lon': 0}), ('origin', None)]:
            with self.subTest(field=field, value=value):
                data = payload(); data[field] = value
                with self.assertRaises(PlanningError): validate_plan(data, NOW)

    def test_same_location(self):
        data = payload(); data['destination'] = data['origin']
        with self.assertRaises(PlanningError): validate_plan(data, NOW)


class WeatherTests(SimpleTestCase):
    def hourly(self):
        return {'time': [0, 3600, 7200], 'rain': [0, 25.4, 0], 'showers': [0, 2.54, 0],
                'snowfall': [0, 2.54, 0], 'wind_gusts_10m': [10, 20, 30], 'temperature_2m': [50, 52, 54]}

    def test_conversions_and_hour_ending(self):
        w = weather_at(self.hourly(), 1800)
        self.assertAlmostEqual(w['rain_in'], 1.1)
        self.assertAlmostEqual(w['snow_in'], 1)
        self.assertEqual(w['wind_mph'], 20)
        self.assertEqual(weather_at(self.hourly(), 3600)['wind_mph'], 20)

    def test_out_of_horizon(self):
        for stamp in [-1, 7201]:
            with self.assertRaises(PlanningError): weather_at(self.hourly(), stamp)

    def test_missing_weather(self):
        h = self.hourly(); h['wind_gusts_10m'][1] = None
        with self.assertRaises(PlanningError): weather_at(h, 1800)


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class ApiTests(SimpleTestCase):
    def test_health(self):
        self.assertEqual(self.client.get('/api/health/').json()['status'], 'ok')

    def test_plan_requires_json_and_post(self):
        self.assertEqual(self.client.get('/api/plan/').status_code, 405)
        self.assertEqual(self.client.post('/api/plan/', data='invalid', content_type='application/json').status_code, 400)
        self.assertEqual(self.client.post('/api/plan/', data='invalid', content_type='text/plain').status_code, 415)

    def test_cross_origin_rejected(self):
        self.assertEqual(self.client.post('/api/plan/', data='{}', content_type='application/json', HTTP_ORIGIN='https://untrusted.example').status_code, 403)

    @patch('routing.providers.geocode', return_value=[{'name': 'Chicago', 'lat': 41.88, 'lon': -87.63}])
    def test_geocode(self, mock):
        self.assertEqual(len(self.client.get('/api/geocode/?q=Chicago').json()['results']), 1)
        self.assertEqual(self.client.get('/api/geocode/?q=a').status_code, 400)

    @patch('routing.views.build_plan', side_effect=PlanningError('Weather unavailable', 'weather_unavailable', 502))
    def test_upstream_failure_is_explicit(self, mock):
        data = payload(); data['departure'] = (datetime.now(timezone.utc)+timedelta(hours=1)).isoformat()
        response = self.client.post('/api/plan/', data=json.dumps(data), content_type='application/json')
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()['code'], 'weather_unavailable')

    def test_demo_endpoint(self):
        response = self.client.get('/api/demo/?interval=50&load=40001')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['mode'], 'demo')
        self.assertEqual(response.json()['trip']['interval_miles'], 50)
        self.assertEqual(self.client.get('/api/demo/?interval=11').status_code, 400)

    def test_demo_accepts_selected_departure_and_validates_window(self):
        departure = (datetime.now(timezone.utc) + timedelta(hours=3)).replace(microsecond=0).isoformat()
        response = self.client.get('/api/demo/', {'departure': departure})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['trip']['departure'], departure)
        self.assertEqual(self.client.get('/api/demo/', {'departure': 'invalid'}).status_code, 400)
        beyond = (datetime.now(timezone.utc) + timedelta(hours=51)).isoformat()
        self.assertEqual(self.client.get('/api/demo/', {'departure': beyond}).status_code, 400)

    def test_demo_full_pipeline(self):
        plan = example_plan()
        self.assertEqual(len(plan['routes']), 3)
        self.assertEqual(len(plan['corridor']['times']), 49)
        self.assertEqual(plan['recommended_id'], 'route-2')
        for r in plan['routes']:
            self.assertAlmostEqual(sum(r['summary']['risk_miles']), r['distance_miles'], places=2)
            self.assertEqual(r['checkpoints'][0]['mile'], 0)
            self.assertAlmostEqual(r['checkpoints'][-1]['mile'], r['distance_miles'])
            raw = json.loads(Path(__file__).with_name('fixtures').joinpath('example_routes.json').read_text())[int(r['id'][-1])-1]
            self.assertEqual(len(r['geometry']['coordinates'])-1, sum(len(leg['annotation']['distance']) for leg in raw['legs']))
            for point in r['checkpoints']:
                self.assertIn(point['risk']['level'], range(5))
        for point in plan['corridor']['points']:
            self.assertEqual(len(point['hours']), 49)


class DepartureTests(SimpleTestCase):
    def setUp(self):
        self.points = [
            {'id': i, 'lat': 40, 'lon': -86, 'mile': i * 50, 'elapsed_seconds': i * 3600,
             'eta': (NOW + timedelta(hours=1+i)).isoformat()}
            for i in range(2)]
        self.hourly = {
            'time': [int((NOW + timedelta(hours=i)).timestamp()) for i in range(12)],
            'wind_gusts_10m': [20, 20, 20, 40, 40, 55, 55, 55, 55, 55, 55, 55],
            'rain': [0]*12, 'showers': [0]*12, 'snowfall': [0]*12, 'temperature_2m': [60]*12}
        self.forecasts = {(40, -86): self.hourly}
        self.params = {'departure': NOW + timedelta(hours=1), 'load_lb': 45000}
        points = assess_checkpoints(self.points, self.forecasts, 45000)
        self.route = {'checkpoints': points, 'duration_seconds': 3600,
                      'distance_miles': 50, 'summary': summarize(points, 50)}

    def test_shift_uses_arrival_forecast_and_same_load_rules(self):
        choices = departure_choices(self.route, self.params, self.forecasts, NOW)
        self.assertEqual([c['summary']['max_risk'] for c in choices], [0, 3, 4])
        self.assertEqual([c['summary']['eligible'] for c in choices], [True, True, False])
        self.assertEqual(choices[1]['summary']['risk_miles'][3], 50)
        self.assertEqual(choices[2]['summary']['risk_miles'][4], 50)
        self.assertEqual(datetime.fromisoformat(choices[1]['arrival']) - datetime.fromisoformat(choices[1]['departure']), timedelta(hours=1))

    def test_comparison_does_not_mutate_current_checkpoints(self):
        before = json.dumps(self.route, sort_keys=True)
        departure_choices(self.route, self.params, self.forecasts, NOW)
        self.assertEqual(json.dumps(self.route, sort_keys=True), before)

    def test_missing_later_weather_is_unavailable_not_low_risk(self):
        self.hourly['wind_gusts_10m'][3] = None
        choices = departure_choices(self.route, self.params, self.forecasts, NOW)
        self.assertTrue(choices[0]['available'])
        self.assertFalse(choices[1]['available'])
        self.assertNotIn('summary', choices[1])
        self.assertIn('incomplete', choices[1]['reason'])

    def test_later_arrival_outside_forecast_is_unavailable(self):
        for field in self.hourly:
            self.hourly[field] = self.hourly[field][:3]
        choices = departure_choices(self.route, self.params, self.forecasts, NOW)
        self.assertEqual([c['available'] for c in choices], [True, False, False])

    def test_departure_window_is_enforced_for_comparisons(self):
        self.params['departure'] = NOW + timedelta(hours=47)
        choices = departure_choices(self.route, self.params, self.forecasts, NOW)
        self.assertEqual([c['available'] for c in choices], [True, False, False])
        self.assertIn('48-hour', choices[1]['reason'])

    def test_all_options_share_one_forecast_fetch(self):
        from unittest.mock import Mock
        raw = json.loads(Path(__file__).with_name('fixtures').joinpath('example_routes.json').read_text())
        params = payload()
        params['departure'] = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
        fetch = Mock(side_effect=example_forecasts)
        plan = build_plan(params, raw_routes=raw, forecast_fn=fetch, mode='demo')
        self.assertEqual(fetch.call_count, 1)
        for route in plan['routes']:
            self.assertEqual(len(route['departures']), 3)
            self.assertEqual(route['departures'][0]['summary'], route['summary'])
            for choice in route['departures']:
                if choice['available']:
                    self.assertAlmostEqual(sum(choice['summary']['risk_miles']), route['distance_miles'])
