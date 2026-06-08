import { createBash } from "@supermemory/bash"
import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { assertWritable, scanPii } from "./guard.js"
import { writeCache, readCache, appendCache } from "./cache.js"
import { appendAuditLog, type AuditStatus } from "./audit.js"

export type { AuditAction, AuditStatus, AuditEntry } from "./audit.js"
export {
  isProtected,
  assertWritable,
  ProtectedFileError,
  PROTECTED_PATHS,
  scanPii,
  type PiiScanResult,
} from "./guard.js"
export {
  chunkMarkdown,
  formatChunkResult,
  estimateTokens,
  type Chunk,
  type ChunkResult,
} from "./chunker.js"
export { writeCache, readCache, appendCache } from "./cache.js"
export { appendAuditLog, setAuditLogPath } from "./audit.js"

// ── Public types ──────────────────────────────────────────────────────────────

export interface MemConfig {
  apiKey: string
  container: string
}

export interface MemOptions {
  /** Allow writes to PROTECTED_PATHS. Defaults to EDGEMEM_ALLOW_CORE_MUTATION env var. */
  allowCoreMutation?: boolean
  /** Stable identifier stamped on every write. Auto-generated if omitted. */
  sessionId?: string
}

export interface MemClient {
  read(filePath: string): Promise<string>
  write(filePath: string, content: string): Promise<void>
  append(filePath: string, content: string): Promise<void>
  grep(query: string, filePath?: string): Promise<string>
  list(filePath?: string): Promise<string[]>
  export(outputDir: string): Promise<void>
}

// ── Internal helpers ──────────────────────────────────────────────────────────

type BashInstance = Awaited<ReturnType<typeof createBash>>

/** Returns the raw output string, or `null` on any failure (API unreachable, etc.). */
async function tryBash(instance: BashInstance, cmd: string): Promise<string | null> {
  try {
    const result = await instance.bash.exec(cmd)
    return typeof result === "string"
      ? result
      : ((result as { stdout?: string }).stdout ?? "")
  } catch {
    return null
  }
}

function warn(msg: string): void {
  process.stderr.write(`[edgemem] ${msg}\n`)
}

function auditStatus(ok: boolean, hadPii: boolean): AuditStatus {
  if (!ok) return "error"
  if (hadPii) return "pii-redacted"
  return "ok"
}

// ── Factory ───────────────────────────────────────────────────────────────────

