"""Dashboard and report routes (SRS §5.2)."""
from django.urls import path

from .views import DashboardStatsView, ReportIndexView, ReportView

urlpatterns = [
    path("dashboard/stats/", DashboardStatsView.as_view(), name="dashboard-stats"),
    path("reports/", ReportIndexView.as_view(), name="report-index"),
    # One view serves every report; the key selects which.
    path("reports/<slug:report_key>/", ReportView.as_view(), name="report"),
]
