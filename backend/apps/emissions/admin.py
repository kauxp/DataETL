from django.contrib import admin
from apps.emissions.models import ActivityRecord, EmissionFactor, AnomalyFlag, PlantMasterData, ActivityRecordEdit

admin.site.register(ActivityRecord)
admin.site.register(EmissionFactor)
admin.site.register(AnomalyFlag)
admin.site.register(PlantMasterData)
admin.site.register(ActivityRecordEdit)
