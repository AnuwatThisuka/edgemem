# Phase 3 — Hook (auto-load memory every session)

Memory loads automatically at the start of every Claude Code session.
No commands, no prompting. Memory is always there.

## Setup (one time)

1. Copy `.claude/` to your project root:
   ```bash
   cp -r .claude /path/to/your/project/
   chmod +x /path/to/your/project/.claude/hooks/auto-save.sh
   ```

2. Set your container in your shell profile:
   ```bash
   echo 'export EDGEMEM_CONTAINER=myproject-team' >> ~/.zshrc
   source ~/.zshrc
   ```

3. Open Claude Code — memory loads automatically on every tool call.

## What happens automatically

| Event | Hook | Action |
|-------|------|--------|
| Tool use starts | PreToolUse | `edgemem inject` → memory context injected |
| Tool use ends | PostToolUse | `auto-save.sh` → scans output for conventions |

## Auto-save keywords

The auto-save hook detects these keywords in tool output and saves them:

- `convention: ...`
- `remember: ...`
- `save to memory: ...`

Example — if Claude outputs:
> "convention: always use PostgreSQL transactions for multi-table writes"

That line is automatically appended to `memory/auto-saved.md`.

## Combining all three phases

For the best experience, use all phases together:

```bash
# .mcp.json → Phase 2 (live read/write tools)
# .claude/settings.json → Phase 3 (auto-inject hooks)
# npx edgemem sync → Phase 1 (export to CLAUDE.md files)
```

Memory written via MCP tools is available to the inject hook in the next session.
Memory synced via Phase 1 is available for CLAUDE.md imports.
All three share the same Supermemory container — one source of truth.
