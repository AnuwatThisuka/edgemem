import fs from "node:fs/promises"
import path from "node:path"

export type AuditAction = "read" | "write" | "append" | "grep" | "list" | "export"
export type AuditStatus = "ok" | "error" | "cache-hit" | "protected" | "pii-redacted"

export interface AuditEntry {
  timestamp: string
  action: AuditAction
  file_path: string
  status: AuditStatus
  detail?: string
}

let _logPath: string | undefined

export function setAuditLogPath(p: string): void {
  _logPath = p
}

function resolveLogPath(): string {
  return _logPath ?? path.join(process.cwd(), ".claude", "memory", "edgemem.log")
}

export async function appendAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const logPath = resolveLogPath()
    await fs.mkdir(path.dirname(logPath), { recursive: true })
    await fs.appendFile(logPath, JSON.stringify(entry) + "\n", "utf-8")
  } catch {
    // audit failure must never crash anything
  }
}
