# edgemem

> Filesystem-native agent memory for Claude Code — your team's conventions, decisions, and context, available to every agent session without repeating yourself.

```diff
- "We use Drizzle not Prisma. pnpm not npm. No default exports."
- (repeated every session, by every developer, forever)
+ edgemem write "memory/stack.md" "..."   # once
+ # Claude knows. Every session. Every developer.
```

---

## The problem

Claude Code forgets everything when you close a session.

Every morning, every developer on your team re-explains the same things:

- Which ORM you use
- Which patterns are required
- Which decisions were made and why
- What the new dev should know on day one

`CLAUDE.md` helps — but it's static, requires a commit to update, can't be written by the agent, and grows until it fills the context window.

edgemem fixes this.

---

## How it works

```
Team writes conventions once → stored in Supermemory cloud
                                        ↓
Every Claude Code session → edgemem loads what's relevant
                                        ↓
Agent learns something new → edgemem saves it automatically
                                        ↓
Next session → Claude already knows
```

Memory lives in the cloud. Every developer shares it. No commits required.

---

## Three modes — pick what fits

|                   | Phase 1 · File sync                      | Phase 2 · MCP             | Phase 3 · Hook               |
| ----------------- | ---------------------------------------- | ------------------------- | ---------------------------- |
| How               | `edgemem sync` → local files → `@import` | Live tools in Claude Code | Auto-inject on every session |
| Agent writes back | ❌                                       | ✅                        | ✅                           |
| Setup effort      | Low                                      | Medium                    | Medium                       |
| Best for          | Getting started, onboarding              | Active development        | Zero-effort, always-on       |

---

## Quick start

### Install

```bash
npm install -g edgemem
```

You'll need a [Supermemory](https://supermemory.ai) API key.

### Phase 1 — File sync (start here)

```bash
export SUPERMEMORY_API_KEY=sm-...
export EDGEMEM_CONTAINER=myproject-team

edgemem init          # setup project, update CLAUDE.md
edgemem write "memory/stack.md" "
Database: PostgreSQL 16
ORM: Drizzle (not Prisma)
Package manager: pnpm
Framework: Next.js App Router
"
edgemem write "memory/conventions.md" "
Never use any type
Services must end with Service e.g. UserService
Test coverage minimum 80%
Use Result pattern, not throw
No default exports
"
edgemem sync          # pull memory → .claude/memory/
claude                # open Claude Code — it reads memory automatically
```

### Phase 2 — MCP server (real-time)

Add `.mcp.json` to your project root:

```json
{
  "mcpServers": {
    "edgemem": {
      "command": "npx",
      "args": ["@edgemem/mcp"],
      "env": {
        "SUPERMEMORY_API_KEY": "${SUPERMEMORY_API_KEY}",
        "EDGEMEM_CONTAINER": "myproject-team"
      }
    }
  }
}
```

Claude Code now has 5 memory tools:

```
mem_read    — load a memory file
mem_write   — save a new memory file
mem_append  — add to an existing file
mem_grep    — semantic search across all memory
mem_list    — list all memory files
```

**In action:**

```
You:    "We always validate with Zod, remember that"
Claude: [calls mem_append("memory/conventions.md", "...")]
        "Saved to team memory ✓"

# Next session — new developer, fresh terminal:
You:    "Write me a POST /users endpoint"
Claude: [calls mem_grep("conventions")]
        → uses Zod automatically, Result pattern, correct naming
        → no instruction needed
```

### Phase 3 — Hook (zero effort)

Copy the hook config to your project:

```bash
cp -r examples/phase3-hook/.claude .claude
```

Set your container in your shell profile:

```bash
export EDGEMEM_CONTAINER=myproject-team
```

That's it. Every Claude Code session now starts with memory pre-loaded.
No commands. No prompting. No repeating yourself.

---

## For teams

All developers share the same memory container. One person writes a convention — everyone's agent knows it immediately.

```bash
# Developer A (Monday)
edgemem append "memory/conventions.md" "Use server actions for mutations"

# Developer B (Tuesday, different machine)
claude
# → Claude already knows about server actions
# → No sync needed. No commit needed.
```

**Onboarding a new developer:**

```bash
git clone your-repo
export SUPERMEMORY_API_KEY=sm-...   # from team 1Password
claude
# → Claude knows the entire project context
# → New dev productive from hour one
```

---

## CLI reference

```bash
edgemem init                           # setup project, update CLAUDE.md
edgemem sync                           # pull memory → .claude/memory/
edgemem write <path> <content>         # write a memory file
edgemem append <path> <content>        # append to a memory file
edgemem read <path>                    # read a memory file
edgemem grep <query>                   # semantic search
edgemem list                           # list all memory files
edgemem inject --format context        # output formatted context (used by hooks)
```

---

## Memory file conventions

```
memory/stack.md        — tech stack, versions, tools
memory/conventions.md  — coding conventions and patterns
memory/decisions.md    — architecture decisions and rationale
memory/onboarding.md   — guide for new developers
memory/auto-saved.md   — conventions captured automatically (Phase 3)
```

These are suggestions. Name your files however fits your team.

---

## edgemem vs CLAUDE.md

Both solve the same problem. They work best together.

|                  | CLAUDE.md        | edgemem                 |
| ---------------- | ---------------- | ----------------------- |
| Stored           | Git repo         | Supermemory cloud       |
| Update           | Commit required  | Write anytime           |
| Agent can write  | ❌               | ✅                      |
| Size limit       | Context window   | Load only what's needed |
| Search           | Read whole file  | Semantic search         |
| Per-person notes | ❌ everyone sees | ✅ separate containers  |

**Recommended pattern:**

```markdown
# CLAUDE.md — static project rules

Project structure, permission rules, tool configuration.
(Things that almost never change)

# Dynamic memory — managed by edgemem

@.claude/memory/conventions.md
@.claude/memory/decisions.md
```

Keep `CLAUDE.md` short and structural. Let edgemem handle the rest.

---

## edgemem vs SKILL.md

Different purposes, no conflict.

```
SKILL.md   — how to do a task  "steps to create a React component"
CLAUDE.md  — project rules     "never use any type"
edgemem    — team memory       "we switched from Prisma to Drizzle in March"
```

All three work together in the same session.

---

## Configuration

Config is resolved in this order:

1. Environment variables: `SUPERMEMORY_API_KEY`, `EDGEMEM_CONTAINER`
2. `.clauderc` in project root
3. `~/.edgemem/config.json` (global default)

**`.clauderc`:**

```json
{
  "container": "myproject-team",
  "apiKeyEnv": "SUPERMEMORY_API_KEY"
}
```

---

## Packages

| Package         | Description                                    |
| --------------- | ---------------------------------------------- |
| `@edgemem/core` | Shared `MemClient` — wraps `@supermemory/bash` |
| `@edgemem/mcp`  | MCP server — 5 tools for Claude Code           |
| `edgemem`       | CLI — init, sync, inject, read/write/grep/list |

---

## Development

```bash
pnpm install
pnpm build
pnpm test
```

---

## License

MIT
