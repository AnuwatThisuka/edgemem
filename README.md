# edgemem

Team memory for Claude Code — store your conventions, decisions, and context in the cloud so every agent session starts with full project knowledge. No more repeating yourself.

[![npm](https://img.shields.io/npm/v/edgemem)](https://www.npmjs.com/package/edgemem)
[![tests](https://img.shields.io/badge/tests-167%20passing-brightgreen)](#)
[![license](https://img.shields.io/badge/license-MIT-blue)](#license)

---

## The problem

Claude Code forgets everything when a session ends. Every day, every developer re-explains the same things:

- Which ORM the project uses
- Which patterns are required
- Which architectural decisions were made and why
- What a new dev needs to know on day one

`CLAUDE.md` helps — but it requires a commit to update, the agent can't write to it, and it grows until it fills the context window.

**edgemem fixes this.** Memory lives in [Supermemory](https://supermemory.ai) cloud. Every developer shares it. The agent can read and write it. No commits required.

---

## How it works

```
You write a convention once
         ↓
Stored in Supermemory cloud
         ↓
Every Claude Code session → edgemem loads what's relevant automatically
         ↓
Agent learns something new → writes it back to the cloud
         ↓
Next session, next developer → Claude already knows
```

**3 ways Claude receives memory:**

| Mode | How | Best for |
|------|-----|----------|
| **Mode 1 — File sync** | `edgemem sync` pulls files locally → `@import` in CLAUDE.md | Getting started, simplest setup |
| **Mode 2 — MCP server** | Claude has 5 live tools to read/write memory during the session | Active development |
| **Mode 3 — Hook** | Memory is injected automatically at session start, no commands needed | Zero-effort, always-on |

All three modes share the same Supermemory container — one source of truth.

---

## Quick start

### 1. Install and initialize

```bash
npm install -g edgemem

export SUPERMEMORY_API_KEY=sm-...
export EDGEMEM_CONTAINER=myproject-team

npx edgemem init
```

### 2. Write your first memory

```bash
npx edgemem write "memory/stack.md" "
Database: PostgreSQL 16
ORM: Drizzle (not Prisma)
Package manager: pnpm
Framework: Next.js App Router
"
```

### 3. Load memory into Claude

```bash
npx edgemem sync   # pull memory → .claude/memory/
claude             # Claude reads it automatically via CLAUDE.md
```

Every teammate with the same `SUPERMEMORY_API_KEY` gets the same context immediately.

---

## Setup modes

### Mode 1 — File sync

Pull memory down as local files and reference them from CLAUDE.md:

```bash
npx edgemem sync --output .claude/memory
```

Add to `CLAUDE.md`:

```markdown
@.claude/memory/stack.md
@.claude/memory/conventions.md
```

Limitation: requires running `sync` to pick up new memory. Agent cannot write back.

---

### Mode 2 — MCP server (recommended)

Claude gets 5 tools for reading and writing memory in real time during every session.

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

Claude now has `mem_read`, `mem_write`, `mem_append`, `mem_grep`, and `mem_list` available every session.

---

### Mode 3 — Hook (zero effort)

Memory is injected automatically at session start. No commands, no prompting.

```bash
cp -r examples/mode3-hook/.claude .claude
export EDGEMEM_CONTAINER=myproject-team
```

---

## Built for teams

All developers share the same container. One person writes a convention — everyone's agent knows immediately:

```bash
# Developer A — Monday
npx edgemem append "memory/conventions.md" "Use server actions for all mutations" --force

# Developer B — Tuesday, different machine
claude
# → Claude already knows about server actions. No sync. No commit.
```

**Onboarding a new developer:**

```bash
git clone your-repo
export SUPERMEMORY_API_KEY=sm-...   # from team 1Password
claude
# → Claude knows the entire project context from day one
```

---

## Security

### Protected core files

These files are read-only for the agent. Only a human can write to them with `--force`:

| File | Purpose |
|------|---------|
| `memory/stack.md` | Tech stack and versions |
| `memory/conventions.md` | Coding conventions |
| `memory/decisions.md` | Architecture decisions |
| `memory/onboarding.md` | New developer guide |

```bash
# Human override
npx edgemem write "memory/stack.md" "updated stack" --force

# Agent attempt → error before any API call is made
```

### PII scanner

Every `write` and `append` scans for credentials and redacts them before reaching the cloud:

| Pattern | Redacted as |
|---------|-------------|
| `sk_live_*`, `sk_test_*` | `[REDACTED_SECRET]` |
| `AIzaSy*` | `[REDACTED_SECRET]` |
| `AKIA*` | `[REDACTED_SECRET]` |
| `ghp_*`, `gho_*`, `ghs_*` | `[REDACTED_SECRET]` |
| `xoxb-*` | `[REDACTED_SECRET]` |
| `Bearer <token>` | `[REDACTED_SECRET]` |
| `password: <value>` | `[REDACTED_SECRET]` |

### Write signatures

Every write is stamped with author and timestamp:

```
<!-- edgemem-entry-start | author: alice | timestamp: 2026-06-08T10:33:10Z -->
Use Drizzle ORM. Run migrations with pnpm db:migrate.
<!-- edgemem-entry-end -->
```

Author is resolved from `EDGEMEM_AUTHOR` env var, falling back to `$USER`.

---

## Offline resilience

If Supermemory is unreachable, edgemem falls back to local cache — Claude Code never crashes:

| Operation | Behavior |
|-----------|----------|
| `read` | Returns latest cached version + warns to stderr |
| `write` / `append` | Writes to local cache + warns to stderr |
| `grep` | Returns empty string + warns to stderr |
| `list` | Returns empty array |

Cache lives at `~/.edgemem/cache/<container>/`.

---

## Smart context chunking

`mem_grep` runs a semantic search then **returns only the relevant sections** — so a large memory file never floods the context window:

1. Splits document into sections by heading or paragraph
2. Scores each section by query relevance (heading match = 3×)
3. Returns top sections within a 4,000-token budget
4. Prepends a warning when sections are dropped

---

## Audit log

Every operation is appended to `.claude/memory/edgemem.log` in JSON Lines format:

```jsonl
{"timestamp":"2026-06-08T10:33:10Z","action":"read","file_path":"memory/stack.md","status":"ok","author":"alice"}
{"timestamp":"2026-06-08T10:33:11Z","action":"write","file_path":"memory/auto-saved.md","status":"pii-redacted","detail":"redacted: stripe-live-key","author":"ci-bot"}
{"timestamp":"2026-06-08T10:33:12Z","action":"read","file_path":"memory/stack.md","status":"cache-hit","author":"bob"}
```

---

## CLI reference

```bash
# Setup
npx edgemem init [--container <name>] [--api-key-env <name>]

# Mode 1 — pull memory to local files
npx edgemem sync [--output <dir>] [--container <name>]

# Read / write
npx edgemem read <path> [--container <name>]
npx edgemem write <path> <content> [--container <name>] [--force]
npx edgemem append <path> <content> [--container <name>] [--force]

# Search
npx edgemem grep <query> [--path <path>] [--container <name>]
npx edgemem list [--path <path>] [--container <name>]

# Mode 3 — output memory context for hook injection
npx edgemem inject [--container <name>] [--format context|json]
```

`--force` bypasses write protection on core files. Intended for human use only.

---

## MCP tools

| Tool | Description | Core-file safe? |
|------|-------------|----------------|
| `mem_read` | Read a file from team memory | Read-only |
| `mem_write` | Write or overwrite a memory file | Requires `EDGEMEM_ALLOW_CORE_MUTATION=true` |
| `mem_append` | Append to a memory file | Requires `EDGEMEM_ALLOW_CORE_MUTATION=true` |
| `mem_grep` | Semantic search with chunked results | Read-only |
| `mem_list` | List all memory files | Read-only |

---

## Memory file conventions

```
memory/stack.md        — tech stack, versions, tools           [protected]
memory/conventions.md  — coding conventions and patterns       [protected]
memory/decisions.md    — architecture decisions and rationale  [protected]
memory/onboarding.md   — guide for new developers              [protected]
memory/auto-saved.md   — conventions captured automatically    [writable]
memory/<anything>.md   — your own custom files                 [writable]
```

---

## Configuration

Config is resolved in this order (first match wins):

1. Environment variables
2. `.clauderc` in the project root
3. `~/.edgemem/config.json` (global default)

| Variable | Purpose |
|----------|---------|
| `SUPERMEMORY_API_KEY` | API key for Supermemory |
| `EDGEMEM_CONTAINER` | Container name shared by the team |
| `EDGEMEM_AUTHOR` | Identity stamped on every write (falls back to `$USER`) |
| `EDGEMEM_ALLOW_CORE_MUTATION` | Set to `true` to allow agent writes to protected files |

**.clauderc:**

```json
{
  "container": "myproject-team",
  "apiKeyEnv": "SUPERMEMORY_API_KEY"
}
```

---

## Development

```bash
pnpm install
pnpm build   # compile all packages
pnpm test    # run all 167 tests
```

### Package structure

```
packages/
  core/   @edgemem/core — MemClient, guard, cache, audit, chunker
  mcp/    @edgemem/mcp  — MCP server (5 tools)
  cli/    edgemem       — CLI (init, sync, read, write, append, grep, list, inject)
examples/
  mode1-claudemd/   file sync example
  mode2-mcp/        .mcp.json + CLAUDE.md instructions
  mode3-hook/       .claude/settings.json + auto-save hook
```

### Test coverage

| Package | Tests |
|---------|-------|
| `@edgemem/core` | 107 |
| `@edgemem/mcp` | 30 |
| `edgemem` CLI | 30 |
| **Total** | **167** |

---

## License

MIT
