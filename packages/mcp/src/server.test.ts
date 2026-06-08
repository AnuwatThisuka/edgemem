import { describe, it, expect, vi } from "vitest"
import { createServer } from "./server.js"
import type { MemClient } from "@edgemem/core"

type McpHandler = (req: unknown) => Promise<unknown>
type McpHandlers = { _requestHandlers: Map<string, McpHandler> }

function getHandler(server: ReturnType<typeof createServer>, method: string): McpHandler {
  const handler = (server as unknown as McpHandlers)._requestHandlers.get(method)
  if (!handler) throw new Error(`No handler for ${method}`)
  return handler
}

function mockMem(overrides: Partial<MemClient> = {}): MemClient {
  return {
    read: vi.fn().mockResolvedValue("mock content"),
    write: vi.fn().mockResolvedValue(undefined),
    append: vi.fn().mockResolvedValue(undefined),
    grep: vi.fn().mockResolvedValue("## Stack\nNode 20\n\n## Database\nPostgreSQL 16"),
    list: vi.fn().mockResolvedValue(["file1.md", "file2.md"]),
    export: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

async function callTool(
  server: ReturnType<typeof createServer>,
  name: string,
  args: Record<string, unknown>
): Promise<{ content: { text: string }[]; isError?: boolean }> {
  const handler = getHandler(server, "tools/call")
  return (await handler({
    method: "tools/call",
    params: { name, arguments: args },
  })) as { content: { text: string }[]; isError?: boolean }
}

// ── Tool listing ─────────────────────────────────────────────────────────────

describe("MCP Server — tools/list", () => {
  it("exposes exactly 5 tools", async () => {
    const server = createServer(mockMem())
    const handler = getHandler(server, "tools/list")
    const result = (await handler({ method: "tools/list", params: {} })) as {
      tools: { name: string }[]
    }
    const names = result.tools.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining(["mem_read", "mem_write", "mem_append", "mem_grep", "mem_list"])
    )
    expect(names).toHaveLength(5)
  })
})

// ── mem_read ─────────────────────────────────────────────────────────────────

describe("mem_read", () => {
  it("returns file content", async () => {
    const mem = mockMem({ read: vi.fn().mockResolvedValue("stack: node 20") })
    const server = createServer(mem)
    const result = await callTool(server, "mem_read", { path: "memory/stack.md" })
    expect(result.content[0]?.text).toBe("stack: node 20")
    expect(mem.read).toHaveBeenCalledWith("memory/stack.md")
  })

  it("returns (empty) when content is empty string", async () => {
    const mem = mockMem({ read: vi.fn().mockResolvedValue("") })
    const server = createServer(mem)
    const result = await callTool(server, "mem_read", { path: "memory/missing.md" })
    expect(result.content[0]?.text).toBe("(empty)")
  })
})

// ── mem_write ─────────────────────────────────────────────────────────────────

describe("mem_write", () => {
  it("calls mem.write and returns confirmation", async () => {
    const mem = mockMem()
    const server = createServer(mem)
    const result = await callTool(server, "mem_write", {
      path: "memory/custom.md",
      content: "Node 20",
    })
    expect(result.content[0]?.text).toContain("Written to memory/custom.md")
    expect(mem.write).toHaveBeenCalledWith("memory/custom.md", "Node 20")
  })

  it("rejects writes to protected paths by default", async () => {
    const mem = mockMem()
    const server = createServer(mem) // allowCoreMutation defaults to false
    const result = await callTool(server, "mem_write", {
      path: "memory/stack.md",
      content: "overwrite",
    })
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain("Protected")
    expect(mem.write).not.toHaveBeenCalled()
  })

  it("allows writes to protected paths when allowCoreMutation=true", async () => {
    const mem = mockMem()
    const server = createServer(mem, { allowCoreMutation: true })
    const result = await callTool(server, "mem_write", {
      path: "memory/stack.md",
      content: "new stack",
    })
    expect(result.isError).toBeUndefined()
    expect(mem.write).toHaveBeenCalledWith("memory/stack.md", "new stack")
  })
})

// ── mem_append ────────────────────────────────────────────────────────────────

describe("mem_append", () => {
  it("appends to non-protected files", async () => {
    const mem = mockMem()
    const server = createServer(mem)
    const result = await callTool(server, "mem_append", {
      path: "memory/auto-saved.md",
      content: "new convention",
    })
    expect(result.isError).toBeUndefined()
    expect(mem.append).toHaveBeenCalled()
  })

  it("rejects append to protected paths", async () => {
    const mem = mockMem()
    const server = createServer(mem)
    const result = await callTool(server, "mem_append", {
      path: "memory/conventions.md",
      content: "injected",
    })
    expect(result.isError).toBe(true)
    expect(mem.append).not.toHaveBeenCalled()
  })
})

// ── mem_grep ──────────────────────────────────────────────────────────────────

describe("mem_grep", () => {
  it("returns chunked result, not raw dump", async () => {
    const mem = mockMem({
      grep: vi.fn().mockResolvedValue("## Stack\nNode 20\n\n## Database\nPostgreSQL 16"),
    })
    const server = createServer(mem)
    const result = await callTool(server, "mem_grep", { query: "database" })
    // Should contain the relevant heading
    expect(result.content[0]?.text).toContain("Database")
    expect(result.isError).toBeUndefined()
  })

  it("returns (no results) when grep returns empty", async () => {
    const mem = mockMem({ grep: vi.fn().mockResolvedValue("") })
    const server = createServer(mem)
    const result = await callTool(server, "mem_grep", { query: "missing" })
    expect(result.content[0]?.text).toBe("(no results)")
  })
})

// ── Error handling ────────────────────────────────────────────────────────────

describe("Error handling", () => {
  it("returns isError=true when a tool throws, not an unhandled rejection", async () => {
    const mem = mockMem({ read: vi.fn().mockRejectedValue(new Error("network error")) })
    const server = createServer(mem)
    const result = await callTool(server, "mem_read", { path: "broken.md" })
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain("network error")
  })
})
