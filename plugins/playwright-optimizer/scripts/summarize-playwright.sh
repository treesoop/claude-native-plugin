#!/bin/bash
# playwright-optimizer: Summarize Playwright MCP snapshots with Haiku
# Reduces Opus token consumption by ~80% while preserving all ref= values
#
# How it works:
#   1. Intercepts Playwright MCP tool responses via PostToolUse hook
#   2. Sends large snapshots to Claude Haiku for summarization
#   3. Returns compact summary with all interactive refs preserved
#   4. Opus receives ~2K tokens instead of ~12K tokens

set -e

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
TOOL_RESPONSE=$(echo "$INPUT" | jq -r '.tool_response // empty')

# Only process Playwright MCP tools
if [[ "$TOOL_NAME" != mcp__playwright__* ]]; then
  exit 0
fi

RAW_LEN=${#TOOL_RESPONSE}

# Skip short responses (under 3000 chars) - not worth summarizing
if [ "$RAW_LEN" -lt 3000 ]; then
  exit 0
fi

# Require ANTHROPIC_API_KEY
API_KEY="${ANTHROPIC_API_KEY:-}"
if [ -z "$API_KEY" ]; then
  exit 0
fi

# Summarize with Haiku
SYSTEM_PROMPT='You are a Playwright browser snapshot summarizer. Extract ONLY actionable information for an AI agent that interacts with web pages.

Rules:
- Keep ALL ref= values (e.g. ref=e123) - the agent needs these to click/interact
- Keep ALL URLs and link targets
- Keep form fields, buttons, and their states
- Keep page title and current URL
- For listings: extract item name, key details, ref for link
- Remove: footers, ads, calendars, redundant navigation, styling info, unchanged elements
- Remove: verbose YAML structure - use compact format
- Output in the same language as the page content
- Be concise but NEVER drop ref values or interactive elements'

USER_PROMPT="Summarize this Playwright snapshot. Keep all ref= values for interactive elements:

${TOOL_RESPONSE}"

RESPONSE=$(curl -s --max-time 15 https://api.anthropic.com/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -H "anthropic-version: 2023-06-01" \
  -d "$(jq -n \
    --arg system "$SYSTEM_PROMPT" \
    --arg user "$USER_PROMPT" \
    '{
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: $system,
      messages: [{role: "user", content: $user}]
    }')")

SUMMARY=$(echo "$RESPONSE" | jq -r '.content[0].text // empty')

# If summarization fails, pass through original
if [ -z "$SUMMARY" ]; then
  exit 0
fi

# Replace MCP tool output with summary
jq -n --arg out "[Haiku Summary] ${SUMMARY}" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    updatedMCPToolOutput: $out
  }
}'
