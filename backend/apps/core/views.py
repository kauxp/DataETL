from rest_framework.views import APIView
from rest_framework.response import Response


class MeView(APIView):
    def get(self, request):
        user = request.user
        profile = user.profile
        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'role': profile.role,
            'organization': {
                'id': str(profile.organization.id),
                'name': profile.organization.name,
                'slug': profile.organization.slug,
            },
        })
