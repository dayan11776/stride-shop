"""Temporarily promote one pre-existing account selected through the environment."""
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = "Promote one existing active STRIDE user without changing their credentials."

    def handle(self, *args, **options):
        email = os.environ.get("STRIDE_TEMP_ADMIN_EMAIL", "").strip()
        if not email:
            self.stdout.write("STRIDE_ADMIN_BOOTSTRAP=skip:missing_email")
            return

        user_model = get_user_model()
        with transaction.atomic():
            matches = list(user_model.objects.select_for_update().filter(email__iexact=email)[:2])
            if not matches:
                self.stdout.write("STRIDE_ADMIN_BOOTSTRAP=skip:not_found")
                return
            if len(matches) != 1:
                self.stdout.write("STRIDE_ADMIN_BOOTSTRAP=skip:ambiguous")
                return

            user = matches[0]
            if not user.is_active:
                self.stdout.write("STRIDE_ADMIN_BOOTSTRAP=skip:inactive")
                return

            if user.role != user_model.Role.ADMIN or not user.is_staff:
                user.role = user_model.Role.ADMIN
                user.is_staff = True
                user.save(update_fields=["role", "is_staff"])

        self.stdout.write("STRIDE_ADMIN_BOOTSTRAP=success")
