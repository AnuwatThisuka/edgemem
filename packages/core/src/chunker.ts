export interface Chunk {
  heading: string
  content: string
  score: number
}

export interface ChunkResult {
  chunks: Chunk[]
  tokenEstimate: number
  truncated: boolean
  totalChunks: number
}

const MAX_TOKENS = 4000
const TOKEN_WARNING_THRESHOLD = 2000

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function chunkMarkdown(raw: string, query: string): ChunkResult {
  if (!raw.trim()) {
    return { chunks: [], tokenEstimate: 0, truncated: false, totalChunks: 0 }
  }

  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1)

  const sections = splitIntoSections(raw)
  const scored = scoreChunks(sections, queryTerms)

  // relevant first, then the rest for context padding
  const relevant = scored.filter((c) => c.score > 0).sort((a, b) => b.score - a.score)
  const rest = scored.filter((c) => c.score === 0)
  const ordered = [...relevant, ...rest]

  const totalChunks = ordered.length
  const result: Chunk[] = []
  let tokens = 0

  for (const chunk of ordered) {
    const chunkText = chunk.heading
      ? `## ${chunk.heading}\n${chunk.content}`
      : chunk.content
    const chunkTokens = estimateTokens(chunkText)
    if (tokens + chunkTokens > MAX_TOKENS) break
    result.push(chunk)
    tokens += chunkTokens
  }

  return {
    chunks: result,
    tokenEstimate: tokens,
    truncated: result.length < totalChunks,
    totalChunks,
  }
}

export function formatChunkResult(result: ChunkResult, query: string): string {
  if (result.chunks.length === 0) return "(no results)"

  const lines: string[] = []

  if (result.truncated) {
    lines.push(
      `[edgemem] Showing ${result.chunks.length}/${result.totalChunks} sections` +
        ` (~${result.tokenEstimate} tokens). Remaining omitted to protect context window.`
    )
    lines.push("")
  }

  for (const chunk of result.chunks) {
    if (chunk.heading) lines.push(`## ${chunk.heading}`)
    if (chunk.content) lines.push(chunk.content)
    lines.push("")
  }

  if (result.tokenEstimate > TOKEN_WARNING_THRESHOLD && !result.truncated) {
    lines.push("---")
    lines.push(`_~${result.tokenEstimate} tokens for query "${query}"_`)
  }

  return lines.join("\n").trim()
}

// ── Internals ────────────────────────────────────────────────────────────────

function splitIntoSections(raw: string): Array<{ heading: string; content: string }> {
  const headingRe = /^#{1,6}\s/m

  if (headingRe.test(raw)) {
    return raw
      .split(/(?=^#{1,6}\s)/m)
      .filter(Boolean)
      .map((section) => {
        const lines = section.split("\n")
        const first = lines[0] ?? ""
        const heading = first.replace(/^#+\s*/, "").trim()
        const content = lines.slice(1).join("\n").trim()
        return { heading, content }
      })
  }

  // fallback: paragraph splitting
  return raw
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((paragraph) => ({ heading: "", content: paragraph.trim() }))
}

function scoreChunks(
  sections: Array<{ heading: string; content: string }>,
  queryTerms: string[]
): Chunk[] {
  return sections.map(({ heading, content }) => {
    const headingLower = heading.toLowerCase()
    const contentLower = content.toLowerCase()
    const score = queryTerms.reduce((acc, term) => {
      const headingHits = headingLower.includes(term) ? 3 : 0
      const bodyHits = (contentLower.match(new RegExp(term, "g")) ?? []).length
      return acc + headingHits + bodyHits
    }, 0)
    return { heading, content, score }
  })
}
