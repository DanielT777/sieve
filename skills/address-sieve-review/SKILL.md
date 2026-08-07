---
name: address-sieve-review
description: Read and address code-review annotations created in the Sieve VS Code extension. Use automatically when the user asks to handle their latest Sieve review, fix or address Sieve feedback, act on comments or annotations they just left in Sieve, or continue after reviewing changes with Sieve. Do not use for GitHub pull-request reviews unless the user explicitly refers to Sieve.
---

# Address Sieve Review

## Load the review

1. Resolve the current workspace root with `git rev-parse --show-toplevel`; fall back to the current directory outside Git.
2. Search `~/.sieve/workspaces/*/workspace.json` and select the entry whose `workspacePath` resolves to that root.
3. Read the sibling `annotations.json` file. If it is absent or has no unresolved annotations, tell the user that no Sieve feedback is waiting.
4. Treat `startLine` and `endLine` as zero-based. `fileUri` is the absolute target file. Missing `sourceId` means current working-tree changes.

## Address the feedback

1. Process annotations where `resolved` is `false`, oldest first, unless the user narrows the scope.
2. Inspect the target file and nearby code. Lines may have shifted, so verify context before editing.
3. Make the smallest change that addresses the comment. Treat `explain` as a question unless a code change is clearly requested, and add tests for `test` annotations when applicable.
4. Run the smallest relevant checks after editing.
5. Do not edit files under `~/.sieve`; Sieve remains the source of truth and the user resolves annotations there.

Finish with a compact list of annotations addressed, skipped, or needing clarification.
