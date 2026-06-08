import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import type { MemClient } from "@edgemem/core"

vi.mock("@edgemem/core", () => ({ createMem: vi.fn() }))

import { createMem } from "@edgemem/core"
import { sync } from "./sync.js"

const CONFIG = { apiKey: "test-key", container: "test-container" }

// ls -la style entries — the sync command takes the last whitespace-separated token as the filename
const LS_ENTRIES = [
  "-rw-r--r--  1 user group  100 Jun 8 stack.md",
  "-rw-r--r--  1 user group  200 Jun 8 conventions.md",
  "-rw-r--r--  1 user group  300 Jun 8 decisions.md",
]

function makeMem(overrides: Partial<MemClient> = {}): MemClient {
  return {
    read: vi.fn().mockResolvedValue("file content"),
    write: vi.fn(),
    append: vi.fn(),
    grep: vi.fn(),
    list: vi.fn().mockResolvedValue(LS_ENTRIES),
    export: vi.fn(),
    ...overrides,
  }
}

describe("sync", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "edgemem-sync-"))
    vi.mocked(createMem).mockResolvedValue(makeMem())
    vi.spyOn(console, "log").mockImplementation(() => undefined)
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // ── Directory creation ────────────────────────────────────────────────────

  it("creates the outputDir if it does not exist", async () => {
    const outputDir = path.join(tmpDir, "nested", "memory")
    await sync({ config: CONFIG, outputDir })
    const stat = await fs.stat(outputDir)
    expect(stat.isDirectory()).toBe(true)
  })

  it("does not throw if outputDir already exists", async () => {
    const outputDir = path.join(tmpDir, "memory")
    await fs.mkdir(outputDir)
    await expect(sync({ config: CONFIG, outputDir })).resolves.toBeUndefined()
  })

  // ── File writing ──────────────────────────────────────────────────────────

  it("writes all non-empty files from the list to the output directory", async () => {
    const outputDir = path.join(tmpDir, "memory")
    await sync({ config: CONFIG, outputDir })
    const files = await fs.readdir(outputDir)
    expect(files).toContain("stack.md")
    expect(files).toContain("conventions.md")
    expect(files).toContain("decisions.md")
  })

  it("writes the correct content returned by mem.read", async () => {
    vi.mocked(createMem).mockResolvedValue(
      makeMem({
        list: vi.fn().mockResolvedValue(["-rw-r--r--  1 user group 10 Jun 8 stack.md"]),
        read: vi.fn().mockResolvedValue("Node 20, PostgreSQL 16"),
      })
    )
    const outputDir = path.join(tmpDir, "memory")
    await sync({ config: CONFIG, outputDir })
    const content = await fs.readFile(path.join(outputDir, "stack.md"), "utf-8")
    expect(content).toBe("Node 20, PostgreSQL 16")
  })

  it("reads each file from the /memory/ remote path", async () => {
    const mem = makeMem()
    vi.mocked(createMem).mockResolvedValue(mem)
    const outputDir = path.join(tmpDir, "memory")
    await sync({ config: CONFIG, outputDir })
    expect(mem.read).toHaveBeenCalledWith("/memory/stack.md")
    expect(mem.read).toHaveBeenCalledWith("/memory/conventions.md")
  })

  // ── Filtering ─────────────────────────────────────────────────────────────

  it("skips entries whose name is '.'", async () => {
    vi.mocked(createMem).mockResolvedValue(
      makeMem({
        list: vi.fn().mockResolvedValue([
          "drwxr-xr-x  2 user group 64 Jun 8 .",
          "-rw-r--r--  1 user group 10 Jun 8 stack.md",
        ]),
      })
    )
    const outputDir = path.join(tmpDir, "memory")
    await sync({ config: CONFIG, outputDir })
    const files = await fs.readdir(outputDir)
    expect(files).not.toContain(".")
    expect(files).toContain("stack.md")
  })

  it("skips entries whose name is '..'", async () => {
    vi.mocked(createMem).mockResolvedValue(
      makeMem({ list: vi.fn().mockResolvedValue(["drwxr-xr-x  2 user group 64 Jun 8 .."]) })
    )
    const outputDir = path.join(tmpDir, "memory")
    await sync({ config: CONFIG, outputDir })
    const files = await fs.readdir(outputDir)
    expect(files).not.toContain("..")
  })

  it("skips files with empty content", async () => {
    vi.mocked(createMem).mockResolvedValue(
      makeMem({
        list: vi.fn().mockResolvedValue(["-rw-r--r--  1 user group 0 Jun 8 empty.md"]),
        read: vi.fn().mockResolvedValue(""),
      })
    )
    const outputDir = path.join(tmpDir, "memory")
    await sync({ config: CONFIG, outputDir })
    const files = await fs.readdir(outputDir)
    expect(files).not.toContain("empty.md")
  })

  // ── Empty list ────────────────────────────────────────────────────────────

  it("logs 'nothing to sync' when the remote list is empty", async () => {
    vi.mocked(createMem).mockResolvedValue(
      makeMem({ list: vi.fn().mockResolvedValue([]) })
    )
    await sync({ config: CONFIG, outputDir: path.join(tmpDir, "out") })
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/nothing to sync/i)
    )
  })

  // ── Summary output ────────────────────────────────────────────────────────

  it("logs the synced file count on success", async () => {
    const outputDir = path.join(tmpDir, "memory")
    await sync({ config: CONFIG, outputDir })
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("3")
    )
  })

  // ── Error resilience ──────────────────────────────────────────────────────

  it("continues syncing other files when one read throws", async () => {
    let callCount = 0
    vi.mocked(createMem).mockResolvedValue(
      makeMem({
        list: vi.fn().mockResolvedValue([
          "-rw-r--r--  1 user group 10 Jun 8 good.md",
          "-rw-r--r--  1 user group 10 Jun 8 bad.md",
        ]),
        read: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 2) throw new Error("read failed")
          return Promise.resolve("good content")
        }),
      })
    )
    const outputDir = path.join(tmpDir, "memory")
    await expect(sync({ config: CONFIG, outputDir })).resolves.toBeUndefined()
    const files = await fs.readdir(outputDir)
    expect(files).toContain("good.md")
  })
})
