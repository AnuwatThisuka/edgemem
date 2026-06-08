import { describe, it, expect, vi, beforeEach } from "vitest"

// vi.hoisted ensures variables are available inside vi.mock factory closures
const { mockExec, mockWriteCache, mockReadCache, mockAppendCache, mockAppendAuditLog } =
  vi.hoisted(() => ({
    mockExec: vi.fn().mockResolvedValue({ stdout: "remote content" }),
    mockWriteCache: vi.fn().mockResolvedValue(undefined),
    mockReadCache: vi.fn().mockResolvedValue(undefined),
    mockAppendCache: vi.fn().mockResolvedValue(undefined),
    mockAppendAuditLog: vi.fn().mockResolvedValue(undefined),
  }))

vi.mock("@supermemory/bash", () => ({
  createBash: vi.fn().mockResolvedValue({ bash: { exec: mockExec } }),
}))

vi.mock("./cache.js", () => ({
  writeCache: mockWriteCache,
  readCache: mockReadCache,
  appendCache: mockAppendCache,
}))

vi.mock("./audit.js", () => ({
  appendAuditLog: mockAppendAuditLog,
  setAuditLogPath: vi.fn(),
}))

import { createMem, ProtectedFileError } from "./index.js"

const CONFIG = { apiKey: "test-key", container: "test-container" }

function makeOnline(output = "remote content"): void {
  mockExec.mockResolvedValue({ stdout: output })
}

function makeOffline(): void {
  mockExec.mockRejectedValue(new Error("ECONNREFUSED"))
}

// ── createMem factory ─────────────────────────────────────────────────────────

describe("createMem", () => {
  it("resolves to a MemClient with all 6 methods", async () => {
    const mem = await createMem(CONFIG)
    expect(typeof mem.read).toBe("function")
    expect(typeof mem.write).toBe("function")
    expect(typeof mem.append).toBe("function")
    expect(typeof mem.grep).toBe("function")
    expect(typeof mem.list).toBe("function")
    expect(typeof mem.export).toBe("function")
  })

  it("accepts an empty MemOptions object without error", async () => {
    await expect(createMem(CONFIG, {})).resolves.toBeDefined()
  })
})

// ── read ──────────────────────────────────────────────────────────────────────

describe("MemClient.read — online", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    makeOnline()
    mockReadCache.mockResolvedValue(undefined)
  })

  it("returns the content from the remote API", async () => {
    const mem = await createMem(CONFIG)
    expect(await mem.read("memory/stack.md")).toBe("remote content")
  })

  it("writes the fetched content to the local cache", async () => {
    const mem = await createMem(CONFIG)
    await mem.read("memory/stack.md")
    expect(mockWriteCache).toHaveBeenCalledWith(
      CONFIG.container,
      "memory/stack.md",
      "remote content"
    )
  })

  it("logs an audit entry with status 'ok'", async () => {
    const mem = await createMem(CONFIG)
    await mem.read("memory/stack.md")
    expect(mockAppendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "read", status: "ok" })
    )
  })
})

describe("MemClient.read — offline fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    makeOffline()
    vi.spyOn(process.stderr, "write").mockReturnValue(true)
  })

  it("serves cached content when the API is unreachable", async () => {
    mockReadCache.mockResolvedValue("cached content")
    const mem = await createMem(CONFIG)
    expect(await mem.read("memory/stack.md")).toBe("cached content")
  })

  it("warns to stderr when serving from cache", async () => {
    mockReadCache.mockResolvedValue("cached")
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true)
    const mem = await createMem(CONFIG)
    await mem.read("memory/stack.md")
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("offline"))
  })

  it("logs audit status 'cache-hit' when served from cache", async () => {
    mockReadCache.mockResolvedValue("cached")
    const mem = await createMem(CONFIG)
    await mem.read("memory/stack.md")
    expect(mockAppendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cache-hit" })
    )
  })

  it("returns empty string when offline with no cache entry", async () => {
    mockReadCache.mockResolvedValue(undefined)
    const mem = await createMem(CONFIG)
    expect(await mem.read("memory/missing.md")).toBe("")
  })

  it("logs audit status 'error' when offline with no cache", async () => {
    mockReadCache.mockResolvedValue(undefined)
    const mem = await createMem(CONFIG)
    await mem.read("memory/missing.md")
    expect(mockAppendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error" })
    )
  })
})

// ── write — protection ────────────────────────────────────────────────────────

