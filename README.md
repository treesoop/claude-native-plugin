# Claude Native Plugins by Treesoop

Plugins that save tokens, time, and money for Claude Code users.

## Install

```bash
/plugin marketplace add treesoop/claude-native-plugin
/plugin install playwright-optimizer
```

## Plugins

| Plugin | Description | Savings |
|--------|-------------|---------|
| [playwright-optimizer](./plugins/playwright-optimizer) | Summarize Playwright MCP snapshots with Haiku before they reach Opus | ~90% token reduction |

## How It Works

These plugins use Claude Code's native hook system to optimize expensive operations. **No API key needed** — uses `claude` CLI with your existing Claude Code subscription auth.

### playwright-optimizer

Playwright MCP sends massive YAML snapshots (10K-60K+ chars) for every browser interaction. This plugin intercepts them via `PostToolUse` hook, summarizes with Claude Haiku via `claude -p --model haiku`, and passes a compact summary to your primary model.

```
Playwright MCP → 60,000 char YAML snapshot
    → PostToolUse hook triggers
    → claude -p --model haiku (internal auth, no API key)
    → ~4,000 char summary (all ref= values preserved)
    → Opus receives compact summary only
```

**Tested results:**

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| `browser_navigate` | 37,983 chars | 1,922 chars | **-94%** |
| `browser_snapshot` | 37,897 chars | 1,435 chars | **-96%** |

## Requirements

- Claude Code CLI (`claude`) installed and authenticated
- `jq` installed (pre-installed on most systems)
- Playwright MCP server configured

## License

MIT
