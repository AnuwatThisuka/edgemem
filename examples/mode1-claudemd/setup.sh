#!/bin/bash
set -e

echo "Setting up edgemem for this project..."

if [ -z "$SUPERMEMORY_API_KEY" ]; then
  echo "Error: SUPERMEMORY_API_KEY is not set"
  echo "Get your key at https://supermemory.ai"
  exit 1
fi

npx edgemem init --container "${EDGEMEM_CONTAINER:-myproject}"
npx edgemem sync --output .claude/memory/

echo ""
echo "Done. Start Claude Code and memory is ready."
echo "To refresh memory: npx edgemem sync"
