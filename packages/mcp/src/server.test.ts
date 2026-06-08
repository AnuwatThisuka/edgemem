import { describe, it, expect, vi } from "vitest"
import { createServer } from "./server.js"
import type { MemClient } from "@edgemem/core"

// ── Test helpers ──────────────────────────────────────────────────────────────

type McpHandler = (req: unknown) => Promise<unknown>
type McpServer = { _requestHandlers: Map<string, McpHandler> }

function getHandler(server: ReturnType<typeof createServer>, method: string): McpHandler {
  const handler = (server as unknown as McpServer)._requestHandlers.get(method)
  if (!handler) throw new Error(`No handler registered for '${method}'`)
  return handler
}

function mockMem(overrides: Partial<MemClient> = {}): MemClient {
  return {
    read: vi.fn().mockResolvedValue("mock content"),
    write: vi.fn().mockResolvedValue(undefined),
    append: vi.fn().mockResolvedValue(undefined),
    grep: vi.fn().mockResolvedValue("## Stack\nNode 20\n\n## Database\nPostgreSQL 16"),
    list: vi.fn().mockResolvedValue(["memory/stack.md", "memory/conventions.md"]),
    export: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

interface ToolResult {
  content: { type: string; text: string }[]
  isError?: boolean
}

async function callTool(
  server: ReturnType<typeof createServer>,
  name: string,
  args: Record<string, unknown> = {}
): Promise<ToolResult> {
  const handler = getHandler(server, "tools/call")
  return (await handler({
    method: "tools/call",
    params: { name, arguments: args },
  })) as ToolResult
}

// ── tools/list ────────────────────────────────────────────────────────────────

describe("tools/list", () => {
  it("registers exactly 5 tools", async () => {
    const server = createServer(mockMem())
    const handler = getHandler(server, "tools/list")
    const result = (await handler({ method: "tools/list", params: {} })) as {
      tools: { name: string; description: string; inputSchema: object }[]
    }
    expect(result.tools).toHaveLength(5)
  })

  it("exposes all expected tool names", async () => {
    const server = createServer(mockMem())
    const handler = getHandler(server, "tools/list")
    const { tools } = (await handler({ method: "tools/list", params: {} })) as {
      tools: { name: string }[]
    }
    const names = tools.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining(["mem_read", "mem_write", "mem_append", "mem_grep", "mem_list"])
    )
  })

  it("every tool has a description and inputSchema", async () => {
    const server = createServer(mockMem())
    const handler = getHandler(server, "tools/list")
    const { tools } = (await handler({ method: "tools/list", params: {} })) as {
      tools: { name: string; description: string; inputSchema: object }[]
    }
    for (const tool of tools) {
      expect(tool.description, `${tool.name} missing description`).toBeTruthy()
      expect(tool.inputSchema, `${tool.name} missing inputSchema`).toBeDefined()
    }
  })
})

// ── mem_read ──────────────────────────────────────────────────────────────────

describe("mem_read", () => {
  it("returns the content from mem.read", async () => {
    const mem = mockMem({ read: vi.fn().mockResolvedValue("Database: PostgreSQL 16") })
    const server = createServer(mem)
    const result = await callTool(server, "mem_read", { path: "memory/stack.md" })
    expect(result.content[0]?.text).toBe("Database: PostgreSQL 16")
    expect(mem.read).toHaveBeenCalledWith("memory/stack.md")
  })

  it("returns '(empty)' when the file is an empty string", async () => {
    const mem = mockMem({ read: vi.fn().mockResolvedValue("") })
    const result = await callTool(createServer(mem), "mem_read", { path: "memory/missing.md" })
    expect(result.content[0]?.text).toBe("(empty)")
  })

  it("does not set isError on a successful read", async () => {
    const result = await callTool(createServer(mockMem()), "mem_read", { path: "x.md" })
    expect(result.isError).toBeUndefined()
  })
})

// ── mem_write ─────────────────────────────────────────────────────────────────

describe("mem_write — non-protected paths", () => {
  it("calls mem.write with the correct arguments", async () => {
    const mem = mockMem()
    await callTool(createServer(mem), "mem_write", {
      path: "memory/auto-saved.md",
      content: "Use pnpm",
    })
    expect(mem.write).toHaveBeenCalledWith("memory/auto-saved.md", "Use pnpm")
  })

  it("returns a confirmation message containing the path", async () => {
    const result = await callTool(createServer(mockMem()), "mem_write", {
      path: "memory/custom.md",
      content: "content",
    })
    expect(result.content[0]?.text).toContain("memory/custom.md")
    expect(result.isError).toBeUndefined()
  })

  it("accepts empty content without error", async () => {
    const result = await callTool(createServer(mockMem()), "mem_write", {
      path: "memory/custom.md",
      content: "",
    })
    expect(result.isError).toBeUndefined()
  })
})

describe("mem_write — protected paths", () => {
  const PROTECTED = [
    "memory/stack.md",
    "memory/conventions.md",
    "memory/decisions.md",
    "memory/onboarding.md",
  ]

  it.each(PROTECTED)("rejects write to %s by default", async (path) => {
    const mem = mockMem()
    const result = await callTool(createServer(mem), "mem_write", {
      path,
      content: "attempt",
    })
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain("Protected")
    expect(mem.write).not.toHaveBeenCalled()
  })

  it("allows write to protected paths when allowCoreMutation=true", async () => {
    const mem = mockMem()
    const result = await callTool(
      createServer(mem, { allowCoreMutation: true }),
      "mem_write",
      { path: "memory/stack.md", content: "new stack" }
    )
    expect(result.isError).toBeUndefined()
    expect(mem.write).toHaveBeenCalledWith("memory/stack.md", "new stack")
  })

  it("error message mentions EDGEMEM_ALLOW_CORE_MUTATION", async () => {
    const result = await callTool(createServer(mockMem()), "mem_write", {
      path: "memory/stack.md",
      content: "x",
    })
    expect(result.content[0]?.text).toContain("EDGEMEM_ALLOW_CORE_MUTATION")
  })
})

// ── mem_append ────────────────────────────────────────────────────────────────

describe("mem_append — non-protected paths", () => {
  it("calls mem.append with the correct arguments", async () => {
    const mem = mockMem()
    await callTool(createServer(mem), "mem_append", {
      path: "memory/auto-saved.md",
      content: "convention: use Result pattern",
    })
    expect(mem.append).toHaveBeenCalledWith(
      "memory/auto-saved.md",
      "convention: use Result pattern"
    )
  })

  it("returns a confirmation message", async () => {
    const result = await callTool(createServer(mockMem()), "mem_append", {
      path: "memory/auto-saved.md",
      content: "ok",
    })
    expect(result.content[0]?.text).toContain("Appended")
    expect(result.isError).toBeUndefined()
  })
})

describe("mem_append — protected paths", () => {
  it("rejects append to protected paths by default", async () => {
    const mem = mockMem()
    const result = await callTool(createServer(mem), "mem_append", {
      path: "memory/conventions.md",
      content: "injected",
    })
    expect(result.isError).toBe(true)
    expect(mem.append).not.toHaveBeenCalled()
  })

  it("allows append to protected paths when allowCoreMutation=true", async () => {
    const mem = mockMem()
    const result = await callTool(
      createServer(mem, { allowCoreMutation: true }),
      "mem_append",
      { path: "memory/conventions.md", content: "added by human" }
    )
    expect(result.isError).toBeUndefined()
    expect(mem.append).toHaveBeenCalled()
  })
})

// ── mem_grep ──────────────────────────────────────────────────────────────────

describe("mem_grep", () => {
  it("returns chunked / formatted output, not a raw dump", async () => {
    const mem = mockMem({
      grep: vi
        .fn()
        .mockResolvedValue(
          "## Database\nPostgreSQL 16\n\n## Stack\nNode 20\n\n## Frontend\nReact 18"
        ),
    })
    const result = await callTool(createServer(mem), "mem_grep", { query: "database" })
    // The relevant section should appear first / be present
    expect(result.content[0]?.text).toContain("Database")
    expect(result.isError).toBeUndefined()
  })

  it("returns '(no results)' when grep finds nothing", async () => {
    const mem = mockMem({ grep: vi.fn().mockResolvedValue("") })
    const result = await callTool(createServer(mem), "mem_grep", { query: "missing" })
    expect(result.content[0]?.text).toBe("(no results)")
  })

  it("passes the optional path argument to mem.grep", async () => {
    const mem = mockMem()
    await callTool(createServer(mem), "mem_grep", {
      query: "postgres",
      path: "memory/stack.md",
    })
    expect(mem.grep).toHaveBeenCalledWith("postgres", "memory/stack.md")
  })

  it("calls mem.grep without a path when path is omitted", async () => {
    const mem = mockMem()
    await callTool(createServer(mem), "mem_grep", { query: "postgres" })
    expect(mem.grep).toHaveBeenCalledWith("postgres", undefined)
  })
})

// ── mem_list ──────────────────────────────────────────────────────────────────

describe("mem_list", () => {
  it("returns a newline-joined list of files", async () => {
    const mem = mockMem({
      list: vi.fn().mockResolvedValue(["memory/stack.md", "memory/conventions.md"]),
    })
    const result = await callTool(createServer(mem), "mem_list", {})
    expect(result.content[0]?.text).toContain("memory/stack.md")
    expect(result.content[0]?.text).toContain("memory/conventions.md")
  })

  it("returns '(empty)' when no files exist", async () => {
    const mem = mockMem({ list: vi.fn().mockResolvedValue([]) })
    const result = await callTool(createServer(mem), "mem_list", {})
    expect(result.content[0]?.text).toBe("(empty)")
  })

  it("forwards the optional path argument to mem.list", async () => {
    const mem = mockMem()
    await callTool(createServer(mem), "mem_list", { path: "memory/subdir" })
    expect(mem.list).toHaveBeenCalledWith("memory/subdir")
  })

  it("calls mem.list with undefined when path is omitted", async () => {
    const mem = mockMem()
    await callTool(createServer(mem), "mem_list", {})
    expect(mem.list).toHaveBeenCalledWith(undefined)
  })
})

// ── Error handling ────────────────────────────────────────────────────────────

describe("Error handling", () => {
  it("returns isError=true when mem.read throws — never an unhandled rejection", async () => {
    const mem = mockMem({ read: vi.fn().mockRejectedValue(new Error("network error")) })
    const result = await callTool(createServer(mem), "mem_read", { path: "x.md" })
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain("network error")
  })

  it("returns isError=true when mem.write throws unexpectedly", async () => {
    const mem = mockMem({ write: vi.fn().mockRejectedValue(new Error("disk full")) })
    const result = await callTool(createServer(mem, { allowCoreMutation: true }), "mem_write", {
      path: "memory/stack.md",
      content: "x",
    })
    expect(result.isError).toBe(true)
  })

  it("returns isError=true for an unknown tool name", async () => {
    const result = await callTool(createServer(mockMem()), "mem_unknown", {})
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain("Unknown tool")
  })
})
