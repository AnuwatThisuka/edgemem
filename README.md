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

All three modes share the same Supermemory container — one source of truth.

---

## Quick start

### Prerequisites

- Node.js 18+
- A [Supermemory](https://supermemory.ai) API key

### Phase 1 — File sync (start here)

```bash
export SUPERMEMORY_API_KEY=sm-...
export EDGEMEM_CONTAINER=myproject-team

npx edgemem init          # setup project, update CLAUDE.md
npx edgemem write "memory/stack.md" "
Database: PostgreSQL 16
ORM: Drizzle (not Prisma)
Package manager: pnpm
Framework: Next.js App Router
"
npx edgemem sync          # pull memory → .claude/memory/
claude                    # open Claude Code — it reads memory automatically
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

Claude Code now has 5 memory tools — see [MCP tools](#mcp-tools) below.

### Phase 3 — Hook (zero effort)

```bash
cp -r examples/phase3-hook/.claude .claude
export EDGEMEM_CONTAINER=myproject-team
```

Every Claude Code session now starts with memory pre-loaded. No commands. No prompting.

---

## Security

### Protected core files

The following memory files are **read-only by default**. The agent cannot overwrite them — only a human can, with an explicit override:

| File                    | Purpose                 |
| ----------------------- | ----------------------- |
| `memory/stack.md`       | Tech stack and versions |
| `memory/conventions.md` | Coding conventions      |
| `memory/decisions.md`   | Architecture decisions  |
| `memory/onboarding.md`  | New developer guide     |

**To allow human-initiated mutations:**

```bash
# CLI — use the --force flag
npx edgemem write "memory/stack.md" "updated stack" --force

# MCP server — set the env var
EDGEMEM_ALLOW_CORE_MUTATION=true npx @edgemem/mcp
```

Any attempt by the agent to write to these files without the override is rejected with a clear error before any API call is made.

### PII and secret scanner

Every `write` and `append` operation automatically scans content and redacts high-probability credentials before they reach Supermemory:

| Pattern                     | Label                            |
| --------------------------- | -------------------------------- |
| `sk_live_*` / `sk_test_*`   | Stripe API keys                  |
| `AIzaSy*`                   | Google Cloud / Firebase API keys |
| `AKIA*`                     | AWS Access Key IDs               |
| `ghp_*` / `gho_*` / `ghs_*` | GitHub tokens                    |
| `xoxb-*`                    | Slack bot tokens                 |
| `Bearer <token>`            | Generic bearer tokens            |
| `password: <value>`         | Password literals                |
| `secret: <value>`           | Secret literals                  |

Redacted content is stored as `[REDACTED:label]`. The audit log records which labels were stripped.

---

## Offline resilience

edgemem never crashes Claude Code if Supermemory is unreachable.

**On every successful `read`**, content is written to a local disk cache at `~/.edgemem/cache/<container>/`.

**If the API is unreachable:**

- `read` — returns the latest cached version, warns to `stderr`
- `write` / `append` — writes to local cache, warns to `stderr`
- `grep` — returns empty string, warns to `stderr`
- `list` — returns empty array

The agent continues working with stale-but-available data instead of failing.

---

## Audit log

Every operation is appended to `.claude/memory/edgemem.log` in [JSON Lines](https://jsonlines.org/) format:

```jsonl
{"timestamp":"2026-06-08T10:33:10Z","action":"read","file_path":"memory/stack.md","status":"ok"}
{"timestamp":"2026-06-08T10:33:11Z","action":"write","file_path":"memory/auto-saved.md","status":"pii-redacted","detail":"redacted: stripe-live-key"}
{"timestamp":"2026-06-08T10:33:12Z","action":"read","file_path":"memory/stack.md","status":"cache-hit"}
```

| Field    | Values                                                      |
| -------- | ----------------------------------------------------------- |
| `action` | `read` · `write` · `append` · `grep` · `list` · `export`    |
| `status` | `ok` · `error` · `cache-hit` · `pii-redacted` · `protected` |
| `detail` | Optional — present when status is `pii-redacted` or `error` |

The log file is append-only and never throws on write failure (audit itself is fail-silent).

---

## Smart context chunking

`mem_grep` (and the CLI `grep` command) runs a semantic search, then **chunks the result** before returning it to Claude.

Instead of dumping an entire file into the context window, edgemem:

1. Splits the result by headings (`#`, `##`, `###`) or paragraphs
2. Scores each section by how many query terms it matches (heading matches score 3×)
3. Returns only the top sections within a **4,000-token budget**
4. Prepends a warning when sections were dropped

```
[edgemem] Showing 3/8 sections (~2,400 tokens). Remaining omitted to protect context window.

## Database
PostgreSQL 16 with Drizzle ORM.

## Migrations
Run with pnpm db:migrate. Never edit migrations by hand.
```

---

## CLI reference

```bash
# Setup
npx edgemem init [--container <name>] [--api-key-env <name>]

# Sync (Phase 1)
npx edgemem sync [--output <dir>] [--container <name>]

# Read / write
npx edgemem read <path> [--container <name>]
npx edgemem write <path> <content> [--container <name>] [--force]
npx edgemem append <path> <content> [--container <name>] [--force]

# Search
npx edgemem grep <query> [--path <path>] [--container <name>]
npx edgemem list [--path <path>] [--container <name>]

# Hook injection (Phase 3)
npx edgemem inject [--container <name>] [--format context|json]
```

`--force` bypasses write protection on core files. Intended for human use only — the agent should never pass this flag autonomously.

---

## MCP tools

| Tool         | Description                               | Protected-path safe?                              |
| ------------ | ----------------------------------------- | ------------------------------------------------- |
| `mem_read`   | Read a file from team memory              | ✅ (read-only)                                    |
| `mem_write`  | Write or overwrite a memory file          | Blocked unless `EDGEMEM_ALLOW_CORE_MUTATION=true` |
| `mem_append` | Append content to a memory file           | Blocked unless `EDGEMEM_ALLOW_CORE_MUTATION=true` |
| `mem_grep`   | Semantic search (returns chunked results) | ✅ (read-only)                                    |
| `mem_list`   | List memory files                         | ✅ (read-only)                                    |

All tools return a text error message (never throw) so Claude Code always gets a usable response.

---

## For teams

All developers share the same memory container. One person writes a convention — everyone's agent knows it immediately.

```bash
# Developer A (Monday)
npx edgemem append "memory/conventions.md" "Use server actions for mutations" --force

# Developer B (Tuesday, different machine)
claude
# → Claude already knows about server actions. No sync needed. No commit needed.
```

**Onboarding a new developer:**

```bash
git clone your-repo
export SUPERMEMORY_API_KEY=sm-...   # from team 1Password
claude
# → Claude knows the entire project context from day one
```

---

## Memory file conventions

```
memory/stack.md        — tech stack, versions, tools              [protected]
memory/conventions.md  — coding conventions and patterns          [protected]
memory/decisions.md    — architecture decisions and rationale     [protected]
memory/onboarding.md   — guide for new developers                 [protected]
memory/auto-saved.md   — conventions captured automatically        [writable]
memory/<anything>.md   — your own files                            [writable]
```

Protected files require `--force` (CLI) or `EDGEMEM_ALLOW_CORE_MUTATION=true` (MCP/env) to modify. All other files are freely writable by the agent.

---

## Write signatures

Every `write` and `append` wraps the content in a pair of HTML comment markers that identify who wrote it and when:

```
<!-- edgemem-entry-start | author: alice | timestamp: 2026-06-08T10:33:10.123Z -->
Use Drizzle ORM. Run migrations with pnpm db:migrate.
<!-- edgemem-entry-end -->
```

This makes concurrent writes from multiple developers or agent sessions unambiguous — each entry is a self-contained, attributable block.

### Author resolution

The `author` field is resolved in this order:

| Priority | Source |
|----------|--------|
| 1 | `author` option passed to `createMem()` |
| 2 | `EDGEMEM_AUTHOR` environment variable |
| 3 | `USER` environment variable (Unix username) |
| 4 | `"unknown"` |

**SDK:**

```typescript
const mem = await createMem(config, { author: "alice" })
// → <!-- edgemem-entry-start | author: alice | timestamp: ... -->
```

**Environment variable (MCP server / CLI):**

```bash
EDGEMEM_AUTHOR=ci-bot npx @edgemem/mcp
```

The `author` is also written to the audit log on every `write` and `append` operation, so `.claude/memory/edgemem.log` gives a full attributable history:

```jsonl
{"timestamp":"2026-06-08T10:33:10Z","action":"write","file_path":"memory/auto-saved.md","status":"ok","author":"alice"}
{"timestamp":"2026-06-08T10:33:11Z","action":"append","file_path":"memory/auto-saved.md","status":"ok","author":"bob"}
```

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
| Offline access   | ✅ always        | ✅ local cache fallback |

**Recommended pattern:**

```markdown
# CLAUDE.md — structural rules (static)

Project layout, tool configuration, things that almost never change.

# Dynamic memory — managed by edgemem

@.claude/memory/conventions.md
@.claude/memory/decisions.md
```

Keep `CLAUDE.md` short and structural. Let edgemem handle living knowledge.

---

## Configuration

Config is resolved in this order (first match wins):

1. Environment variables: `SUPERMEMORY_API_KEY`, `EDGEMEM_CONTAINER`, `EDGEMEM_AUTHOR`
2. `.clauderc` in the project root
3. `~/.edgemem/config.json` (global default)

| Variable | Purpose |
|----------|---------|
| `SUPERMEMORY_API_KEY` | API key for Supermemory |
| `EDGEMEM_CONTAINER` | Container name shared by the team |
| `EDGEMEM_AUTHOR` | Identity stamped on every write entry (falls back to `$USER`) |
| `EDGEMEM_ALLOW_CORE_MUTATION` | Set to `true` to allow writes to protected core files |

**`.clauderc`:**

```json
{
  "container": "myproject-team",
  "apiKeyEnv": "SUPERMEMORY_API_KEY"
}
```

**`~/.edgemem/config.json`:**

```json
{
  "container": "myproject-team",
  "apiKey": "sm-..."
}
```

---

## Development

```bash
pnpm install
pnpm build      # compile all packages
pnpm test       # run all 167 tests
```

### Package structure

```
packages/
  core/          @edgemem/core — MemClient, guard, cache, audit, chunker
  mcp/           @edgemem/mcp  — MCP server (5 tools)
  cli/           edgemem       — CLI (init, sync, read, write, append, grep, list, inject)
examples/
  phase1-claudemd/  — file sync example + setup.sh
  phase2-mcp/       — .mcp.json + CLAUDE.md instructions
  phase3-hook/      — .claude/settings.json + auto-save.sh
```

### Test coverage

| Package         | Test files                                    | Tests   |
| --------------- | --------------------------------------------- | ------- |
| `@edgemem/core` | `guard`, `cache`, `audit`, `chunker`, `index` | 107     |
| `@edgemem/mcp`  | `server`                                      | 30      |
| `edgemem` CLI   | `init`, `sync`, `inject`                      | 30      |
| **Total**       | **9**                                         | **167** |

---

## License

MIT
