#!/usr/bin/env node
import { createMem } from "@edgemem/core"
import { resolveConfig } from "@edgemem/core/config"
import { startServer } from "./server.js"

async function main(): Promise<void> {
  const config = await resolveConfig()
  const allowCoreMutation = process.env["EDGEMEM_ALLOW_CORE_MUTATION"] === "true"

  const mem = await createMem(config, { allowCoreMutation })
  await startServer(mem, { allowCoreMutation })
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`edgemem-mcp error: ${msg}\n`)
  process.exit(1)
})