export async function createMem(
  config: MemConfig,
  options: MemOptions = {}
): Promise<MemClient> {
  const instance = await createBash({
    apiKey: config.apiKey,
    containerTag: config.container,
  })

  const sessionId = options.sessionId ?? randomUUID().slice(0, 8)
  const allowCoreMutation =
    options.allowCoreMutation ??
    process.env["EDGEMEM_ALLOW_CORE_MUTATION"] === "true"

  const stamp = (): string =>
    `\n<!-- edgemem: ${new Date().toISOString()} | session: ${sessionId} -->`

  const mem: MemClient = {
    // ── read ────────────────────────────────────────────────────────────────
    async read(filePath: string): Promise<string> {
      const result = await tryBash(instance, `cat ${shellEscape(filePath)}`)

      if (result !== null) {
        await writeCache(config.container, filePath, result)
        await appendAuditLog({
          timestamp: new Date().toISOString(),
          action: "read",
          file_path: filePath,
          status: "ok",
        })
        return result
      }

      // API unreachable — serve from cache
      const cached = await readCache(config.container, filePath)
      if (cached !== undefined) {
        warn(`offline — serving '${filePath}' from local cache`)
        await appendAuditLog({
          timestamp: new Date().toISOString(),
          action: "read",
          file_path: filePath,
          status: "cache-hit",
        })
        return cached
      }

      warn(`offline — '${filePath}' not in cache, returning empty`)
      await appendAuditLog({
        timestamp: new Date().toISOString(),
        action: "read",
        file_path: filePath,
        status: "error",
        detail: "api unreachable, no cache",
      })
      return ""
    },

    // ── write ────────────────────────────────────────────────────────────────
    async write(filePath: string, content: string): Promise<void> {
      assertWritable(filePath, allowCoreMutation)

      const { clean, redacted } = scanPii(content)
      const hadPii = redacted.length > 0
      if (hadPii) warn(`PII redacted in '${filePath}': ${[...new Set(redacted)].join(", ")}`)

      const stamped = clean + stamp()

      const dir = path.dirname(filePath)
      if (dir !== ".") await tryBash(instance, `mkdir -p ${shellEscape(dir)}`)

      const ok =
        (await tryBash(
          instance,
          `cat > ${shellEscape(filePath)} << 'EDGEMEM_EOF'\n${stamped}\nEDGEMEM_EOF`
        )) !== null

      await writeCache(config.container, filePath, stamped)

      if (!ok) warn(`write to '${filePath}' failed (API unreachable) — cached locally`)

      await appendAuditLog({
        timestamp: new Date().toISOString(),
        action: "write",
        file_path: filePath,
        status: auditStatus(ok, hadPii),
        ...(hadPii ? { detail: `redacted: ${[...new Set(redacted)].join(", ")}` } : {}),
      })
    },

    // ── append ───────────────────────────────────────────────────────────────
    async append(filePath: string, content: string): Promise<void> {
      assertWritable(filePath, allowCoreMutation)

      const { clean, redacted } = scanPii(content)
      const hadPii = redacted.length > 0
      if (hadPii) warn(`PII redacted in '${filePath}': ${[...new Set(redacted)].join(", ")}`)

      const stamped = clean + stamp()

      const dir = path.dirname(filePath)
      if (dir !== ".") await tryBash(instance, `mkdir -p ${shellEscape(dir)}`)

      const ok =
        (await tryBash(
          instance,
          `cat >> ${shellEscape(filePath)} << 'EDGEMEM_EOF'\n${stamped}\nEDGEMEM_EOF`
        )) !== null

      await appendCache(config.container, filePath, stamped)

      if (!ok) warn(`append to '${filePath}' failed (API unreachable) — cached locally`)

      await appendAuditLog({
        timestamp: new Date().toISOString(),
        action: "append",
        file_path: filePath,
        status: auditStatus(ok, hadPii),
        ...(hadPii ? { detail: `redacted: ${[...new Set(redacted)].join(", ")}` } : {}),
      })
    },

    // ── grep ─────────────────────────────────────────────────────────────────
    async grep(query: string, filePath?: string): Promise<string> {
      const target = filePath ? shellEscape(filePath) : "/"
      const result = await tryBash(instance, `sgrep ${shellEscape(query)} ${target}`)

      const ok = result !== null
      await appendAuditLog({
        timestamp: new Date().toISOString(),
        action: "grep",
        file_path: filePath ?? "/",
        status: ok ? "ok" : "error",
        ...(!ok ? { detail: "api unreachable" } : {}),
      })

      if (!ok) {
        warn("offline — grep unavailable")
        return ""
      }

      return result
    },

    // ── list ─────────────────────────────────────────────────────────────────
    async list(filePath?: string): Promise<string[]> {
      const target = filePath ? shellEscape(filePath) : "/"
      const result = await tryBash(instance, `ls -la ${target}`)

      await appendAuditLog({
        timestamp: new Date().toISOString(),
        action: "list",
        file_path: filePath ?? "/",
        status: result !== null ? "ok" : "error",
      })

      if (result === null || !result.trim()) return []
      return result
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    },

    // ── export ───────────────────────────────────────────────────────────────
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

      await appendAuditLog({
        timestamp: new Date().toISOString(),
        action: "export",
        file_path: outputDir,
        status: "ok",
      })
    },
  }

  return mem
}

export function shellEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`
}
