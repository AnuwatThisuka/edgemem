import { describe, it, expect } from "vitest"
import { chunkMarkdown, formatChunkResult, estimateTokens } from "./chunker.js"

// ── estimateTokens ────────────────────────────────────────────────────────────

describe("estimateTokens", () => {
  it("returns ceil(length / 4)", () => {
    expect(estimateTokens("")).toBe(0)
    expect(estimateTokens("abcd")).toBe(1)
    expect(estimateTokens("abcde")).toBe(2)
    expect(estimateTokens("a".repeat(100))).toBe(25)
    expect(estimateTokens("a".repeat(101))).toBe(26)
  })
})

// ── chunkMarkdown — empty / trivial input ─────────────────────────────────────

describe("chunkMarkdown — empty input", () => {
  it("returns empty result for an empty string", () => {
    const r = chunkMarkdown("", "query")
    expect(r.chunks).toHaveLength(0)
    expect(r.tokenEstimate).toBe(0)
    expect(r.truncated).toBe(false)
    expect(r.totalChunks).toBe(0)
  })

  it("returns empty result for whitespace-only input", () => {
    const r = chunkMarkdown("   \n\n   ", "query")
    expect(r.chunks).toHaveLength(0)
  })
})

// ── chunkMarkdown — heading-based splitting ────────────────────────────────────

describe("chunkMarkdown — heading splitting", () => {
  const FIXTURE = `
# Database
We use PostgreSQL 16 with Drizzle ORM.

## Connection
Use connection pooling via PgBouncer.

# Frontend
React 18 with the App Router.

# Testing
Vitest for unit tests. Playwright for E2E.
`.trim()

  it("splits document into sections by heading", () => {
    const r = chunkMarkdown(FIXTURE, "anything")
    expect(r.totalChunks).toBeGreaterThan(1)
  })

  it("promotes the best-matching section to rank 0", () => {
    const r = chunkMarkdown(FIXTURE, "database")
    expect(r.chunks[0]?.heading).toBe("Database")
  })

  it("ranks heading matches higher than body-only matches", () => {
    const md = `
# Database Conventions
PostgreSQL only.

# Frontend
Database is sometimes referenced here too.
`.trim()
    const r = chunkMarkdown(md, "database")
    expect(r.chunks[0]?.heading).toContain("Database Conventions")
  })

  it("supports h2 and h3 headings", () => {
    const md = "## Stack\nNode 20\n\n### Runtime\nv20 LTS"
    const r = chunkMarkdown(md, "node")
    expect(r.chunks.length).toBeGreaterThan(0)
  })

  it("includes zero-score sections when token budget allows", () => {
    const short = "# Relevant\nMatch here.\n\n# Unrelated\nNothing useful."
    const r = chunkMarkdown(short, "match")
    // Both sections should fit under the 4k budget
    expect(r.chunks.length).toBe(2)
    expect(r.truncated).toBe(false)
  })
})

// ── chunkMarkdown — paragraph fallback ────────────────────────────────────────

describe("chunkMarkdown — paragraph fallback", () => {
  it("splits by blank lines when no headings are present", () => {
    const flat = "Use PostgreSQL.\n\nNever use MySQL.\n\nAlways use transactions."
    const r = chunkMarkdown(flat, "PostgreSQL")
    expect(r.chunks.length).toBeGreaterThan(0)
  })

  it("ranks the paragraph containing the query term first", () => {
    const flat = "Never use MySQL.\n\nUse PostgreSQL 16.\n\nAlways use transactions."
    const r = chunkMarkdown(flat, "PostgreSQL")
    expect(r.chunks[0]?.content).toContain("PostgreSQL")
  })
})

// ── chunkMarkdown — token budget ──────────────────────────────────────────────

describe("chunkMarkdown — token budget", () => {
  it("never exceeds MAX_TOKENS (4000)", () => {
    const big = Array.from(
      { length: 30 },
      (_, i) => `## Section ${i}\n${"word ".repeat(600)}`
    ).join("\n")
    const r = chunkMarkdown(big, "word")
    expect(r.tokenEstimate).toBeLessThanOrEqual(4000)
  })

  it("sets truncated=true when sections are dropped for budget", () => {
    const big = Array.from(
      { length: 30 },
      (_, i) => `## Section ${i}\n${"x ".repeat(600)}`
    ).join("\n")
    const r = chunkMarkdown(big, "section")
    expect(r.truncated).toBe(true)
  })

  it("totalChunks equals the full section count before budget trim", () => {
    const sections = 5
    const md = Array.from(
      { length: sections },
      (_, i) => `## Section ${i}\nShort content.`
    ).join("\n\n")
    const r = chunkMarkdown(md, "section")
    expect(r.totalChunks).toBe(sections)
  })

  it("truncated=false when all sections fit within budget", () => {
    const small = "## Stack\nNode 20\n\n## DB\nPostgreSQL"
    const r = chunkMarkdown(small, "node")
    expect(r.truncated).toBe(false)
    expect(r.chunks.length).toBe(r.totalChunks)
  })
})

// ── formatChunkResult ─────────────────────────────────────────────────────────

describe("formatChunkResult", () => {
  it("returns '(no results)' for an empty ChunkResult", () => {
    const r = chunkMarkdown("", "query")
    expect(formatChunkResult(r, "query")).toBe("(no results)")
  })

  it("includes a truncation warning when sections were dropped", () => {
    const big = Array.from(
      { length: 30 },
      (_, i) => `## Section ${i}\n${"x ".repeat(600)}`
    ).join("\n")
    const r = chunkMarkdown(big, "section")
    const text = formatChunkResult(r, "section")
    expect(text).toContain("[edgemem]")
    expect(text).toContain("omitted")
  })

  it("does not include a warning when nothing was truncated", () => {
    const md = "## Stack\nNode 20"
    const r = chunkMarkdown(md, "stack")
    const text = formatChunkResult(r, "stack")
    expect(text).not.toContain("[edgemem]")
  })

  it("renders heading lines prefixed with ##", () => {
    const md = "# Stack\nNode 20\n\n# Conventions\nNo any types"
    const r = chunkMarkdown(md, "stack")
    const text = formatChunkResult(r, "stack")
    expect(text).toContain("## Stack")
  })

  it("includes the chunk body text in output", () => {
    const md = "## DB\nUse PostgreSQL 16 with Drizzle."
    const r = chunkMarkdown(md, "postgres")
    const text = formatChunkResult(r, "postgres")
    expect(text).toContain("PostgreSQL 16")
  })

  it("adds a token-count note for large (non-truncated) results", () => {
    // A single section with ~2000+ tokens but still within MAX
    const content = "## Big\n" + "word ".repeat(2500)
    const r = chunkMarkdown(content, "word")
    if (!r.truncated && r.tokenEstimate > 2000) {
      const text = formatChunkResult(r, "word")
      expect(text).toContain("tokens")
    }
  })
})
