import fs from "node:fs/promises"
import path from "node:path"
import { createMem, type MemConfig } from "@edgemem/core"

interface SyncOptions {
  config: MemConfig
  outputDir: string
}

export async function sync(opts: SyncOptions): Promise<void> {
  const { config, outputDir } = opts
  const mem = await createMem(config)

  console.log(`Syncing from container: ${config.container}`)

  await fs.mkdir(outputDir, { recursive: true })

  const files = await mem.list("/memory")
  if (!files.length) {
    console.log("No files found in /memory — nothing to sync.")
    return
  }

  let synced = 0
  const errors: string[] = []

  for (const entry of files) {
    const parts = entry.split(/\s+/)
    const name = parts[parts.length - 1]
    if (!name || name === "." || name === "..") continue

    const remotePath = `/memory/${name}`
    try {
      const content = await mem.read(remotePath)
      if (!content) continue

      const localPath = path.join(outputDir, name)
      await fs.mkdir(path.dirname(localPath), { recursive: true })
      await fs.writeFile(localPath, content, "utf-8")
      synced++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`  ${remotePath}: ${msg}`)
    }
  }

  console.log(`Synced ${synced} file(s) to ${outputDir}`)
  if (errors.length) {
    console.warn(`Warnings (${errors.length} file(s) skipped):`)
    errors.forEach((e) => console.warn(e))
  }
}
