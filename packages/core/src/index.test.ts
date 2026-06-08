import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@supermemory/bash", () => ({
  createBash: vi.fn().mockResolvedValue({
    bash: {
      exec: vi.fn().mockResolvedValue({ stdout: "mocked output" }),
    },
  }),
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
    const result = await mem.read("memory/stack.md")
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
})

describe("safeBash error handling", () => {
  it("createMem succeeds even with missing apiKey shape (just needs string)", async () => {
    await expect(createMem({ apiKey: "key", container: "c" })).resolves.toBeDefined()
  })
})
