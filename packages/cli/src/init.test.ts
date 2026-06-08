import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

describe("init", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "edgemem-test-"))
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir)
    vi.spyOn(console, "log").mockImplementation(() => undefined)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it("creates .clauderc with container name", async () => {
    const { init } = await import("./init.js")
    await init({ container: "myproject", apiKeyEnv: "SUPERMEMORY_API_KEY" })

    const rc = JSON.parse(await fs.readFile(path.join(tmpDir, ".clauderc"), "utf-8"))
    expect(rc.container).toBe("myproject")
    expect(rc.apiKeyEnv).toBe("SUPERMEMORY_API_KEY")
  })

  it("creates .claude/memory/.gitkeep", async () => {
    const { init } = await import("./init.js")
    await init({ container: "test", apiKeyEnv: "SUPERMEMORY_API_KEY" })

    const exists = await fs
      .access(path.join(tmpDir, ".claude/memory/.gitkeep"))
      .then(() => true)
      .catch(() => false)
    expect(exists).toBe(true)
  })

  it("updates CLAUDE.md with memory imports", async () => {
    const { init } = await import("./init.js")
    await init({ container: "test", apiKeyEnv: "SUPERMEMORY_API_KEY" })

    const claudeMd = await fs.readFile(path.join(tmpDir, "CLAUDE.md"), "utf-8")
    expect(claudeMd).toContain("@.claude/memory/stack.md")
    expect(claudeMd).toContain("@.claude/memory/conventions.md")
    expect(claudeMd).toContain("@.claude/memory/decisions.md")
  })

  it("does not duplicate Team Memory section on second init", async () => {
    const { init } = await import("./init.js")
    await init({ container: "test", apiKeyEnv: "SUPERMEMORY_API_KEY" })
    await init({ container: "test", apiKeyEnv: "SUPERMEMORY_API_KEY" })

    const claudeMd = await fs.readFile(path.join(tmpDir, "CLAUDE.md"), "utf-8")
    const count = (claudeMd.match(/## Team Memory/g) ?? []).length
    expect(count).toBe(1)
  })
})
