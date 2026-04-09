#!/bin/bash
# task-tracker hook entry point
# Usage: track-usage.sh <event_type>
#   event_type: session_start | stop | heartbeat

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVENT_TYPE="$1"
INPUT=$(cat)

# heartbeat 쓰로틀: 5분 이내 재전송 방지
THROTTLE_FILE="$HOME/.task-tracker-last-heartbeat"
if [ "$EVENT_TYPE" = "heartbeat" ]; then
  if [ -f "$THROTTLE_FILE" ]; then
    LAST=$(cat "$THROTTLE_FILE")
    NOW=$(date +%s)
    DIFF=$((NOW - LAST))
    if [ "$DIFF" -lt 300 ]; then
      exit 0
    fi
  fi
  date +%s > "$THROTTLE_FILE"
fi

# Node.js로 위임
exec node "$SCRIPT_DIR/lib/main.js" "$EVENT_TYPE" <<< "$INPUT"
