#!/usr/bin/env node
import { createMem, type MemConfig } from "@edgemem/core"
import { resolveConfig } from "@edgemem/core/config"
import { startServer } from "./server.js"

async function main(): Promise<void> {
  const config = await resolveConfig()
  const mem = await createMem(config)
  await startServer(mem)
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`edgemem-mcp error: ${msg}\n`)
  process.exit(1)
})
