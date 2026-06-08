# Phase 2 — MCP Server (real-time memory during session)

Claude Code gets `mem_read`, `mem_write`, `mem_append`, `mem_grep`, `mem_list`
as native tools. Memory is live during the session — no file sync needed.

## Setup

1. Get a Supermemory API key: https://supermemory.ai
2. Copy `.mcp.json` to your project root
3. Set `SUPERMEMORY_API_KEY` in your environment:
   ```bash
   export SUPERMEMORY_API_KEY=your-key-here
   ```
4. Open Claude Code — the 5 memory tools are now available

## First-time project setup

Tell Claude Code:

> "Initialize our team memory with our project conventions.
> Ask me 5 questions about our stack and save the answers."

Claude will ask, then save everything to memory automatically.

## Available tools

| Tool | Description |
|------|-------------|
| `mem_read` | Read a file from team memory |
| `mem_write` | Write or overwrite a file |
| `mem_append` | Append to an existing file |
| `mem_grep` | Semantic search across all memory |
| `mem_list` | List files in memory |

## Example prompts

```
"Load our project conventions from memory"
"Save this decision to memory/decisions.md: we use PostgreSQL not MySQL"
"Search memory for anything about authentication"
"What does the team memory say about our deployment process?"
```

## Combining with Phase 1

Phase 2 MCP works alongside Phase 1 file sync. You can use both:
- MCP for live read/write during sessions
- `npx edgemem sync` to export memory to local files for CLAUDE.md imports
