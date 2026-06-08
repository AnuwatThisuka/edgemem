import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import type { MemConfig } from "./index.js"

interface ClaudeRc {
  container?: string
  apiKeyEnv?: string
}

interface GlobalConfig {
  container?: string
  apiKey?: string
}

export async function resolveConfig(
  overrides: Partial<MemConfig> = {}
): Promise<MemConfig> {
  const apiKey = overrides.apiKey ?? (await resolveApiKey())
  const container = overrides.container ?? (await resolveContainer())

  if (!apiKey) {
    throw new Error(
      "SUPERMEMORY_API_KEY is required. Set it in env, .clauderc, or ~/.edgemem/config.json"
    )
  }
  if (!container) {
    throw new Error(
      "EDGEMEM_CONTAINER is required. Set it in env, .clauderc, or ~/.edgemem/config.json"
    )
  }

  return { apiKey, container }
}

async function resolveApiKey(): Promise<string | undefined> {
  if (process.env["SUPERMEMORY_API_KEY"]) {
    return process.env["SUPERMEMORY_API_KEY"]
  }

  const rc = await readClaudeRc()
  const envName = rc?.apiKeyEnv ?? "SUPERMEMORY_API_KEY"
  if (process.env[envName]) return process.env[envName]

  const global = await readGlobalConfig()
  return global?.apiKey
}

async function resolveContainer(): Promise<string | undefined> {
  if (process.env["EDGEMEM_CONTAINER"]) {
    return process.env["EDGEMEM_CONTAINER"]
  }

  const rc = await readClaudeRc()
  if (rc?.container) return rc.container

  const global = await readGlobalConfig()
  return global?.container
}

async function readClaudeRc(): Promise<ClaudeRc | undefined> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), ".clauderc"), "utf-8")
    return JSON.parse(raw) as ClaudeRc
  } catch {
    return undefined
  }
}

async function readGlobalConfig(): Promise<GlobalConfig | undefined> {
  try {
    const raw = await fs.readFile(
      path.join(os.homedir(), ".edgemem", "config.json"),
      "utf-8"
    )
    return JSON.parse(raw) as GlobalConfig
  } catch {
    return undefined
  }
}
