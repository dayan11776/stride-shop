from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("catalog", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="product",
            name="recycled_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
    ]
