#!/bin/sh
# Sets the Sieve review checkpoint before the agent edits anything, so Sieve's
# "Since last review" section then lists only the agent's changes.
#
# Snapshots the working tree (untracked files included, ignored ones left out)
# through a throwaway copy of the index, so the real index, HEAD and refs are
# never touched, and writes the tree id where Sieve watches for it.
#
# Usage: checkpoint.sh <sieve-workspace-dir>   (the folder holding annotations.json)
set -eu
storage=${1:?usage: checkpoint.sh <sieve-workspace-dir>}
cd "$(git rev-parse --show-toplevel)"

index=$(mktemp)
trap 'rm -f "$index"' EXIT
# Starting from the real index keeps its stat cache; without one Git builds a fresh index.
cp "$(git rev-parse --git-path index)" "$index" 2>/dev/null || rm -f "$index"
GIT_INDEX_FILE=$index git add --all
tree=$(GIT_INDEX_FILE=$index git write-tree)

printf '{\n  "tree": "%s",\n  "createdAt": %s000\n}\n' "$tree" "$(date +%s)" > "$storage/checkpoint.json.tmp"
mv "$storage/checkpoint.json.tmp" "$storage/checkpoint.json"
echo "Sieve checkpoint set at $tree"
