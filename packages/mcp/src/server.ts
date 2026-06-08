import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { type MemClient } from "@edgemem/core"

export function createServer(mem: MemClient): Server {
  const server = new Server(
    { name: "edgemem", version: "0.1.0" },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "mem_read",
        description:
          "Read a file from team memory. Use for loading conventions, stack info, past decisions.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File path e.g. memory/conventions.md",
            },
          },
          required: ["path"],
        },
      },
      {
        name: "mem_write",
        description:
          "Write or overwrite a file in team memory. Use to save new conventions or decisions.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: {
              type: "string",
              description: "Full file content to write",
            },
          },
          required: ["path", "content"],
        },
      },
      {
        name: "mem_append",
        description:
          "Append content to an existing memory file. Use when a user shares a new convention mid-session.",
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
          "Semantic search across team memory. Returns relevant content for a query.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "What to search for e.g. 'database conventions'",
            },
            path: {
              type: "string",
              description: "Optional: scope search to a path",
            },
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

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const safeArgs = (args ?? {}) as Record<string, unknown>

    try {
      switch (name) {
        case "mem_read": {
          const filePath = String(safeArgs["path"] ?? "")
          const content = await mem.read(filePath)
          return { content: [{ type: "text", text: content || "(empty)" }] }
        }

        case "mem_write": {
          const filePath = String(safeArgs["path"] ?? "")
          const content = String(safeArgs["content"] ?? "")
          await mem.write(filePath, content)
          return {
            content: [{ type: "text", text: `Written to ${filePath}` }],
          }
        }

        case "mem_append": {
          const filePath = String(safeArgs["path"] ?? "")
          const content = String(safeArgs["content"] ?? "")
          await mem.append(filePath, content)
          return {
            content: [{ type: "text", text: `Appended to ${filePath}` }],
          }
        }

        case "mem_grep": {
          const query = String(safeArgs["query"] ?? "")
          const filePath = safeArgs["path"] ? String(safeArgs["path"]) : undefined
          const result = await mem.grep(query, filePath)
          return {
            content: [{ type: "text", text: result || "(no results)" }],
          }
        }

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

export async function startServer(mem: MemClient): Promise<void> {
  const server = createServer(mem)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
