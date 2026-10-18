from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("catalog", "0003_product_is_example_stock")]

    operations = [
        migrations.AddField(
            model_name="product",
            name="is_example_price",
            field=models.BooleanField(default=False),
        ),
    ]
