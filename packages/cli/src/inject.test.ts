import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { MemClient } from "@edgemem/core"

vi.mock("@edgemem/core", () => ({ createMem: vi.fn() }))

import { createMem } from "@edgemem/core"
import { inject } from "./inject.js"

const CONFIG = { apiKey: "test-key", container: "test-container" }

function makeMem(files: Record<string, string>): MemClient {
  return {
    read: vi.fn().mockImplementation((p: string) => Promise.resolve(files[p] ?? "")),
    write: vi.fn(),
    append: vi.fn(),
    grep: vi.fn(),
    list: vi.fn(),
    export: vi.fn(),
  }
}

describe("inject", () => {
  let captured: string

  beforeEach(() => {
    captured = ""
    vi.spyOn(process.stdout, "write").mockImplementation((...args: unknown[]) => {
      captured += String(args[0])
      return true
    })
  })

  afterEach(() => vi.restoreAllMocks())

  // ── Empty memory ──────────────────────────────────────────────────────────

  it("writes nothing when all memory files are empty", async () => {
    vi.mocked(createMem).mockResolvedValue(makeMem({}))
    await inject({ config: CONFIG, format: "context" })
    expect(captured).toBe("")
  })

  it("writes nothing when files contain only whitespace", async () => {
    vi.mocked(createMem).mockResolvedValue(
      makeMem({ "memory/stack.md": "   \n  \t  " })
    )
    await inject({ config: CONFIG, format: "context" })
    expect(captured).toBe("")
  })

  // ── context format ────────────────────────────────────────────────────────

  it("wraps output in === Team Memory === markers", async () => {
    vi.mocked(createMem).mockResolvedValue(makeMem({ "memory/stack.md": "Node 20" }))
    await inject({ config: CONFIG, format: "context" })
    expect(captured).toContain("=== Team Memory ===")
    expect(captured).toContain("=== End Memory ===")
  })

  it("includes a [filename] header for each non-empty file", async () => {
    vi.mocked(createMem).mockResolvedValue(
      makeMem({
        "memory/stack.md": "Node 20",
        "memory/conventions.md": "No any types",
      })
    )
    await inject({ config: CONFIG, format: "context" })
    expect(captured).toContain("[stack.md]")
    expect(captured).toContain("[conventions.md]")
  })

  it("includes the file content under its header", async () => {
    vi.mocked(createMem).mockResolvedValue(
      makeMem({ "memory/stack.md": "Node 20, PostgreSQL 16" })
    )
    await inject({ config: CONFIG, format: "context" })
    expect(captured).toContain("Node 20, PostgreSQL 16")
  })

  it("skips empty files and omits their headers", async () => {
    vi.mocked(createMem).mockResolvedValue(
      makeMem({
        "memory/stack.md": "Node 20",
        "memory/conventions.md": "",
      })
    )
    await inject({ config: CONFIG, format: "context" })
    expect(captured).toContain("[stack.md]")
    expect(captured).not.toContain("[conventions.md]")
  })

  it("handles multiple non-empty files in one output block", async () => {
    vi.mocked(createMem).mockResolvedValue(
      makeMem({
        "memory/stack.md": "Node 20",
        "memory/decisions.md": "Use PostgreSQL",
        "memory/onboarding.md": "Run pnpm install first",
      })
    )
    await inject({ config: CONFIG, format: "context" })
    expect(captured).toContain("[stack.md]")
    expect(captured).toContain("[decisions.md]")
    expect(captured).toContain("[onboarding.md]")
  })

  // ── json format ───────────────────────────────────────────────────────────

  it("writes valid JSON in json format", async () => {
    vi.mocked(createMem).mockResolvedValue(makeMem({ "memory/stack.md": "Node 20" }))
    await inject({ config: CONFIG, format: "json" })
    expect(() => JSON.parse(captured)).not.toThrow()
  })

  it("json output maps file paths to content strings", async () => {
    vi.mocked(createMem).mockResolvedValue(
      makeMem({
        "memory/stack.md": "Node 20",
        "memory/conventions.md": "No any types",
      })
    )
    await inject({ config: CONFIG, format: "json" })
    const parsed = JSON.parse(captured) as Record<string, string>
    expect(parsed["memory/stack.md"]).toBe("Node 20")
    expect(parsed["memory/conventions.md"]).toBe("No any types")
  })

  it("json output omits empty-string files", async () => {
    vi.mocked(createMem).mockResolvedValue(
      makeMem({
        "memory/stack.md": "Node 20",
        "memory/conventions.md": "",
      })
    )
    await inject({ config: CONFIG, format: "json" })
    const parsed = JSON.parse(captured) as Record<string, string>
    expect(Object.keys(parsed)).not.toContain("memory/conventions.md")
  })
})
