# Claude Native Plugins by Potenlab

Plugins that save tokens, time, and money for Claude Code users.

## Install

```bash
/plugin marketplace add potenlab/claude-native-plugin
```

## Plugins

| Plugin | Description | Savings |
|--------|-------------|---------|
| [playwright-optimizer](./plugins/playwright-optimizer) | Summarize Playwright MCP snapshots with Haiku before they reach Opus | ~80% token reduction |

## How It Works

These plugins use Claude Code's native hook system to optimize expensive operations. No external dependencies beyond what Claude Code already provides.

### playwright-optimizer

Playwright MCP sends massive YAML snapshots (10K-15K tokens) for every browser interaction. This plugin intercepts them via `PostToolUse` hook, summarizes with Claude Haiku (~$0.01 per summary), and passes a compact ~2K token version to your primary model.

**Before:**
```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e5]:
        - generic [ref=e6] [cursor=pointer]:
          - img [ref=e7]
          ... (hundreds more lines)
```

**After:**
```markdown
# Page Summary
**URL:** https://example.com
## Interactive Elements
- Login button [ref=e44]
- Search box [ref=e91]
## Content
1. Item A [ref=e136] - $50,000 - 120 days
2. Item B [ref=e193] - $30,000 - 90 days
```

## Requirements

- `ANTHROPIC_API_KEY` environment variable
- `jq` and `curl` (pre-installed on most systems)

## License

MIT
