import { describe, it, expect, vi } from "vitest"
import { createServer } from "./server.js"
import type { MemClient } from "@edgemem/core"

function mockMem(overrides: Partial<MemClient> = {}): MemClient {
  return {
    read: vi.fn().mockResolvedValue("mock content"),
    write: vi.fn().mockResolvedValue(undefined),
    append: vi.fn().mockResolvedValue(undefined),
    grep: vi.fn().mockResolvedValue("mock grep result"),
    list: vi.fn().mockResolvedValue(["file1.md", "file2.md"]),
    export: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe("MCP Server tools", () => {
  it("exposes all 5 tools", async () => {
    const mem = mockMem()
    const server = createServer(mem)

    const handler = (server as unknown as {
      _requestHandlers: Map<string, (req: unknown) => Promise<unknown>>
    })._requestHandlers.get("tools/list")

    expect(handler).toBeDefined()
    const result = (await handler?.({ method: "tools/list", params: {} })) as {
      tools: { name: string }[]
    }
    const names = result.tools.map((t) => t.name)
    expect(names).toContain("mem_read")
    expect(names).toContain("mem_write")
    expect(names).toContain("mem_append")
    expect(names).toContain("mem_grep")
    expect(names).toContain("mem_list")
  })

  it("mem_read calls mem.read and returns content", async () => {
    const mem = mockMem({ read: vi.fn().mockResolvedValue("stack: node 20") })
    const server = createServer(mem)

    const handler = (server as unknown as {
      _requestHandlers: Map<string, (req: unknown) => Promise<unknown>>
    })._requestHandlers.get("tools/call")

    const result = (await handler?.({
      method: "tools/call",
      params: { name: "mem_read", arguments: { path: "memory/stack.md" } },
    })) as { content: { text: string }[] }

    expect(result.content[0]?.text).toBe("stack: node 20")
    expect(mem.read).toHaveBeenCalledWith("memory/stack.md")
  })

  it("mem_write calls mem.write and returns confirmation", async () => {
    const mem = mockMem()
    const server = createServer(mem)

    const handler = (server as unknown as {
      _requestHandlers: Map<string, (req: unknown) => Promise<unknown>>
    })._requestHandlers.get("tools/call")

    const result = (await handler?.({
      method: "tools/call",
      params: {
        name: "mem_write",
        arguments: { path: "memory/stack.md", content: "Node 20" },
      },
    })) as { content: { text: string }[] }

    expect(result.content[0]?.text).toContain("Written to memory/stack.md")
    expect(mem.write).toHaveBeenCalledWith("memory/stack.md", "Node 20")
  })

  it("returns error text when tool throws, not unhandled rejection", async () => {
    const mem = mockMem({ read: vi.fn().mockRejectedValue(new Error("network error")) })
    const server = createServer(mem)

    const handler = (server as unknown as {
      _requestHandlers: Map<string, (req: unknown) => Promise<unknown>>
    })._requestHandlers.get("tools/call")

    const result = (await handler?.({
      method: "tools/call",
      params: { name: "mem_read", arguments: { path: "missing.md" } },
    })) as { content: { text: string }[]; isError: boolean }

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain("network error")
  })
})
