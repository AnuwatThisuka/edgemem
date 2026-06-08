import { createMem, type MemConfig } from "@edgemem/core"

interface InjectOptions {
  config: MemConfig
  format: "context" | "json"
}

const MEMORY_FILES = [
  "memory/stack.md",
  "memory/conventions.md",
  "memory/decisions.md",
  "memory/onboarding.md",
  "memory/auto-saved.md",
]

export async function inject(opts: InjectOptions): Promise<void> {
  const mem = await createMem(opts.config)

  const sections: Record<string, string> = {}

  await Promise.all(
    MEMORY_FILES.map(async (filePath) => {
      const content = await mem.read(filePath)
      if (content.trim()) {
        sections[filePath] = content
      }
    })
  )

  if (Object.keys(sections).length === 0) {
    return
  }

  if (opts.format === "json") {
    process.stdout.write(JSON.stringify(sections, null, 2) + "\n")
    return
  }

  const lines: string[] = ["=== Team Memory ==="]
  for (const [filePath, content] of Object.entries(sections)) {
    const name = filePath.split("/").pop() ?? filePath
    lines.push(`\n[${name}]`)
    lines.push(content.trim())
  }
  lines.push("\n=== End Memory ===\n")

  process.stdout.write(lines.join("\n"))
}
