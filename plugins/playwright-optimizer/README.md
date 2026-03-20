# Playwright Optimizer

Reduce Playwright MCP token usage by **~80%** using Claude Haiku as a summarization layer.

## Problem

Every Playwright MCP snapshot sends **10,000-15,000 tokens** of raw YAML to your primary model (Opus/Sonnet). Most of this is noise — footers, calendars, styling info, redundant navigation.

A typical browser automation session burns **40,000+ tokens** just on page snapshots.

## Solution

This plugin intercepts Playwright MCP responses via a `PostToolUse` hook and summarizes them with Claude Haiku before they reach your primary model.

```
Playwright MCP → 12,000 token YAML snapshot
    → PostToolUse hook triggers
    → Haiku summarizes to ~2,000 tokens (keeps all ref= values)
    → Primary model receives compact summary
```

## Benchmarks

Tested on real browser automation tasks (3-page navigation):

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Tokens per snapshot | ~12,000 | ~2,000 | **-80%** |
| 3-page session total | ~38,500 chars | ~8,200 chars | **-79%** |
| Cost (Opus pricing) | $0.144 | $0.056 | **-61%** |

All `ref=` values are preserved, so clicking and interacting with elements works as before.

## Requirements

- `ANTHROPIC_API_KEY` environment variable set
- `jq` and `curl` installed
- Playwright MCP server configured in Claude Code

## Install

```bash
/plugin marketplace add potenlab/claude-native-plugin
/plugin install playwright-optimizer
```

## How It Works

1. **PostToolUse hook** catches all `mcp__playwright__*` tool responses
2. Responses under 3,000 characters pass through unchanged
3. Large responses are sent to **Claude Haiku** with a prompt optimized for extracting:
   - All `ref=` values for interactive elements
   - Page URL and title
   - Links, buttons, form fields
   - Content listings in compact format
4. The summarized response replaces the original via `updatedMCPToolOutput`
5. If Haiku fails or API key is missing, the original response passes through (safe fallback)

## What Gets Removed

- Footer content (company info, legal links)
- Calendar/date picker widgets
- Redundant navigation menus
- Verbose YAML nesting structure
- Non-interactive structural elements
- Styling and layout information

## What Gets Preserved

- All `ref=` values (critical for `browser_click`)
- Page URL and title
- Interactive elements (buttons, links, inputs)
- Form fields and their states
- Content listings with key details
- Error/console messages

## License

MIT
