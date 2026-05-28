"""
URL configuration for breathesg_project project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.emissions.views import (
    DataSourceViewSet, IngestionBatchViewSet, ActivityRecordViewSet,
    DashboardView, UploadView, TravelApiPullView,
)
from apps.core.views import MeView

router = DefaultRouter()
router.register(r'sources', DataSourceViewSet, basename='source')
router.register(r'batches', IngestionBatchViewSet, basename='batch')
router.register(r'records', ActivityRecordViewSet, basename='record')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/token/', TokenObtainPairView.as_view()),
    path('api/auth/token/refresh/', TokenRefreshView.as_view()),
    path('api/me/', MeView.as_view()),
    path('api/dashboard/', DashboardView.as_view()),
    path('api/upload/', UploadView.as_view()),
    path('api/ingest/travel/', TravelApiPullView.as_view()),
    path('api/', include(router.urls)),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
