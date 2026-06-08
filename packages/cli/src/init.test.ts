import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

describe("init", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "edgemem-init-"))
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir)
    vi.spyOn(console, "log").mockImplementation(() => undefined)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // ── .clauderc ─────────────────────────────────────────────────────────────

  it("creates .clauderc with the specified container name", async () => {
    const { init } = await import("./init.js")
    await init({ container: "myproject", apiKeyEnv: "SUPERMEMORY_API_KEY" })
    const rc = JSON.parse(await fs.readFile(path.join(tmpDir, ".clauderc"), "utf-8")) as {
      container: string
      apiKeyEnv: string
    }
    expect(rc.container).toBe("myproject")
  })

  it("stores the apiKeyEnv name in .clauderc", async () => {
    const { init } = await import("./init.js")
    await init({ container: "proj", apiKeyEnv: "MY_CUSTOM_KEY" })
    const rc = JSON.parse(await fs.readFile(path.join(tmpDir, ".clauderc"), "utf-8")) as {
      apiKeyEnv: string
    }
    expect(rc.apiKeyEnv).toBe("MY_CUSTOM_KEY")
  })

  it("defaults to 'myproject' when no container is supplied", async () => {
    const { init } = await import("./init.js")
    await init({ apiKeyEnv: "SUPERMEMORY_API_KEY" })
    const rc = JSON.parse(await fs.readFile(path.join(tmpDir, ".clauderc"), "utf-8")) as {
      container: string
    }
    expect(rc.container).toBe("myproject")
  })

  it(".clauderc is valid JSON", async () => {
    const { init } = await import("./init.js")
    await init({ container: "test", apiKeyEnv: "SUPERMEMORY_API_KEY" })
    const raw = await fs.readFile(path.join(tmpDir, ".clauderc"), "utf-8")
    expect(() => JSON.parse(raw)).not.toThrow()
  })

  // ── .claude/memory ────────────────────────────────────────────────────────

  it("creates the .claude/memory directory", async () => {
    const { init } = await import("./init.js")
    await init({ container: "test", apiKeyEnv: "SUPERMEMORY_API_KEY" })
    const stat = await fs.stat(path.join(tmpDir, ".claude", "memory"))
    expect(stat.isDirectory()).toBe(true)
  })

  it("creates .claude/memory/.gitkeep", async () => {
    const { init } = await import("./init.js")
    await init({ container: "test", apiKeyEnv: "SUPERMEMORY_API_KEY" })
    const exists = await fs
      .access(path.join(tmpDir, ".claude", "memory", ".gitkeep"))
      .then(() => true)
      .catch(() => false)
    expect(exists).toBe(true)
  })

  // ── CLAUDE.md ─────────────────────────────────────────────────────────────

  it("creates CLAUDE.md with all three @import lines", async () => {
    const { init } = await import("./init.js")
    await init({ container: "test", apiKeyEnv: "SUPERMEMORY_API_KEY" })
    const md = await fs.readFile(path.join(tmpDir, "CLAUDE.md"), "utf-8")
    expect(md).toContain("@.claude/memory/stack.md")
    expect(md).toContain("@.claude/memory/conventions.md")
    expect(md).toContain("@.claude/memory/decisions.md")
  })

  it("appends the memory section to an existing CLAUDE.md instead of overwriting", async () => {
    await fs.writeFile(
      path.join(tmpDir, "CLAUDE.md"),
      "# My Project\n\nExisting content here.\n",
      "utf-8"
    )
    const { init } = await import("./init.js")
    await init({ container: "test", apiKeyEnv: "SUPERMEMORY_API_KEY" })
    const md = await fs.readFile(path.join(tmpDir, "CLAUDE.md"), "utf-8")
    expect(md).toContain("Existing content here.")
    expect(md).toContain("@.claude/memory/stack.md")
  })

  it("does not duplicate the Team Memory section on repeated init calls", async () => {
    const { init } = await import("./init.js")
    await init({ container: "test", apiKeyEnv: "SUPERMEMORY_API_KEY" })
    await init({ container: "test", apiKeyEnv: "SUPERMEMORY_API_KEY" })
    const md = await fs.readFile(path.join(tmpDir, "CLAUDE.md"), "utf-8")
    expect((md.match(/## Team Memory/g) ?? []).length).toBe(1)
  })
})
