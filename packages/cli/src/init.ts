import fs from "node:fs/promises"
import path from "node:path"

interface InitOptions {
  container?: string
  apiKeyEnv: string
}

const MEMORY_PATHS = [
  "memory/stack.md",
  "memory/conventions.md",
  "memory/decisions.md",
]

export async function init(opts: InitOptions): Promise<void> {
  const container = opts.container ?? process.env["EDGEMEM_CONTAINER"] ?? "myproject"
  const cwd = process.cwd()

  await fs.mkdir(path.join(cwd, ".claude/memory"), { recursive: true })
  await fs.writeFile(path.join(cwd, ".claude/memory/.gitkeep"), "", "utf-8")

  const rcContent = JSON.stringify(
    { container, apiKeyEnv: opts.apiKeyEnv },
    null,
    2
  )
  await fs.writeFile(path.join(cwd, ".clauderc"), rcContent, "utf-8")

  await updateClaudeMd(cwd)

  console.log(`
edgemem initialized for container: ${container}

Created:
  .clauderc                   ← stores container config
  .claude/memory/.gitkeep     ← memory sync target

Updated:
  CLAUDE.md                   ← added @import entries

Next steps:
  1. Set SUPERMEMORY_API_KEY in your environment
  2. Run: npx edgemem sync
  3. Start Claude Code — memory is ready
`)
}

async function updateClaudeMd(cwd: string): Promise<void> {
  const memorySection = `
## Team Memory (auto-synced from edgemem)
<!-- Run: npx edgemem sync before each session -->

@.claude/memory/stack.md
@.claude/memory/conventions.md
@.claude/memory/decisions.md
`

  const claudeMdPath = path.join(cwd, "CLAUDE.md")

  let existing = ""
  try {
    existing = await fs.readFile(claudeMdPath, "utf-8")
  } catch {
    // file doesn't exist yet — create it
  }

  if (existing.includes("## Team Memory")) {
    return
  }

  await fs.writeFile(claudeMdPath, existing + memorySection, "utf-8")
}
