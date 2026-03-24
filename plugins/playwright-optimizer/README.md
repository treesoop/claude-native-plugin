# Playwright Optimizer

Reduce Playwright MCP token usage by **~90%** using Claude Haiku as a summarization layer.

## Problem

Every Playwright MCP snapshot sends **10,000-60,000+ characters** of raw YAML to your primary model (Opus/Sonnet). Most of this is noise — footers, calendars, styling info, redundant navigation.

## Solution

This plugin intercepts Playwright MCP responses via a `PostToolUse` hook and summarizes them with Claude Haiku using `claude -p --model haiku` — **no external API calls, no API key needed**.

```
Playwright MCP → 60,000 char YAML snapshot
    → PostToolUse hook triggers
    → claude -p --model haiku (uses your Claude Code subscription auth)
    → ~2,000-4,000 char compact summary
    → Primary model receives summary only
```

## Benchmarks

Tested on real browser automation (GitHub Trending page):

| Tool Call | Before | After | Reduction |
|-----------|--------|-------|-----------|
| `browser_navigate` | 37,983 chars | 1,922 chars | **94%** |
| `browser_snapshot` | 37,897 chars | 1,435 chars | **96%** |

All `ref=` values are preserved, so clicking and interacting with elements works as before.

## Requirements

- Claude Code CLI (`claude`) installed and authenticated
- `jq` installed
- Playwright MCP server configured in Claude Code

## Install

```bash
/plugin marketplace add potenlab/claude-native-plugin
/plugin install playwright-optimizer
```

## How It Works

1. **PostToolUse hook** catches all `mcp__playwright__*` tool responses
2. Responses under 3,000 characters pass through unchanged
3. Large responses are piped to `claude -p --model haiku` for summarization
4. The summarized response replaces the original via `updatedMCPToolOutput`
5. If Haiku fails, the original response passes through (safe fallback)

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
