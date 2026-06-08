import { describe, it, expect, beforeEach, afterEach } from "vitest"
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
    setAuditLogPath("")
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // ── JSON correctness ──────────────────────────────────────────────────────

  it("writes a syntactically valid JSON line", async () => {
    await appendAuditLog({
      timestamp: "2026-06-08T00:00:00.000Z",
      action: "read",
      file_path: "memory/stack.md",
      status: "ok",
    })
    const raw = await fs.readFile(logPath, "utf-8")
    expect(() => JSON.parse(raw.trim())).not.toThrow()
  })

  it("round-trips every field correctly", async () => {
    const entry: AuditEntry = {
      timestamp: "2026-06-08T10:00:00.000Z",
      action: "write",
      file_path: "memory/conventions.md",
      status: "pii-redacted",
      detail: "redacted: stripe-live-key",
    }
    await appendAuditLog(entry)
    const raw = await fs.readFile(logPath, "utf-8")
    const parsed = JSON.parse(raw.trim()) as AuditEntry
    expect(parsed.timestamp).toBe(entry.timestamp)
    expect(parsed.action).toBe(entry.action)
    expect(parsed.file_path).toBe(entry.file_path)
    expect(parsed.status).toBe(entry.status)
    expect(parsed.detail).toBe(entry.detail)
  })

  it("omits the detail field when not provided", async () => {
    await appendAuditLog({ timestamp: "t", action: "list", file_path: "/", status: "ok" })
    const raw = await fs.readFile(logPath, "utf-8")
    const parsed = JSON.parse(raw.trim()) as AuditEntry
    expect(parsed.detail).toBeUndefined()
  })

  // ── Append behavior ────────────────────────────────────────────────────────

  it("appends entries as separate newline-terminated lines", async () => {
    await appendAuditLog({ timestamp: "t", action: "read", file_path: "a.md", status: "ok" })
    await appendAuditLog({ timestamp: "t", action: "write", file_path: "b.md", status: "ok" })
    await appendAuditLog({ timestamp: "t", action: "grep", file_path: "/", status: "ok" })

    const raw = await fs.readFile(logPath, "utf-8")
    const lines = raw.trim().split("\n").filter(Boolean)
    expect(lines).toHaveLength(3)
  })

  it("preserves insertion order across multiple entries", async () => {
    const actions = ["read", "write", "append", "grep", "list", "export"] as const
    for (const action of actions) {
      await appendAuditLog({ timestamp: "t", action, file_path: "x.md", status: "ok" })
    }
    const raw = await fs.readFile(logPath, "utf-8")
    const parsed = raw
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as AuditEntry)
    expect(parsed.map((e) => e.action)).toEqual(actions)
  })

  // ── All valid action + status combinations ────────────────────────────────

  it.each([
    ["read", "ok"],
    ["read", "cache-hit"],
    ["read", "error"],
    ["write", "ok"],
    ["write", "pii-redacted"],
    ["write", "error"],
    ["append", "ok"],
    ["append", "protected"],
    ["grep", "ok"],
    ["list", "ok"],
    ["export", "ok"],
  ] as const)("accepts action=%s status=%s", async (action, status) => {
    await expect(
      appendAuditLog({ timestamp: new Date().toISOString(), action, file_path: "/", status })
    ).resolves.toBeUndefined()
  })

  // ── Fail-silent guarantee ─────────────────────────────────────────────────

  it("never throws when the log directory is not writable", async () => {
    const lockedDir = path.join(tmpDir, "locked")
    await fs.mkdir(lockedDir)
    await fs.chmod(lockedDir, 0o000)
    setAuditLogPath(path.join(lockedDir, "edgemem.log"))
    try {
      await expect(
        appendAuditLog({ timestamp: "t", action: "read", file_path: "x.md", status: "error" })
      ).resolves.toBeUndefined()
    } finally {
      await fs.chmod(lockedDir, 0o755)
    }
  })

  it("creates intermediate log directories automatically", async () => {
    const deepLog = path.join(tmpDir, "nested", "deep", "edgemem.log")
    setAuditLogPath(deepLog)
    await appendAuditLog({ timestamp: "t", action: "read", file_path: "x.md", status: "ok" })
    const exists = await fs
      .access(deepLog)
      .then(() => true)
      .catch(() => false)
    expect(exists).toBe(true)
  })
})
