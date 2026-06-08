import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { writeCache, readCache, appendCache } from "./cache.js"

const CONTAINER = "edgemem-cache-test"

async function cleanCache(): Promise<void> {
  const dir = path.join(os.homedir(), ".edgemem", "cache", CONTAINER)
  await fs.rm(dir, { recursive: true, force: true })
}

describe("readCache", () => {
  afterEach(cleanCache)

  it("returns undefined when no cache entry exists", async () => {
    expect(await readCache(CONTAINER, "memory/nonexistent.md")).toBeUndefined()
  })

  it("returns the exact string written by writeCache", async () => {
    await writeCache(CONTAINER, "memory/stack.md", "Node 20")
    expect(await readCache(CONTAINER, "memory/stack.md")).toBe("Node 20")
  })

  it("returns an empty string if an empty string was cached", async () => {
    await writeCache(CONTAINER, "memory/empty.md", "")
    expect(await readCache(CONTAINER, "memory/empty.md")).toBe("")
  })

  it("treats a path with and without a leading slash as the same key", async () => {
    await writeCache(CONTAINER, "/memory/stack.md", "with slash")
    expect(await readCache(CONTAINER, "memory/stack.md")).toBe("with slash")
  })

  it("never throws on unreadable cache", async () => {
    await expect(readCache("__nonexistent__", "x/y.md")).resolves.toBeUndefined()
  })
})

describe("writeCache", () => {
  afterEach(cleanCache)

  it("creates the cache directory structure on first write", async () => {
    await writeCache(CONTAINER, "memory/deep/file.md", "deep content")
    expect(await readCache(CONTAINER, "memory/deep/file.md")).toBe("deep content")
  })

  it("overwrites existing content on a second write", async () => {
    await writeCache(CONTAINER, "memory/stack.md", "old")
    await writeCache(CONTAINER, "memory/stack.md", "new")
    expect(await readCache(CONTAINER, "memory/stack.md")).toBe("new")
  })

  it("handles unicode content correctly", async () => {
    const content = "สวัสดี 🌏 edgemem"
    await writeCache(CONTAINER, "memory/unicode.md", content)
    expect(await readCache(CONTAINER, "memory/unicode.md")).toBe(content)
  })

  it("handles multiline markdown content", async () => {
    const content = "# Stack\n\nNode 20\nPostgreSQL 16\n\n# Conventions\nNo any type"
    await writeCache(CONTAINER, "memory/multi.md", content)
    expect(await readCache(CONTAINER, "memory/multi.md")).toBe(content)
  })

  it("never throws even on an invalid path", async () => {
    await expect(writeCache(CONTAINER, "", "x")).resolves.toBeUndefined()
  })
})

describe("appendCache", () => {
  afterEach(cleanCache)

  it("creates the file if it does not exist", async () => {
    await appendCache(CONTAINER, "memory/new.md", "first line")
    expect(await readCache(CONTAINER, "memory/new.md")).toBe("first line")
  })

  it("appends to existing content with a newline separator", async () => {
    await writeCache(CONTAINER, "memory/conventions.md", "line one")
    await appendCache(CONTAINER, "memory/conventions.md", "line two")
    const result = await readCache(CONTAINER, "memory/conventions.md")
    expect(result).toContain("line one")
    expect(result).toContain("line two")
    // the two lines must be on separate lines
    expect(result?.split("\n").length).toBeGreaterThanOrEqual(2)
  })

  it("accumulates multiple appends correctly", async () => {
    await appendCache(CONTAINER, "memory/log.md", "a")
    await appendCache(CONTAINER, "memory/log.md", "b")
    await appendCache(CONTAINER, "memory/log.md", "c")
    const result = await readCache(CONTAINER, "memory/log.md")
    expect(result).toContain("a")
    expect(result).toContain("b")
    expect(result).toContain("c")
  })
})
