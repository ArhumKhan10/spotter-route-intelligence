import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG = os.getenv('DJANGO_DEBUG', '1') == '1'
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY') or (secrets.token_urlsafe(48) if DEBUG else '')
if not SECRET_KEY:
    raise RuntimeError('DJANGO_SECRET_KEY must be set in production.')
ALLOWED_HOSTS = os.getenv('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1,testserver').split(',')
if os.getenv('RENDER_EXTERNAL_HOSTNAME'):
    ALLOWED_HOSTS.append(os.environ['RENDER_EXTERNAL_HOSTNAME'])
for variable in ['VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL']:
    if os.getenv(variable):
        ALLOWED_HOSTS.append(os.environ[variable])
INSTALLED_APPS = ['django.contrib.staticfiles', 'routing']
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.middleware.gzip.GZipMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.middleware.common.CommonMiddleware',
    'routing.middleware.ApiMiddleware',
]
ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'
TIME_ZONE = 'UTC'
USE_TZ = True
DATA_UPLOAD_MAX_MEMORY_SIZE = 100_000
STATIC_URL = '/assets/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
FRONTEND_DIST = BASE_DIR.parent / 'frontend' / 'dist'
STATICFILES_DIRS = [FRONTEND_DIST / 'assets'] if (FRONTEND_DIST / 'assets').exists() else []
WHITENOISE_MAX_AGE = 31536000
CACHES = {'default': {
    'BACKEND': 'django.core.cache.backends.filebased.FileBasedCache',
    'LOCATION': os.getenv('DJANGO_CACHE_LOCATION', str(BASE_DIR / '.cache')),
    'OPTIONS': {'MAX_ENTRIES': 1500},
}}
OSRM_BASE_URL = os.getenv('OSRM_BASE_URL', 'https://router.project-osrm.org')
WEATHER_BASE_URL = os.getenv('WEATHER_BASE_URL', 'https://api.open-meteo.com/v1/forecast')
GEOCODING_BASE_URL = os.getenv('GEOCODING_BASE_URL', 'https://geocoding-api.open-meteo.com/v1/search')
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
LOGGING = {
    'version': 1, 'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['console'], 'level': 'INFO'},
}
