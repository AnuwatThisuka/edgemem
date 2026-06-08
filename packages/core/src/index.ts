import { createBash } from "@supermemory/bash"
import fs from "node:fs/promises"
import path from "node:path"

export interface MemConfig {
  apiKey: string
  container: string
}

export interface MemClient {
  read(filePath: string): Promise<string>
  write(filePath: string, content: string): Promise<void>
  append(filePath: string, content: string): Promise<void>
  grep(query: string, filePath?: string): Promise<string>
  list(filePath?: string): Promise<string[]>
  export(outputDir: string): Promise<void>
}

type BashInstance = Awaited<ReturnType<typeof createBash>>

async function safeBash(
  instance: BashInstance,
  cmd: string,
  fallback: string = ""
): Promise<string> {
  try {
    const result = await instance.bash.exec(cmd)
    return typeof result === "string" ? result : (result as { stdout?: string }).stdout ?? fallback
  } catch {
    return fallback
  }
}

export async function createMem(config: MemConfig): Promise<MemClient> {
  const instance = await createBash({
    apiKey: config.apiKey,
    containerTag: config.container,
  })

  const mem: MemClient = {
    async read(filePath: string): Promise<string> {
      return safeBash(instance, `cat ${shellEscape(filePath)}`)
    },

    async write(filePath: string, content: string): Promise<void> {
      const dir = path.dirname(filePath)
      if (dir !== ".") {
        await safeBash(instance, `mkdir -p ${shellEscape(dir)}`)
      }
      await safeBash(
        instance,
        `cat > ${shellEscape(filePath)} << 'EDGEMEM_EOF'\n${content}\nEDGEMEM_EOF`
      )
    },

    async append(filePath: string, content: string): Promise<void> {
      const dir = path.dirname(filePath)
      if (dir !== ".") {
        await safeBash(instance, `mkdir -p ${shellEscape(dir)}`)
      }
      await safeBash(
        instance,
        `cat >> ${shellEscape(filePath)} << 'EDGEMEM_EOF'\n${content}\nEDGEMEM_EOF`
      )
    },

    async grep(query: string, filePath?: string): Promise<string> {
      const target = filePath ? shellEscape(filePath) : "/"
      return safeBash(instance, `sgrep ${shellEscape(query)} ${target}`)
    },

    async list(filePath?: string): Promise<string[]> {
      const target = filePath ? shellEscape(filePath) : "/"
      const output = await safeBash(instance, `ls -la ${target}`)
      if (!output.trim()) return []
      return output
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    },

    async export(outputDir: string): Promise<void> {
      const files = await mem.list("/memory")
      await fs.mkdir(outputDir, { recursive: true })

      for (const entry of files) {
        const parts = entry.split(/\s+/)
        const name = parts[parts.length - 1]
        if (!name || name === "." || name === "..") continue

        const remotePath = `/memory/${name}`
        const content = await mem.read(remotePath)
        if (!content) continue

        const localPath = path.join(outputDir, name)
        await fs.mkdir(path.dirname(localPath), { recursive: true })
        await fs.writeFile(localPath, content, "utf-8")
      }
    },
  }

  return mem
}

function shellEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`
}

export { shellEscape }
