import json
from django.conf import settings
from django.http import JsonResponse, HttpResponse, FileResponse
from django.views.decorators.http import require_GET, require_POST
from django.views.decorators.csrf import csrf_exempt
from .errors import PlanningError
from .validation import validate_plan
from . import providers
from .service import build_plan
from .demo import example_plan


@require_GET
def health(request):
    return JsonResponse({'status': 'ok', 'service': 'spotter-django'})


@require_GET
def geocode(request):
    query = request.GET.get('q', '').strip()
    if not 2 <= len(query) <= 100:
        raise PlanningError('Enter between 2 and 100 characters.', 'invalid_input', 400)
    return JsonResponse({'results': providers.geocode(query)})


# Stateless calculation only; no cookies, accounts, or saved user data.
# A same-origin check protects provider quotas from browser cross-site POSTs.
@csrf_exempt
@require_POST
def plan(request):
    origin = request.headers.get('Origin')
    if origin and origin != f'{request.scheme}://{request.get_host()}':
        # Vite's development proxy preserves the browser Origin.
        if not (settings.DEBUG and origin in ['http://127.0.0.1:5173', 'http://localhost:5173']):
            return JsonResponse({'error': 'Cross-site requests are not allowed.', 'code': 'forbidden'}, status=403)
    if request.content_type != 'application/json':
        raise PlanningError('Use application/json.', 'invalid_input', 415)
    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        raise PlanningError('Invalid JSON body.', 'invalid_input', 400)
    return JsonResponse(build_plan(validate_plan(data)))


@require_GET
def demo(request):
    try:
        interval = int(request.GET.get('interval', 25))
        load = float(request.GET.get('load', 35000))
        if interval not in [10, 25, 50] or not 0 <= load <= 80000:
            raise ValueError
    except (ValueError, TypeError):
        raise PlanningError('Invalid example load or interval.', 'invalid_input', 400)
    return JsonResponse(example_plan(interval, load, request.GET.get('departure')))


def frontend(request):
    index = settings.FRONTEND_DIST / 'index.html'
    if not index.exists():
        return HttpResponse('Spotter API is running. Start the React frontend on port 5173, or build it with npm run build.', content_type='text/plain')
    response = FileResponse(index.open('rb'), content_type='text/html')
    response['Cache-Control'] = 'no-cache'
    return response
