#!/usr/bin/env node
import { Command } from "commander"
import { init } from "./init.js"
import { sync } from "./sync.js"
import { inject } from "./inject.js"
import { createMem, ProtectedFileError } from "@edgemem/core"
import { resolveConfig } from "@edgemem/core/config"

const program = new Command()

program
  .name("edgemem")
  .description("Filesystem-native agent memory layer for Claude Code")
  .version("0.2.0")

program
  .command("init")
  .description("Initialize edgemem for this project, update CLAUDE.md")
  .option("-c, --container <name>", "Supermemory container name")
  .option("--api-key-env <name>", "Env var name for API key", "SUPERMEMORY_API_KEY")
  .action(async (opts: { container?: string; apiKeyEnv: string }) => {
    await init({ container: opts.container, apiKeyEnv: opts.apiKeyEnv })
  })

program
  .command("sync")
  .description("Pull latest memory from Supermemory → local files")
  .option("-o, --output <dir>", "Output directory", ".claude/memory")
  .option("-c, --container <name>", "Supermemory container name")
  .action(async (opts: { output: string; container?: string }) => {
    const config = await resolveConfig({ container: opts.container })
    await sync({ config, outputDir: opts.output })
  })

program
  .command("write <path> <content>")
  .description("Write content to a memory file")
  .option("-c, --container <name>", "Supermemory container name")
  .option(
    "--force",
    "Allow writing to protected core files (requires human intent)",
    false
  )
  .action(
    async (filePath: string, content: string, opts: { container?: string; force: boolean }) => {
      const config = await resolveConfig({ container: opts.container })
      const mem = await createMem(config, { allowCoreMutation: opts.force })
      try {
        await mem.write(filePath, content)
        console.log(`Written to ${filePath}`)
      } catch (err) {
        if (err instanceof ProtectedFileError) {
          console.error(err.message)
          console.error("Tip: use --force to override (human-only action)")
          process.exit(1)
        }
        throw err
      }
    }
  )

program
  .command("append <path> <content>")
  .description("Append content to a memory file")
  .option("-c, --container <name>", "Supermemory container name")
  .option(
    "--force",
    "Allow appending to protected core files (requires human intent)",
    false
  )
  .action(
    async (filePath: string, content: string, opts: { container?: string; force: boolean }) => {
      const config = await resolveConfig({ container: opts.container })
      const mem = await createMem(config, { allowCoreMutation: opts.force })
      try {
        await mem.append(filePath, content)
        console.log(`Appended to ${filePath}`)
      } catch (err) {
        if (err instanceof ProtectedFileError) {
          console.error(err.message)
          console.error("Tip: use --force to override (human-only action)")
          process.exit(1)
        }
        throw err
      }
    }
  )

program
  .command("read <path>")
  .description("Read a memory file")
  .option("-c, --container <name>", "Supermemory container name")
  .action(async (filePath: string, opts: { container?: string }) => {
    const config = await resolveConfig({ container: opts.container })
    const mem = await createMem(config)
    const content = await mem.read(filePath)
    process.stdout.write(content)
  })

program
  .command("grep <query>")
  .description("Semantic search across team memory")
  .option("-p, --path <path>", "Scope search to a path")
  .option("-c, --container <name>", "Supermemory container name")
  .action(async (query: string, opts: { path?: string; container?: string }) => {
    const config = await resolveConfig({ container: opts.container })
    const mem = await createMem(config)
    const result = await mem.grep(query, opts.path)
    process.stdout.write(result || "(no results)\n")
  })

program
  .command("list")
  .description("List all memory files")
  .option("-p, --path <path>", "Path to list")
  .option("-c, --container <name>", "Supermemory container name")
  .action(async (opts: { path?: string; container?: string }) => {
    const config = await resolveConfig({ container: opts.container })
    const mem = await createMem(config)
    const files = await mem.list(opts.path)
    console.log(files.join("\n"))
  })

program
  .command("inject")
  .description("Output formatted memory context (for hook injection)")
  .option("-c, --container <name>", "Supermemory container name")
  .option("-f, --format <format>", "Output format: context|json", "context")
  .action(async (opts: { container?: string; format: string }) => {
    const config = await resolveConfig({ container: opts.container })
    await inject({ config, format: opts.format as "context" | "json" })
  })

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`Error: ${msg}`)
  process.exit(1)
})
