#!/bin/bash
# playwright-optimizer: Summarize Playwright MCP snapshots using Claude CLI (internal Haiku)
# No external API calls — uses Claude Code's own authentication (claude.ai subscription)
#
# How it works:
#   1. Intercepts Playwright MCP tool responses via PostToolUse hook
#   2. Pipes large snapshots to `claude -p --model haiku` for summarization
#   3. Returns compact summary with all interactive refs preserved
#   4. Primary model receives ~2K tokens instead of ~12K tokens

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

# Claude CLI Haiku call (uses Claude Code's subscription auth, no API key needed)
# env -u ANTHROPIC_API_KEY: ensures subscription auth is used over API key
SUMMARY=$(echo "Summarize this Playwright snapshot. Keep all ref= values for interactive elements:

${TOOL_RESPONSE}" | env -u ANTHROPIC_API_KEY claude -p --model haiku --append-system-prompt "$SYSTEM_PROMPT" --no-session-persistence 2>/dev/null)

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
