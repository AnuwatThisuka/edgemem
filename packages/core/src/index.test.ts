import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@supermemory/bash", () => ({
  createBash: vi.fn().mockResolvedValue({
    bash: {
      exec: vi.fn().mockResolvedValue({ stdout: "mocked output" }),
    },
  }),
}))

// Stub audit + cache so tests don't touch the filesystem
vi.mock("./audit.js", () => ({
  appendAuditLog: vi.fn().mockResolvedValue(undefined),
  setAuditLogPath: vi.fn(),
}))

vi.mock("./cache.js", () => ({
  writeCache: vi.fn().mockResolvedValue(undefined),
  readCache: vi.fn().mockResolvedValue(undefined),
  appendCache: vi.fn().mockResolvedValue(undefined),
}))

import { createMem } from "./index.js"

describe("createMem", () => {
  const config = { apiKey: "test-key", container: "test-container" }

  it("creates a MemClient with all required methods", async () => {
    const mem = await createMem(config)
    expect(typeof mem.read).toBe("function")
    expect(typeof mem.write).toBe("function")
    expect(typeof mem.append).toBe("function")
    expect(typeof mem.grep).toBe("function")
    expect(typeof mem.list).toBe("function")
    expect(typeof mem.export).toBe("function")
  })

  it("read returns string output from bash", async () => {
    const mem = await createMem(config)
    const result = await mem.read("memory/auto-saved.md")
    expect(typeof result).toBe("string")
  })

  it("list returns an array", async () => {
    const mem = await createMem(config)
    const result = await mem.list()
    expect(Array.isArray(result)).toBe(true)
  })

  it("grep returns string output", async () => {
    const mem = await createMem(config)
    const result = await mem.grep("database")
    expect(typeof result).toBe("string")
  })

  it("write to a protected path throws ProtectedFileError by default", async () => {
    const mem = await createMem(config)
    await expect(mem.write("memory/stack.md", "content")).rejects.toThrow("protected")
  })

  it("write to a protected path succeeds with allowCoreMutation=true", async () => {
    const mem = await createMem(config, { allowCoreMutation: true })
    await expect(mem.write("memory/stack.md", "content")).resolves.toBeUndefined()
  })

  it("write to non-protected path always succeeds", async () => {
    const mem = await createMem(config)
    await expect(mem.write("memory/custom.md", "content")).resolves.toBeUndefined()
  })
})

describe("createMem factory", () => {
  it("resolves even with minimal config", async () => {
    await expect(createMem({ apiKey: "key", container: "c" })).resolves.toBeDefined()
  })
})
