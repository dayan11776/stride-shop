import os
import secrets
import uuid
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase


class TemporaryAdminCommandTests(TestCase):
    def setUp(self):
        self.email = f"{uuid.uuid4().hex}@example.test"
        self.user_model = get_user_model()

    def make_user(self, email=None, **fields):
        return self.user_model.objects.create_user(
            email=email or self.email,
            full_name="Test User",
            password=secrets.token_urlsafe(24),
            **fields,
        )

    def run_command(self, email):
        output = StringIO()
        environment = {} if email is None else {"STRIDE_TEMP_ADMIN_EMAIL": email}
        with patch.dict(os.environ, environment, clear=True):
            call_command("promote_temporary_admin", stdout=output)
        return output.getvalue().strip()

    def test_missing_email_is_a_safe_skip(self):
        user = self.make_user()
        self.assertEqual(self.run_command(None), "STRIDE_ADMIN_BOOTSTRAP=skip:missing_email")
        user.refresh_from_db()
        self.assertEqual(user.role, self.user_model.Role.CUSTOMER)
        self.assertFalse(user.is_staff)

    def test_unknown_email_is_a_safe_skip_without_creating_an_account(self):
        self.assertEqual(self.run_command(self.email), "STRIDE_ADMIN_BOOTSTRAP=skip:not_found")
        self.assertEqual(self.user_model.objects.count(), 0)

    def test_inactive_user_is_a_safe_skip(self):
        user = self.make_user(is_active=False)
        original_password = user.password
        self.assertEqual(self.run_command(self.email), "STRIDE_ADMIN_BOOTSTRAP=skip:inactive")
        user.refresh_from_db()
        self.assertFalse(user.is_active)
        self.assertEqual(user.role, self.user_model.Role.CUSTOMER)
        self.assertFalse(user.is_staff)
        self.assertEqual(user.password, original_password)

    def test_case_insensitive_duplicates_are_a_safe_skip(self):
        first = self.make_user()
        second = self.user_model.objects.create(
            email=self.email.upper(), full_name="Second Test User", password=secrets.token_urlsafe(24)
        )
        self.assertEqual(self.run_command(self.email), "STRIDE_ADMIN_BOOTSTRAP=skip:ambiguous")
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.role, self.user_model.Role.CUSTOMER)
        self.assertEqual(second.role, self.user_model.Role.CUSTOMER)
        self.assertFalse(first.is_staff)
        self.assertFalse(second.is_staff)

    def test_promotes_only_the_target_preserving_password_and_superuser_flag(self):
        user = self.make_user()
        other = self.make_user(email=f"{uuid.uuid4().hex}@example.test")
        original_password = user.password
        self.assertEqual(self.run_command(f"  {self.email.upper()}  "), "STRIDE_ADMIN_BOOTSTRAP=success")
        user.refresh_from_db()
        other.refresh_from_db()
        self.assertEqual(user.role, self.user_model.Role.ADMIN)
        self.assertTrue(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertEqual(user.password, original_password)
        self.assertEqual(other.role, self.user_model.Role.CUSTOMER)
        self.assertFalse(other.is_staff)

    def test_promotion_is_idempotent_and_preserves_existing_superuser_flag(self):
        user = self.make_user(is_superuser=True)
        original_password = user.password
        self.assertEqual(self.run_command(self.email), "STRIDE_ADMIN_BOOTSTRAP=success")
        self.assertEqual(self.run_command(self.email), "STRIDE_ADMIN_BOOTSTRAP=success")
        user.refresh_from_db()
        self.assertEqual(user.role, self.user_model.Role.ADMIN)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertEqual(user.password, original_password)
