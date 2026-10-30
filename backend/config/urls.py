from django.urls import path, re_path
from routing import views

urlpatterns = [
    path('api/health/', views.health),
    path('api/geocode/', views.geocode),
    path('api/plan/', views.plan),
    path('api/demo/', views.demo),
    re_path(r'^(?!api/|assets/).*$', views.frontend),
]
