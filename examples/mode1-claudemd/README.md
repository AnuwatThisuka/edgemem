# Mode 1 — CLAUDE.md dynamic memory

Sync memory from Supermemory cloud → local `.claude/memory/` files so CLAUDE.md can `@import` them.
No MCP, no hooks. Just files that Claude Code reads at session start.

## Prerequisites

- Node.js 18+
- A Supermemory API key: https://supermemory.ai
- `SUPERMEMORY_API_KEY` set in your environment

## Setup (one time)

```bash
export SUPERMEMORY_API_KEY=your-key-here
export EDGEMEM_CONTAINER=myproject

bash setup.sh
```

## What it creates

```
.clauderc                    ← container config
.claude/memory/
  .gitkeep
  stack.md                   ← pulled from Supermemory
  conventions.md
  decisions.md
CLAUDE.md                    ← updated with @imports
```

## Daily use

Before each Claude Code session, run:

```bash
npx edgemem sync
```

Or add it to your shell profile alias:

```bash
alias claude-start='npx edgemem sync && claude'
```

## Writing memory

```bash
# Write a file
npx edgemem write "memory/stack.md" "Node 20, PostgreSQL 16, React 18"

# Search memory
npx edgemem grep "database"

# List all files
npx edgemem list
```

## CLAUDE.md pattern

See `CLAUDE.md.example` for the recommended import pattern.
