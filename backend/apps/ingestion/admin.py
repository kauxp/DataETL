from django.contrib import admin
from apps.ingestion.models import DataSource, IngestionBatch, RawRecord

admin.site.register(DataSource)
admin.site.register(IngestionBatch)
admin.site.register(RawRecord)
