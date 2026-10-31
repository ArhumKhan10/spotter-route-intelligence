"""Check hosted frontend + Django API, including a live weather-aware trip."""
import argparse
import re
from datetime import datetime, timezone, timedelta
import httpx

parser = argparse.ArgumentParser()
parser.add_argument('base_url')
args = parser.parse_args()
base = args.base_url.rstrip('/')
with httpx.Client(base_url=base, timeout=120, follow_redirects=True) as client:
    health = client.get('/api/health/')
    assert health.status_code == 200, f'Health: {health.status_code} {health.text[:150]}'
    assert health.json()['status'] == 'ok'
    print('Health: OK')
    html = client.get('/')
    assert html.status_code == 200 and 'Spotter' in html.text, f'Frontend: {html.status_code}'
    for asset in re.findall(r'(?:src|href)="(/assets/[^\"]+)"', html.text):
        response = client.get(asset)
        assert response.status_code == 200, f'Asset missing: {asset}'
    print('React HTML + JavaScript/CSS: OK')
    example = client.get('/api/demo/').json()
    assert example['mode'] == 'demo' and len(example['routes']) == 3
    assert len(example['corridor']['times']) == 49
    print('Example pipeline: 3 routes, 49 forecast hours, OK')
    cities = client.get('/api/geocode/', params={'q': 'Austin'})
    assert cities.status_code == 200 and cities.json()['results'], f'Geocode: {cities.text[:200]}'
    print('Live city geocoding: OK')
    payload = {**example['trip'], 'departure': (datetime.now(timezone.utc)+timedelta(hours=1)).isoformat()}
    live = client.post('/api/plan/', json=payload, headers={'Origin': base})
    assert live.status_code == 200, f'Live plan: {live.status_code} {live.text[:300]}'
    data = live.json()
    assert data['mode'] == 'live' and len(data['routes']) == 3
    for route in data['routes']:
        assert abs(sum(route['summary']['risk_miles'])-route['distance_miles']) < .01
        assert [choice['offset_hours'] for choice in route['departures']] == [0, 2, 4]
        assert route['departures'][0]['summary'] == route['summary']
        for choice in route['departures']:
            if choice['available']:
                assert abs(sum(choice['summary']['risk_miles'])-route['distance_miles']) < .01
            else:
                assert choice['reason'] and 'summary' not in choice
    print(f'Live routing + weather: {len(data["routes"])} routes, {sum(len(r["checkpoints"]) for r in data["routes"])} checkpoints, {len(data["corridor"]["points"])} corridor samples, OK')
    print('Hosted smoke checks passed.')
