#!/usr/bin/env python3
"""
Anniversary check script - standalone cron job.
Checks all anniversaries and rules for today, sends Feishu notifications.

Usage:
    python3 scripts/check_anniversaries.py

Cron example (every day at 09:00):
    0 9 * * * cd /path/to/personal-website && /usr/bin/python3 scripts/check_anniversaries.py >> data/anniversary_check.log 2>&1
"""

import sys
import os

# Add project root to sys.path so we can import app module
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, PROJECT_DIR)

from datetime import datetime

from app import app, run_anniversary_check


if __name__ == '__main__':
    with app.app_context():
        triggered, today_str = run_anniversary_check()

        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Anniversary check for {today_str}")
        print(f"  Total triggered: {len(triggered)}")
        for t in triggered:
            print(f"    - {t['name']} ({t['type']})")
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Done.")
