from decimal import Decimal
from django.db.models import Sum, Count, Q
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from apps.emissions.models import ActivityRecord, AnomalyFlag, ActivityRecordEdit
from apps.emissions.serializers import (
    ActivityRecordListSerializer, ActivityRecordDetailSerializer,
)
from apps.ingestion.models import DataSource, IngestionBatch
from apps.ingestion.serializers import DataSourceSerializer, IngestionBatchSerializer
from apps.ingestion.services import ingest_batch, ingest_travel_json


class DataSourceViewSet(viewsets.ModelViewSet):
    serializer_class = DataSourceSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'source_type']

    def get_queryset(self):
        return DataSource.objects.filter(
            organization=self.request.user.profile.organization
        ).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(
            organization=self.request.user.profile.organization,
            created_by=self.request.user,
        )


class IngestionBatchViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = IngestionBatchSerializer

    def get_queryset(self):
        return IngestionBatch.objects.filter(
            source__organization=self.request.user.profile.organization
        ).select_related('source', 'uploaded_by').order_by('-uploaded_at')


class UploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        source_id = request.data.get('source_id')
        file_obj = request.FILES.get('file')

        if not source_id or not file_obj:
            return Response({'error': 'source_id and file are required'}, status=400)

        try:
            source = DataSource.objects.get(
                id=source_id,
                organization=request.user.profile.organization,
            )
        except DataSource.DoesNotExist:
            return Response({'error': 'Source not found'}, status=404)

        content = file_obj.read()
        batch = ingest_batch(
            source=source,
            file_content=content,
            original_filename=file_obj.name,
            uploaded_by=request.user,
        )

        return Response({
            'batch_id': str(batch.id),
            'status': batch.status,
            'row_count': batch.row_count,
            'parsed_count': batch.parsed_count,
            'error_count': batch.error_count,
            'processing_log': batch.processing_log[:20],
        })


class TravelApiPullView(APIView):
    """
    POST /api/ingest/travel/

    Accepts a JSON body pulled from a SaaS travel platform (Concur, TravelPerk,
    TripActions). The caller is responsible for fetching data from the upstream
    API and forwarding it here; this endpoint parses and persists the records.

    Request body:
      {
        "source_id": "<uuid of a TRAVEL DataSource>",
        "payload": { "items": [ ... ] }   // or bare list
      }
    """
    parser_classes = [JSONParser]

    def post(self, request):
        source_id = request.data.get('source_id')
        payload = request.data.get('payload')

        if not source_id or payload is None:
            return Response({'error': 'source_id and payload are required'}, status=400)

        try:
            source = DataSource.objects.get(
                id=source_id,
                organization=request.user.profile.organization,
                source_type='TRAVEL',
            )
        except DataSource.DoesNotExist:
            return Response({'error': 'TRAVEL source not found'}, status=404)

        batch = ingest_travel_json(
            source=source,
            payload=payload,
            uploaded_by=request.user,
        )

        return Response({
            'batch_id': str(batch.id),
            'status': batch.status,
            'row_count': batch.row_count,
            'parsed_count': batch.parsed_count,
            'error_count': batch.error_count,
            'processing_log': batch.processing_log[:20],
        })


