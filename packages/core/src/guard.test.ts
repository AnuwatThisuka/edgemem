import { describe, it, expect, afterEach, vi } from "vitest"
import {
  isProtected,
  assertWritable,
  ProtectedFileError,
  PROTECTED_PATHS,
  scanPii,
} from "./guard.js"

describe("isProtected", () => {
  it("returns true for exact protected paths", () => {
    for (const p of PROTECTED_PATHS) {
      expect(isProtected(p)).toBe(true)
    }
  })

  it("strips leading slash before checking", () => {
    expect(isProtected("/memory/stack.md")).toBe(true)
    expect(isProtected("//memory/conventions.md")).toBe(true)
  })

  it("returns false for non-protected paths", () => {
    expect(isProtected("memory/auto-saved.md")).toBe(false)
    expect(isProtected("memory/custom.md")).toBe(false)
    expect(isProtected("random/file.md")).toBe(false)
  })
})

describe("assertWritable", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("throws ProtectedFileError for protected paths", () => {
    expect(() => assertWritable("memory/stack.md", false)).toThrow(ProtectedFileError)
  })

  it("does not throw when allowOverride=true", () => {
    expect(() => assertWritable("memory/stack.md", true)).not.toThrow()
  })

  it("does not throw for non-protected paths regardless of flag", () => {
    expect(() => assertWritable("memory/custom.md", false)).not.toThrow()
    expect(() => assertWritable("memory/custom.md", true)).not.toThrow()
  })

  it("ProtectedFileError carries the file path", () => {
    try {
      assertWritable("memory/decisions.md", false)
    } catch (err) {
      expect(err).toBeInstanceOf(ProtectedFileError)
      expect((err as ProtectedFileError).filePath).toBe("memory/decisions.md")
    }
  })
})

describe("scanPii", () => {
  it("returns clean content unchanged when no PII found", () => {
    const { clean, redacted } = scanPii("Use Drizzle ORM for all database access.")
    expect(clean).toBe("Use Drizzle ORM for all database access.")
    expect(redacted).toHaveLength(0)
  })

  it("redacts Stripe live keys", () => {
    // Build the string dynamically so static scanners don't flag this test file
    const stripeKey = ["sk", "live", "a".repeat(24)].join("_")
    const { clean, redacted } = scanPii(`key: ${stripeKey}`)
    expect(clean).not.toContain("sk_live_")
    expect(clean).toContain("[REDACTED:stripe-live-key]")
    expect(redacted).toContain("stripe-live-key")
  })

  it("redacts Google API keys", () => {
    // Prefix + 33-char suffix is the pattern
    const googleKey = "AIzaSy" + "A".repeat(33)
    const { clean, redacted } = scanPii(googleKey)
    expect(clean).toContain("[REDACTED:google-api-key]")
    expect(redacted).toContain("google-api-key")
  })

  it("redacts AWS access keys", () => {
    const awsKey = "AKIA" + "I".repeat(16)
    const { clean, redacted } = scanPii(awsKey)
    expect(clean).toContain("[REDACTED:aws-access-key]")
    expect(redacted).toContain("aws-access-key")
  })

  it("redacts password literals", () => {
    const { clean, redacted } = scanPii("password: mysecretpassword123")
    expect(clean).toContain("[REDACTED:password-literal]")
    expect(redacted).toContain("password-literal")
  })

  it("redacts multiple PII types in one string", () => {
    const stripeKey = ["sk", "live", "b".repeat(24)].join("_")
    const { clean, redacted } = scanPii(`API: ${stripeKey}\npassword: hunter2`)
    expect(redacted.length).toBeGreaterThanOrEqual(2)
    expect(clean).not.toContain("sk_live_")
    expect(clean).not.toContain("hunter2")
  })
})
