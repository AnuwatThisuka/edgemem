# edgemem

Filesystem-native agent memory layer for Claude Code.
Wraps `@supermemory/bash` and exposes memory as files that Claude Code can read, write, and semantic-search.

## Three integration modes

| Phase | How it works | Best for |
|-------|-------------|---------|
| **Phase 1** — CLAUDE.md | Sync memory → local files → `@import` in CLAUDE.md | Simple setup, team onboarding |
| **Phase 2** — MCP | Live `mem_read`/`mem_write` tools during session | Active memory during work |
| **Phase 3** — Hook | Auto-inject memory on every tool call | Zero-effort, always-on |

## Quick start

### Install

```bash
npm install -g edgemem          # CLI (Phase 1 + 3)
# or use npx edgemem <command>
```

### Phase 1 — file sync

```bash
export SUPERMEMORY_API_KEY=your-key
export EDGEMEM_CONTAINER=myproject

npx edgemem init     # setup project, update CLAUDE.md
npx edgemem sync     # pull memory → .claude/memory/
```

### Phase 2 — MCP server

Add to `.mcp.json`:
```json
{
  "mcpServers": {
    "edgemem": {
      "command": "npx",
      "args": ["@edgemem/mcp"],
      "env": {
        "SUPERMEMORY_API_KEY": "${SUPERMEMORY_API_KEY}",
        "EDGEMEM_CONTAINER": "myproject"
      }
    }
  }
}
```

### Phase 3 — auto-hook

Copy `examples/phase3-hook/.claude/` to your project and set `EDGEMEM_CONTAINER` in your shell.

## CLI commands

```bash
npx edgemem init                          # setup project
npx edgemem sync                          # pull memory → local files
npx edgemem write "memory/stack.md" "…"  # write a memory file
npx edgemem append "memory/stack.md" "…" # append to a memory file
npx edgemem read "memory/stack.md"        # read a memory file
npx edgemem grep "database"               # semantic search
npx edgemem list                          # list all memory files
npx edgemem inject --format context       # output formatted context (for hooks)
```

## Memory file conventions

```
memory/stack.md        ← tech stack, versions, tools
memory/conventions.md  ← coding conventions, patterns
memory/decisions.md    ← architecture decisions + rationale
memory/onboarding.md   ← new dev guide
memory/auto-saved.md   ← auto-captured conventions (Phase 3)
```

## Config resolution

Config is resolved in this order:

1. `SUPERMEMORY_API_KEY` / `EDGEMEM_CONTAINER` env vars
2. `.clauderc` in project root
3. `~/.edgemem/config.json` (global)

**.clauderc format:**
```json
{
  "container": "myproject-team",
  "apiKeyEnv": "SUPERMEMORY_API_KEY"
}
```

## Development

```bash
pnpm install
pnpm build
pnpm test
```

## Packages

| Package | Description |
|---------|-------------|
| `@edgemem/core` | Shared MemClient — wraps `@supermemory/bash` |
| `@edgemem/mcp` | MCP server — 5 tools for Claude Code |
| `edgemem` | CLI — init, sync, inject, read/write/grep/list |