class ActivityRecordViewSet(viewsets.ModelViewSet):
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['subcategory', 'facility_name', 'facility_code', 'location']
    ordering_fields = ['period_start', 'co2e_tonnes', 'created_at', 'review_status']
    ordering = ['-period_start']

    def get_queryset(self):
        qs = ActivityRecord.objects.filter(
            organization=self.request.user.profile.organization
        ).select_related(
            'source', 'batch', 'emission_factor', 'reviewed_by'
        ).prefetch_related('flags')

        params = self.request.query_params
        if scope := params.get('scope'):
            qs = qs.filter(scope=scope)
        if category := params.get('category'):
            qs = qs.filter(category=category)
        if review_status := params.get('review_status'):
            qs = qs.filter(review_status=review_status)
        if batch_id := params.get('batch'):
            qs = qs.filter(batch_id=batch_id)
        if source_id := params.get('source'):
            qs = qs.filter(source_id=source_id)
        if date_from := params.get('date_from'):
            qs = qs.filter(period_start__gte=date_from)
        if date_to := params.get('date_to'):
            qs = qs.filter(period_end__lte=date_to)
        if params.get('flagged') == 'true':
            qs = qs.filter(flags__is_resolved=False).distinct()

        return qs

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ActivityRecordDetailSerializer
        return ActivityRecordListSerializer

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        record = self.get_object()
        if record.is_locked:
            return Response({'error': 'Record is locked'}, status=400)
        record.review_status = 'approved'
        record.reviewed_by = request.user
        record.reviewed_at = timezone.now()
        record.reviewer_notes = request.data.get('notes', '')
        record.save(update_fields=['review_status', 'reviewed_by', 'reviewed_at', 'reviewer_notes'])
        AnomalyFlag.objects.filter(activity_record=record, is_resolved=False).update(
            is_resolved=True, resolved_by=request.user, resolved_at=timezone.now(),
            resolution_note='Resolved on approval',
        )
        return Response({'status': 'approved'})

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        record = self.get_object()
        if record.is_locked:
            return Response({'error': 'Record is locked'}, status=400)
        record.review_status = 'rejected'
        record.reviewed_by = request.user
        record.reviewed_at = timezone.now()
        record.reviewer_notes = request.data.get('notes', '')
        record.save(update_fields=['review_status', 'reviewed_by', 'reviewed_at', 'reviewer_notes'])
        return Response({'status': 'rejected'})

    @action(detail=True, methods=['post'])
    def flag(self, request, pk=None):
        record = self.get_object()
        record.review_status = 'flagged'
        record.save(update_fields=['review_status'])
        AnomalyFlag.objects.create(
            activity_record=record,
            flag_type='spike',
            description=request.data.get('reason', 'Manually flagged by analyst'),
            severity=request.data.get('severity', 'medium'),
        )
        return Response({'status': 'flagged'})

    @action(detail=False, methods=['post'])
    def bulk_approve(self, request):
        ids = request.data.get('ids', [])
        updated = ActivityRecord.objects.filter(
            id__in=ids,
            organization=request.user.profile.organization,
            is_locked=False,
        ).update(
            review_status='approved',
            reviewed_by=request.user,
            reviewed_at=timezone.now(),
        )
        return Response({'approved_count': updated})

    def partial_update(self, request, *args, **kwargs):
        record = self.get_object()
        if record.is_locked:
            return Response({'error': 'Record is locked for audit'}, status=400)

        editable_fields = {'co2e_tonnes', 'quantity', 'unit', 'reviewer_notes',
                           'facility_name', 'period_start', 'period_end'}
        edits = []
        for field in editable_fields:
            if field in request.data:
                old = str(getattr(record, field, ''))
                new = str(request.data[field])
                if old != new:
                    edits.append({'field': field, 'old': old, 'new': new})

        response = super().partial_update(request, *args, **kwargs)

        if edits:
            record.refresh_from_db()
            record.is_manually_edited = True
            if 'co2e_tonnes' in [e['field'] for e in edits] and not record.original_co2e_tonnes:
                record.original_co2e_tonnes = Decimal(
                    next(e['old'] for e in edits if e['field'] == 'co2e_tonnes')
                )
            record.save(update_fields=['is_manually_edited', 'original_co2e_tonnes'])
            for edit in edits:
                ActivityRecordEdit.objects.create(
                    activity_record=record,
                    edited_by=request.user,
                    field_name=edit['field'],
                    old_value=edit['old'],
                    new_value=edit['new'],
                    reason=request.data.get('reason', ''),
                )

        return response


class DashboardView(APIView):
    def get(self, request):
        org = request.user.profile.organization
        qs = ActivityRecord.objects.filter(organization=org)

        agg = qs.aggregate(
            total=Sum('co2e_tonnes'),
            s1=Sum('co2e_tonnes', filter=Q(scope=1)),
            s2=Sum('co2e_tonnes', filter=Q(scope=2)),
            s3=Sum('co2e_tonnes', filter=Q(scope=3)),
            pending=Count('id', filter=Q(review_status='pending')),
            flagged=Count('id', filter=Q(review_status='flagged')),
            approved=Count('id', filter=Q(review_status='approved')),
            rejected=Count('id', filter=Q(review_status='rejected')),
            total_count=Count('id'),
        )

        monthly = (
            qs.filter(review_status__in=['approved', 'pending'])
            .annotate(month=TruncMonth('period_start'))
            .values('month', 'scope')
            .annotate(co2e=Sum('co2e_tonnes'))
            .order_by('month', 'scope')
        )

        category_breakdown = (
            qs.filter(review_status__in=['approved', 'pending'])
            .values('category')
            .annotate(co2e=Sum('co2e_tonnes'), count=Count('id'))
            .order_by('-co2e')
        )

        recent_batches = IngestionBatch.objects.filter(
            source__organization=org
        ).select_related('source', 'uploaded_by').order_by('-uploaded_at')[:5]

        return Response({
            'total_co2e_tonnes': float(agg['total'] or 0),
            'scope1_co2e': float(agg['s1'] or 0),
            'scope2_co2e': float(agg['s2'] or 0),
            'scope3_co2e': float(agg['s3'] or 0),
            'pending_count': agg['pending'] or 0,
            'flagged_count': agg['flagged'] or 0,
            'approved_count': agg['approved'] or 0,
            'rejected_count': agg['rejected'] or 0,
            'total_records': agg['total_count'] or 0,
            'monthly_co2e': [
                {
                    'month': r['month'].strftime('%Y-%m') if r['month'] else None,
                    'scope': r['scope'],
                    'co2e_tonnes': float(r['co2e'] or 0),
                }
                for r in monthly
            ],
            'category_breakdown': [
                {
                    'category': r['category'],
                    'co2e_tonnes': float(r['co2e'] or 0),
                    'count': r['count'],
                }
                for r in category_breakdown
            ],
            'recent_batches': IngestionBatchSerializer(recent_batches, many=True).data,
        })
