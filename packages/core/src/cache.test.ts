import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { writeCache, readCache, appendCache } from "./cache.js"

const CONTAINER = "edgemem-test-container"

async function cleanCache(): Promise<void> {
  const dir = path.join(os.homedir(), ".edgemem", "cache", CONTAINER)
  await fs.rm(dir, { recursive: true, force: true })
}

describe("cache", () => {
  afterEach(cleanCache)

  it("writeCache + readCache round-trips content", async () => {
    await writeCache(CONTAINER, "memory/stack.md", "Node 20")
    const result = await readCache(CONTAINER, "memory/stack.md")
    expect(result).toBe("Node 20")
  })

  it("readCache returns undefined when no entry exists", async () => {
    const result = await readCache(CONTAINER, "memory/nonexistent.md")
    expect(result).toBeUndefined()
  })

  it("writeCache overwrites existing content", async () => {
    await writeCache(CONTAINER, "memory/stack.md", "old")
    await writeCache(CONTAINER, "memory/stack.md", "new")
    const result = await readCache(CONTAINER, "memory/stack.md")
    expect(result).toBe("new")
  })

  it("appendCache concatenates to existing content", async () => {
    await writeCache(CONTAINER, "memory/conventions.md", "line one")
    await appendCache(CONTAINER, "memory/conventions.md", "line two")
    const result = await readCache(CONTAINER, "memory/conventions.md")
    expect(result).toContain("line one")
    expect(result).toContain("line two")
  })

  it("appendCache creates the file if it does not exist", async () => {
    await appendCache(CONTAINER, "memory/new.md", "first entry")
    const result = await readCache(CONTAINER, "memory/new.md")
    expect(result).toBe("first entry")
  })

  it("normalises leading slashes in path", async () => {
    await writeCache(CONTAINER, "/memory/stack.md", "with slash")
    const result = await readCache(CONTAINER, "memory/stack.md")
    expect(result).toBe("with slash")
  })
})
