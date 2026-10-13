from rest_framework.permissions import BasePermission


class IsTeamMember(BasePermission):
    message = "Staff access is required."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_team_member)


class IsOrderOwnerOrStaff(BasePermission):
    message = "You do not have access to this order."

    def has_object_permission(self, request, view, obj):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.is_team_member or obj.user_id == request.user.id)
        )