describe("MemClient.write — write protection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    makeOnline()
  })

  const PROTECTED = [
    "memory/stack.md",
    "memory/conventions.md",
    "memory/decisions.md",
    "memory/onboarding.md",
  ]

  it.each(PROTECTED)("throws ProtectedFileError for %s by default", async (p) => {
    const mem = await createMem(CONFIG)
    await expect(mem.write(p, "x")).rejects.toThrow(ProtectedFileError)
  })

  it("succeeds for protected paths when allowCoreMutation=true", async () => {
    const mem = await createMem(CONFIG, { allowCoreMutation: true })
    await expect(mem.write("memory/stack.md", "ok")).resolves.toBeUndefined()
  })

  it("always succeeds for non-protected paths", async () => {
    const mem = await createMem(CONFIG)
    await expect(mem.write("memory/auto-saved.md", "ok")).resolves.toBeUndefined()
    await expect(mem.write("memory/sprint-notes.md", "ok")).resolves.toBeUndefined()
  })
})

// ── write — PII scanning ──────────────────────────────────────────────────────

describe("MemClient.write — PII scanning", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    makeOnline()
  })

  it("strips PII from content before caching", async () => {
    const mem = await createMem(CONFIG)
    await mem.write("memory/auto-saved.md", "password: hunter2")
    const [, , cachedContent] =
      mockWriteCache.mock.calls.find((c) => c[1] === "memory/auto-saved.md") ?? []
    expect(String(cachedContent)).not.toContain("hunter2")
    expect(String(cachedContent)).toContain("[REDACTED:")
  })

  it("logs audit status 'pii-redacted' when PII is detected", async () => {
    const mem = await createMem(CONFIG)
    await mem.write("memory/auto-saved.md", "password: hunter2")
    expect(mockAppendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pii-redacted" })
    )
  })

  it("logs audit status 'ok' when content is clean", async () => {
    const mem = await createMem(CONFIG)
    await mem.write("memory/auto-saved.md", "Node 20, pnpm, Drizzle")
    expect(mockAppendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ok" })
    )
  })
})

// ── write — signature stamping ────────────────────────────────────────────────

describe("MemClient.write — write signature", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    makeOnline()
  })

  it("appends an edgemem HTML comment to the exec command payload", async () => {
    const mem = await createMem(CONFIG)
    await mem.write("memory/auto-saved.md", "clean content")
    const execArg = String(
      mockExec.mock.calls.find((c) => String(c[0]).includes("cat >"))?.[0] ?? ""
    )
    expect(execArg).toContain("<!-- edgemem:")
    expect(execArg).toContain("session:")
  })

  it("uses the caller-supplied sessionId in every stamp", async () => {
    const mem = await createMem(CONFIG, { sessionId: "abc-123" })
    await mem.write("memory/auto-saved.md", "first")
    await mem.write("memory/auto-saved.md", "second")
    const calls = mockExec.mock.calls
      .filter((c) => String(c[0]).includes("cat >"))
      .map((c) => String(c[0]))
    expect(calls[0]).toContain("abc-123")
    expect(calls[1]).toContain("abc-123")
  })
})

// ── append — protection ───────────────────────────────────────────────────────

describe("MemClient.append — write protection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    makeOnline()
  })

  it("throws ProtectedFileError when appending to a protected path", async () => {
    const mem = await createMem(CONFIG)
    await expect(mem.append("memory/conventions.md", "injected")).rejects.toThrow(
      ProtectedFileError
    )
  })

  it("succeeds for non-protected paths", async () => {
    const mem = await createMem(CONFIG)
    await expect(mem.append("memory/auto-saved.md", "new line")).resolves.toBeUndefined()
  })

  it("updates the local cache via appendCache", async () => {
    const mem = await createMem(CONFIG)
    await mem.append("memory/auto-saved.md", "new line")
    expect(mockAppendCache).toHaveBeenCalledWith(
      CONFIG.container,
      "memory/auto-saved.md",
      expect.any(String)
    )
  })
})

// ── grep ──────────────────────────────────────────────────────────────────────

describe("MemClient.grep", () => {
  it("returns raw bash output when online", async () => {
    makeOnline("## DB\nPostgreSQL 16")
    const mem = await createMem(CONFIG)
    expect(await mem.grep("database")).toBe("## DB\nPostgreSQL 16")
  })

  it("returns empty string and warns to stderr when offline", async () => {
    makeOffline()
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true)
    const mem = await createMem(CONFIG)
    const result = await mem.grep("database")
    expect(result).toBe("")
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("offline"))
    stderrSpy.mockRestore()
  })
})

// ── list ──────────────────────────────────────────────────────────────────────

describe("MemClient.list", () => {
  it("splits the bash output into an array of trimmed, non-empty lines", async () => {
    makeOnline("file1.md\nfile2.md\nfile3.md")
    const mem = await createMem(CONFIG)
    const result = await mem.list()
    expect(result).toEqual(["file1.md", "file2.md", "file3.md"])
  })

  it("returns empty array when bash output is empty", async () => {
    makeOnline("")
    const mem = await createMem(CONFIG)
    expect(await mem.list()).toEqual([])
  })

  it("returns empty array when offline", async () => {
    makeOffline()
    const mem = await createMem(CONFIG)
    expect(await mem.list()).toEqual([])
  })
})
