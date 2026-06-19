#!/bin/bash
# Personal Website Start Script
cd "$(dirname "$0")"
source venv/bin/activate
echo "Starting personal website on port 80..."
exec gunicorn -w 4 -b 0.0.0.0:80 app:app
