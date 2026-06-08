import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import {
  type MemClient,
  isProtected,
  chunkMarkdown,
  formatChunkResult,
} from "@edgemem/core"

export interface ServerOptions {
  /** Mirror of EDGEMEM_ALLOW_CORE_MUTATION — allow writes to protected paths. */
  allowCoreMutation?: boolean
}

export function createServer(mem: MemClient, opts: ServerOptions = {}): Server {
  const allowCoreMutation =
    opts.allowCoreMutation ?? process.env["EDGEMEM_ALLOW_CORE_MUTATION"] === "true"

  const server = new Server(
    { name: "edgemem", version: "0.2.0" },
    { capabilities: { tools: {} } }
  )

  // ── Tool definitions ────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "mem_read",
        description:
          "Read a file from team memory. Use for loading conventions, stack info, past decisions.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path e.g. memory/conventions.md" },
          },
          required: ["path"],
        },
      },
      {
        name: "mem_write",
        description:
          "Write or overwrite a file in team memory. Protected core files require EDGEMEM_ALLOW_CORE_MUTATION=true.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string", description: "Full file content to write" },
          },
          required: ["path", "content"],
        },
      },
      {
        name: "mem_append",
        description:
          "Append content to an existing memory file. Protected core files require EDGEMEM_ALLOW_CORE_MUTATION=true.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
      },
      {
        name: "mem_grep",
        description:
          "Semantic search across team memory. Returns only the relevant sections — context-window safe.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "What to search for e.g. 'database conventions'" },
            path: { type: "string", description: "Optional: scope search to a path" },
          },
          required: ["query"],
        },
      },
      {
        name: "mem_list",
        description: "List all files in team memory or a specific path.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
          },
        },
      },
    ],
  }))

  // ── Tool handlers ───────────────────────────────────────────────────────────

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const safeArgs = (args ?? {}) as Record<string, unknown>

    try {
      switch (name) {
        // ── mem_read ──────────────────────────────────────────────────────
        case "mem_read": {
          const filePath = String(safeArgs["path"] ?? "")
          const content = await mem.read(filePath)
          return { content: [{ type: "text", text: content || "(empty)" }] }
        }

        // ── mem_write ─────────────────────────────────────────────────────
        case "mem_write": {
          const filePath = String(safeArgs["path"] ?? "")
          const content = String(safeArgs["content"] ?? "")

          if (isProtected(filePath) && !allowCoreMutation) {
            return protectedError(filePath)
          }

          await mem.write(filePath, content)
          return { content: [{ type: "text", text: `Written to ${filePath}` }] }
        }

        // ── mem_append ────────────────────────────────────────────────────
        case "mem_append": {
          const filePath = String(safeArgs["path"] ?? "")
          const content = String(safeArgs["content"] ?? "")

          if (isProtected(filePath) && !allowCoreMutation) {
            return protectedError(filePath)
          }

          await mem.append(filePath, content)
          return { content: [{ type: "text", text: `Appended to ${filePath}` }] }
        }

        // ── mem_grep ──────────────────────────────────────────────────────
        case "mem_grep": {
          const query = String(safeArgs["query"] ?? "")
          const filePath = safeArgs["path"] ? String(safeArgs["path"]) : undefined

          const raw = await mem.grep(query, filePath)
          const chunked = chunkMarkdown(raw, query)
          const text = formatChunkResult(chunked, query)

          return { content: [{ type: "text", text: text }] }
        }

        // ── mem_list ──────────────────────────────────────────────────────
        case "mem_list": {
          const filePath = safeArgs["path"] ? String(safeArgs["path"]) : undefined
          const files = await mem.list(filePath)
          return {
            content: [{ type: "text", text: files.join("\n") || "(empty)" }],
          }
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: "text", text: `Error: ${msg}` }],
        isError: true,
      }
    }
  })

  return server
}

export async function startServer(mem: MemClient, opts: ServerOptions = {}): Promise<void> {
  const server = createServer(mem, opts)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function protectedError(filePath: string): {
  content: { type: string; text: string }[]
  isError: boolean
} {
  return {
    content: [
      {
        type: "text",
        text:
          `Protected: '${filePath}' is a core memory file and cannot be modified by the agent. ` +
          `A human must set EDGEMEM_ALLOW_CORE_MUTATION=true to permit this change.`,
      },
    ],
    isError: true,
  }
}
