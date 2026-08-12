#!/usr/bin/env bash
# Run the gates against what is COMMITTED, not against your working tree.
#
# Usage: npm run verify:head
#
# When more than one agent works a single checkout, `npm run typecheck` in the
# working tree answers the wrong question. It tells you whether the tree
# compiles, which is a mixture of your finished work, your unfinished work and
# somebody else's half-written file. What you actually need to know before
# pushing is whether HEAD compiles, because HEAD is what CI and Vercel build.
#
# The difference is not academic. A file using `<Card radius="lg">` was
# committed while the prop it needs was still uncommitted in the working tree.
# Every local check passed and both deployments went red, because the tree had
# the prop and HEAD did not.
#
# This exports HEAD to a scratch directory and runs the gates there. Two
# details matter:
#
#   - node_modules is hard linked rather than symlinked. Turbopack refuses a
#     symlink that points outside the project root and dies with an internal
#     panic that says nothing about symlinks until you read the debug trace.
#     Hard links cost no disk and stay inside the root.
#   - The build gets its own output directory, so it does not fight whoever
#     else is building.
#
# The Supabase values are build time placeholders, the same ones CI uses. The
# browser client is constructed during prerender and throws without them. They
# are not secrets and never reach a deployed environment.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${TMPDIR:-/tmp}/ravenspire-verify-head"

echo "Exporting HEAD ($(git -C "$ROOT" rev-parse --short HEAD)) to $WORK"
rm -rf "$WORK"
mkdir -p "$WORK"
git -C "$ROOT" archive HEAD | tar -x -C "$WORK"

# Hard link the dependency tree. Falls back to a copy on a filesystem that
# cannot hard link across the two paths.
cp -al "$ROOT/node_modules" "$WORK/node_modules" 2>/dev/null \
  || cp -a "$ROOT/node_modules" "$WORK/node_modules"

cd "$WORK"

# The house rule checker enumerates files with `git ls-files`, which is the
# right call in the repository (it skips node_modules and anything ignored) and
# fails outright here, because a `git archive` export carries no .git. A
# throwaway repository over the exported tree gives it exactly the file list it
# would have seen, and costs a fraction of a second.
git init -q .
# Appended, not written over. The export carries the repository's own
# .gitignore, and replacing it would hand the checker a different file list
# from the one it sees for real.
printf "\nnode_modules/\n.next*/\n" >> .gitignore
git add -A

echo "== house rules =="
npm run check:rules

echo "== typecheck =="
npm run typecheck

echo "== tests =="
npx vitest run

echo "== build =="
NEXT_DIST_DIR=.next-verify \
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder \
  npm run build

echo
echo "HEAD is clean on all four gates."
