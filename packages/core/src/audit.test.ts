import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { appendAuditLog, setAuditLogPath, type AuditEntry } from "./audit.js"

describe("appendAuditLog", () => {
  let tmpDir: string
  let logPath: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "edgemem-audit-"))
    logPath = path.join(tmpDir, "edgemem.log")
    setAuditLogPath(logPath)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
    // reset to default (undefined)
    setAuditLogPath("")
  })

  it("writes a valid JSON line to the log file", async () => {
    const entry: AuditEntry = {
      timestamp: "2026-06-08T00:00:00.000Z",
      action: "read",
      file_path: "memory/stack.md",
      status: "ok",
    }
    await appendAuditLog(entry)

    const raw = await fs.readFile(logPath, "utf-8")
    const parsed = JSON.parse(raw.trim()) as AuditEntry
    expect(parsed.action).toBe("read")
    expect(parsed.file_path).toBe("memory/stack.md")
    expect(parsed.status).toBe("ok")
  })

  it("appends multiple entries as separate lines", async () => {
    await appendAuditLog({ timestamp: "t", action: "read", file_path: "a.md", status: "ok" })
    await appendAuditLog({ timestamp: "t", action: "write", file_path: "b.md", status: "ok" })

    const raw = await fs.readFile(logPath, "utf-8")
    const lines = raw.trim().split("\n").filter(Boolean)
    expect(lines).toHaveLength(2)
  })

  it("never throws even when log path is not writable", async () => {
    setAuditLogPath("/proc/no-permission/edgemem.log")
    await expect(
      appendAuditLog({ timestamp: "t", action: "grep", file_path: "/", status: "error" })
    ).resolves.toBeUndefined()
  })

  it("includes optional detail field when provided", async () => {
    await appendAuditLog({
      timestamp: "t",
      action: "write",
      file_path: "x.md",
      status: "pii-redacted",
      detail: "redacted: stripe-live-key",
    })
    const raw = await fs.readFile(logPath, "utf-8")
    const parsed = JSON.parse(raw.trim()) as AuditEntry
    expect(parsed.detail).toContain("stripe-live-key")
  })
})
