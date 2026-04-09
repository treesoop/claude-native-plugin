#!/bin/bash
# task-tracker setup: configure invite key
# Usage: bash plugins/task-tracker/scripts/setup.sh

CONFIG_FILE="$HOME/.task-tracker.json"

echo "=== Task Tracker Setup ==="
echo ""

read -p "Invite Key: " INVITE_KEY
read -p "Your Name: " USER_NAME
read -p "Supabase URL (e.g. https://xxx.supabase.co): " SUPABASE_URL
read -p "Supabase Anon Key: " SUPABASE_ANON_KEY

cat > "$CONFIG_FILE" << EOF
{
  "invite_key": "$INVITE_KEY",
  "name": "$USER_NAME",
  "supabase_url": "$SUPABASE_URL",
  "supabase_anon_key": "$SUPABASE_ANON_KEY"
}
EOF

echo ""
echo "Config saved to $CONFIG_FILE"
echo "Task tracker is now active for all Claude Code sessions."
