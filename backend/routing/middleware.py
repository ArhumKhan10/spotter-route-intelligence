import logging
from django.core.cache import cache
from django.http import JsonResponse
from .errors import PlanningError

logger = logging.getLogger(__name__)


class ApiMiddleware:
    """Lightweight cache throttle; use an atomic edge/Redis limiter at scale."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == '/api/plan/' and request.method == 'POST':
            # REMOTE_ADDR only: do not trust arbitrary forwarded IP headers.
            key = f'limit:{request.META.get("REMOTE_ADDR", "unknown")}'
            count = cache.get(key, 0)
            if count >= 15:
                response = JsonResponse({'error': 'Too many trips. Try again in a minute.', 'code': 'rate_limited'}, status=429)
                response['Retry-After'] = '60'
                return response
            cache.set(key, count + 1, 60)
        return self.get_response(request)

    def process_exception(self, request, exception):
        if not request.path.startswith('/api/'):
            return None
        if isinstance(exception, PlanningError):
            return JsonResponse({'error': str(exception), 'code': exception.code}, status=exception.status)
        logger.exception('Unhandled API error', exc_info=exception)
        return JsonResponse({'error': 'The trip could not be completed. Please try again.', 'code': 'internal_error'}, status=500)
