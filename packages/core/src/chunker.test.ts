import { describe, it, expect } from "vitest"
import { chunkMarkdown, formatChunkResult, estimateTokens } from "./chunker.js"

describe("estimateTokens", () => {
  it("estimates 1 token per 4 chars", () => {
    expect(estimateTokens("abcd")).toBe(1)
    expect(estimateTokens("a".repeat(100))).toBe(25)
  })
})

describe("chunkMarkdown", () => {
  it("returns empty result for empty input", () => {
    const r = chunkMarkdown("", "anything")
    expect(r.chunks).toHaveLength(0)
    expect(r.tokenEstimate).toBe(0)
    expect(r.truncated).toBe(false)
  })

  it("splits by headings and returns scored chunks", () => {
    const md = `
# Database
We use PostgreSQL 16.

# Frontend
React 18 with App Router.

# Testing
Vitest for unit tests.
`.trim()

    const r = chunkMarkdown(md, "database")
    expect(r.chunks.length).toBeGreaterThan(0)
    expect(r.chunks[0]?.heading).toBe("Database")
  })

  it("ranks heading matches above body matches", () => {
    const md = `
# Database Conventions
PostgreSQL only.

# Frontend
Database is sometimes mentioned here too.
`.trim()

    const r = chunkMarkdown(md, "database")
    // heading match scores 3x body match — "Database Conventions" should rank first
    expect(r.chunks[0]?.heading).toContain("Database")
  })

  it("falls back to paragraph splitting when no headings", () => {
    const flat = "Use PostgreSQL.\n\nNever use MySQL.\n\nAlways use transactions."
    const r = chunkMarkdown(flat, "PostgreSQL")
    expect(r.chunks.length).toBeGreaterThan(0)
    expect(r.chunks[0]?.content).toContain("PostgreSQL")
  })

  it("respects MAX_TOKENS budget", () => {
    // Generate content that exceeds 4000 tokens (~16000 chars)
    const bigSection = (n: number): string =>
      `## Section ${n}\n${"word ".repeat(1000)}`
    const md = Array.from({ length: 20 }, (_, i) => bigSection(i)).join("\n")

    const r = chunkMarkdown(md, "word")
    expect(r.tokenEstimate).toBeLessThanOrEqual(4000)
  })

  it("sets truncated=true when sections are dropped", () => {
    const big = Array.from(
      { length: 20 },
      (_, i) => `## Section ${i}\n${"x ".repeat(1000)}`
    ).join("\n")
    const r = chunkMarkdown(big, "section")
    expect(r.truncated).toBe(true)
    expect(r.totalChunks).toBeGreaterThan(r.chunks.length)
  })
})

describe("formatChunkResult", () => {
  it("returns (no results) for empty chunk result", () => {
    const r = chunkMarkdown("", "nothing")
    expect(formatChunkResult(r, "nothing")).toBe("(no results)")
  })

  it("includes truncation warning when truncated", () => {
    const big = Array.from(
      { length: 20 },
      (_, i) => `## Section ${i}\n${"x ".repeat(1000)}`
    ).join("\n")
    const r = chunkMarkdown(big, "section")
    const formatted = formatChunkResult(r, "section")
    expect(formatted).toContain("[edgemem]")
    expect(formatted).toContain("omitted")
  })

  it("renders headings in output", () => {
    const md = "## Stack\nNode 20\n\n## Conventions\nNo any types"
    const r = chunkMarkdown(md, "stack")
    const formatted = formatChunkResult(r, "stack")
    expect(formatted).toContain("## Stack")
  })
})
