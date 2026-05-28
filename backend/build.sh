#!/usr/bin/env bash
set -e
pip install -r requirements.txt
python manage.py migrate --no-input
python manage.py collectstatic --no-input
# Only seed if no users exist yet
python manage.py shell -c "
from django.contrib.auth.models import User
if not User.objects.exists():
    import subprocess
    subprocess.run(['python', 'manage.py', 'seed'])
"
