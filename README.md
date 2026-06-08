# edgemem

ระบบ memory สำหรับ Claude Code ที่เก็บ context ของทีมไว้ใน cloud — Claude จะ "จำ" conventions, decisions, และ context ของโปรเจกต์ในทุก session โดยอัตโนมัติ

[![npm](https://img.shields.io/npm/v/edgemem)](https://www.npmjs.com/package/edgemem)
[![tests](https://img.shields.io/badge/tests-167%20passing-brightgreen)](#)
[![license](https://img.shields.io/badge/license-MIT-blue)](#license)

---

## ปัญหาที่แก้

Claude Code ลืมทุกอย่างเมื่อ session จบ ทุกเช้านักพัฒนาต้องบอก Claude ซ้ำๆ ว่า:

- โปรเจกต์นี้ใช้ ORM อะไร
- Pattern ไหนที่ห้ามใช้
- Decision ที่ทำไว้เมื่ออาทิตย์ที่แล้วคืออะไร

`CLAUDE.md` ช่วยได้บางส่วน แต่ต้อง commit ทุกครั้งที่แก้, agent เขียนเองไม่ได้, และถ้าใส่มากเกินจะกิน context window หมด

**edgemem แก้ปัญหานี้** — เก็บ memory ไว้ใน [Supermemory](https://supermemory.ai) cloud ทุกคนในทีมใช้ร่วมกัน agent อ่านและเขียนได้เอง

---

## ภาพรวม

```
นักพัฒนาเขียน convention ครั้งเดียว
           ↓
   เก็บใน Supermemory cloud
           ↓
ทุก Claude Code session → edgemem โหลด memory มาให้อัตโนมัติ
           ↓
Agent เรียนรู้อะไรใหม่ → บันทึกกลับไปที่ cloud
           ↓
session ถัดไป, นักพัฒนาคนอื่น → Claude รู้แล้ว
```

**3 วิธีที่ Claude รับ memory:**

| วิธี | ทำงานอย่างไร | เหมาะกับ |
|------|-------------|----------|
| **Phase 1 — File sync** | `edgemem sync` ดึงไฟล์มาเก็บ local → `@import` ใน CLAUDE.md | เริ่มต้น, ง่ายที่สุด |
| **Phase 2 — MCP server** | Claude มี 5 tools สำหรับอ่าน/เขียน memory ตลอด session | พัฒนา active |
| **Phase 3 — Hook** | inject memory อัตโนมัติตอน session เริ่ม ไม่ต้องทำอะไรเพิ่ม | zero-effort |

ทั้ง 3 วิธีใช้ Supermemory container เดียวกัน — ข้อมูลเป็น single source of truth

---

## Quick Start

### 1. ติดตั้งและ setup

```bash
npm install -g edgemem

export SUPERMEMORY_API_KEY=sm-...
export EDGEMEM_CONTAINER=myproject-team

npx edgemem init
```

### 2. เขียน memory แรก

```bash
npx edgemem write "memory/stack.md" "
Database: PostgreSQL 16
ORM: Drizzle (not Prisma)
Package manager: pnpm
Framework: Next.js App Router
"
```

### 3. ดึง memory มาใช้กับ Claude

```bash
npx edgemem sync   # ดึงไฟล์มาเก็บที่ .claude/memory/
claude             # Claude อ่าน memory ผ่าน CLAUDE.md อัตโนมัติ
```

ทีมทุกคนที่ตั้ง `SUPERMEMORY_API_KEY` เดียวกัน จะได้ context เดียวกันทันที

---

## การ setup แบบต่างๆ

### Phase 1 — File sync (ง่ายที่สุด)

ดึง memory มาเป็น local files แล้วให้ CLAUDE.md อ้างถึง:

```bash
npx edgemem sync --output .claude/memory
```

เพิ่มใน `CLAUDE.md`:

```markdown
@.claude/memory/stack.md
@.claude/memory/conventions.md
```

ข้อจำกัด: ต้อง run `sync` ทุกครั้งที่ต้องการ memory ใหม่, agent เขียนกลับไม่ได้

---

### Phase 2 — MCP server (แนะนำ)

Claude มี tools สำหรับอ่าน/เขียน memory แบบ real-time ระหว่าง session

เพิ่ม `.mcp.json` ที่ root ของโปรเจกต์:

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

Claude จะมี 5 tools ใหม่: `mem_read`, `mem_write`, `mem_append`, `mem_grep`, `mem_list`

---

### Phase 3 — Hook (zero-effort)

Memory inject เข้า session อัตโนมัติทุกครั้งที่เปิด Claude Code ไม่ต้องสั่ง command ใดๆ

```bash
cp -r examples/phase3-hook/.claude .claude
export EDGEMEM_CONTAINER=myproject-team
```

---

## การทำงานร่วมกันในทีม

ทุกคนในทีมใช้ container เดียวกัน — คนหนึ่งเขียน convention คนอื่นได้รู้ทันที:

```bash
# Dev A — วันจันทร์
npx edgemem append "memory/conventions.md" "ใช้ server actions สำหรับ mutations ทั้งหมด" --force

# Dev B — วันอังคาร, เครื่องคนละเครื่อง
claude
# → Claude รู้เรื่อง server actions แล้ว ไม่ต้อง sync ไม่ต้อง commit
```

**onboard dev ใหม่:**

```bash
git clone your-repo
export SUPERMEMORY_API_KEY=sm-...   # รับจาก 1Password ของทีม
claude
# → Claude รู้ context ทั้งหมดของโปรเจกต์ตั้งแต่วันแรก
```

---

## Security

### ไฟล์ที่ agent แก้ไม่ได้ (protected)

ไฟล์เหล่านี้เขียนได้เฉพาะมนุษย์ที่ใส่ `--force`:

| ไฟล์ | เก็บอะไร |
|------|---------|
| `memory/stack.md` | tech stack และ versions |
| `memory/conventions.md` | coding conventions |
| `memory/decisions.md` | architecture decisions |
| `memory/onboarding.md` | คู่มือ dev ใหม่ |

```bash
# มนุษย์เท่านั้น
npx edgemem write "memory/stack.md" "updated stack" --force

# agent พยายามเขียน → error ทันที ก่อนส่ง API
```

### PII scanner

ทุก `write` และ `append` สแกนหา credentials อัตโนมัติก่อนส่ง cloud:

| Pattern | ถูก redact เป็น |
|---------|----------------|
| `sk_live_*`, `sk_test_*` | `[REDACTED_SECRET]` |
| `AIzaSy*` | `[REDACTED_SECRET]` |
| `AKIA*` | `[REDACTED_SECRET]` |
| `ghp_*`, `gho_*`, `ghs_*` | `[REDACTED_SECRET]` |
| `xoxb-*` | `[REDACTED_SECRET]` |
| `Bearer <token>` | `[REDACTED_SECRET]` |
| `password: <value>` | `[REDACTED_SECRET]` |

### Write signatures

ทุก write มี stamp บอกว่าใครเขียนเมื่อไร:

```
<!-- edgemem-entry-start | author: alice | timestamp: 2026-06-08T10:33:10Z -->
ใช้ Drizzle ORM. Run migrations ด้วย pnpm db:migrate
<!-- edgemem-entry-end -->
```

`author` มาจาก env var `EDGEMEM_AUTHOR` หรือ `$USER`

---

## Offline mode

ถ้า Supermemory ใช้งานไม่ได้ edgemem ใช้ local cache แทน — Claude Code ไม่ crash:

| Operation | เกิดอะไร |
|-----------|---------|
| `read` | คืน cache ล่าสุด + แจ้งเตือน |
| `write` / `append` | บันทึกลง cache local + แจ้งเตือน |
| `grep` | คืน empty string + แจ้งเตือน |
| `list` | คืน empty array |

Cache เก็บที่ `~/.edgemem/cache/<container>/`

---

## Smart chunking

`mem_grep` ทำ semantic search แล้ว **ตัดเฉพาะ section ที่เกี่ยวข้อง** ก่อนส่งให้ Claude — ป้องกัน context window เต็ม:

1. แบ่ง document เป็น section ตาม heading/paragraph
2. score แต่ละ section (heading match = 3×)
3. คืน top sections ภายใน budget 4,000 tokens
4. แจ้งเตือนถ้ามี section ถูกตัดออก

---

## Audit log

ทุก operation บันทึกลง `.claude/memory/edgemem.log` ในรูป JSON Lines:

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

# Phase 1 — ดึง memory มาเป็นไฟล์ local
npx edgemem sync [--output <dir>] [--container <name>]

# อ่าน / เขียน
npx edgemem read <path> [--container <name>]
npx edgemem write <path> <content> [--container <name>] [--force]
npx edgemem append <path> <content> [--container <name>] [--force]

# ค้นหา
npx edgemem grep <query> [--path <path>] [--container <name>]
npx edgemem list [--path <path>] [--container <name>]

# Phase 3 — inject memory context สำหรับ hook
npx edgemem inject [--container <name>] [--format context|json]
```

`--force` = bypass write protection บนไฟล์ protected (สำหรับมนุษย์เท่านั้น)

---

## MCP tools

| Tool | ทำอะไร | เขียน protected files ได้? |
|------|--------|--------------------------|
| `mem_read` | อ่านไฟล์จาก memory | อ่านอย่างเดียว |
| `mem_write` | เขียน/overwrite ไฟล์ | ต้องตั้ง `EDGEMEM_ALLOW_CORE_MUTATION=true` |
| `mem_append` | เพิ่มเนื้อหาต่อท้ายไฟล์ | ต้องตั้ง `EDGEMEM_ALLOW_CORE_MUTATION=true` |
| `mem_grep` | semantic search + chunked result | อ่านอย่างเดียว |
| `mem_list` | แสดงรายการไฟล์ทั้งหมด | อ่านอย่างเดียว |

---

## Memory file conventions

```
memory/stack.md        — tech stack, versions, tools           [protected]
memory/conventions.md  — coding conventions                    [protected]
memory/decisions.md    — architecture decisions                 [protected]
memory/onboarding.md   — คู่มือ dev ใหม่                       [protected]
memory/auto-saved.md   — convention ที่ agent บันทึกเอง        [writable]
memory/<anything>.md   — ไฟล์ custom ของทีม                    [writable]
```

---

## Configuration

Config resolve ตามลำดับนี้ (ใช้อันแรกที่พบ):

1. Environment variables
2. `.clauderc` ที่ project root
3. `~/.edgemem/config.json` (global default)

| Variable | ใช้ทำอะไร |
|----------|----------|
| `SUPERMEMORY_API_KEY` | API key สำหรับ Supermemory |
| `EDGEMEM_CONTAINER` | ชื่อ container ที่ทีมใช้ร่วมกัน |
| `EDGEMEM_AUTHOR` | ชื่อที่ stamp บน write (fallback: `$USER`) |
| `EDGEMEM_ALLOW_CORE_MUTATION` | ตั้งเป็น `true` เพื่อให้ agent เขียน protected files ได้ |

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
pnpm build   # compile ทุก package
pnpm test    # run ทั้งหมด 167 tests
```

### โครงสร้าง packages

```
packages/
  core/   @edgemem/core — MemClient, guard, cache, audit, chunker
  mcp/    @edgemem/mcp  — MCP server (5 tools)
  cli/    edgemem       — CLI (init, sync, read, write, append, grep, list, inject)
examples/
  phase1-claudemd/   ตัวอย่าง file sync
  phase2-mcp/        .mcp.json + CLAUDE.md instructions
  phase3-hook/       .claude/settings.json + auto-save hook
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
