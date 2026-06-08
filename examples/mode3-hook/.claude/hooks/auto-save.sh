#!/bin/bash
# PostToolUse hook: detect convention keywords in tool output and save to memory.
# Receives tool output via stdin.

INPUT=$(cat)

if echo "$INPUT" | grep -qiE "convention:|remember:|save to memory:"; then
  CONTENT=$(echo "$INPUT" | grep -iE "convention:|remember:|save to memory:" | head -5)
  if [ -n "$CONTENT" ]; then
    npx edgemem append "memory/auto-saved.md" "$CONTENT" 2>/dev/null || true
  fi
fi
