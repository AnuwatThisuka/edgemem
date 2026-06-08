# Memory

You have access to team memory via MCP tools (mem_read, mem_write, mem_append, mem_grep, mem_list).

At the START of every session:
1. Call mem_grep("project conventions") to load context
2. Call mem_read("memory/stack.md") for tech stack

When a user tells you something important (convention, decision, preference):
- Call mem_append("memory/conventions.md", content)
- Tell the user: "Saved to team memory"

Never ask the user to repeat context you can load from memory.

## Memory file conventions

| File | Contents |
|------|----------|
| memory/stack.md | Tech stack, versions, tools |
| memory/conventions.md | Coding conventions, patterns |
| memory/decisions.md | Architecture decisions + rationale |
| memory/onboarding.md | New dev guide |
| memory/auto-saved.md | Auto-captured conventions |
