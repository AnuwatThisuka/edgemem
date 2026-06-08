import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

function getCacheDir(container: string): string {
  return path.join(os.homedir(), ".edgemem", "cache", container)
}

function toCacheName(filePath: string): string {
  return filePath.replace(/^\/+/, "").replace(/\//g, "__")
}

export async function writeCache(
  container: string,
  filePath: string,
  content: string
): Promise<void> {
  try {
    const cachePath = path.join(getCacheDir(container), toCacheName(filePath))
    await fs.mkdir(path.dirname(cachePath), { recursive: true })
    await fs.writeFile(cachePath, content, "utf-8")
  } catch {
    // non-fatal — cache write failure must never propagate
  }
}

export async function readCache(
  container: string,
  filePath: string
): Promise<string | undefined> {
  try {
    const cachePath = path.join(getCacheDir(container), toCacheName(filePath))
    return await fs.readFile(cachePath, "utf-8")
  } catch {
    return undefined
  }
}

export async function appendCache(
  container: string,
  filePath: string,
  content: string
): Promise<void> {
  const existing = (await readCache(container, filePath)) ?? ""
  await writeCache(container, filePath, existing ? `${existing}\n${content}` : content)
}
