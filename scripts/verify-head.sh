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
# This exports HEAD to a scratch directory and runs the house rules, the
# typecheck and the tests there. node_modules is hard linked, which costs no
# disk. See the note at the bottom for why the build is not among them.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# One directory per run. A fixed path meant two people running this at once
# each deleted the other's export mid check, and the symptom was a Node ENOENT
# on uv_cwd that names no file and points at nothing. Cleaned up on exit so the
# per run directories do not accumulate.
WORK="${TMPDIR:-/tmp}/ravenspire-verify-head.$$"
trap 'rm -rf "$WORK"' EXIT

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

# The build is deliberately NOT run here.
#
# It was, and it produced a false failure: 1138 Turbopack errors, every one of
# them inside node_modules on imports that are plainly correct. The same commit
# built clean in the repository and deployed clean on Vercel. Turbopack does not
# resolve reliably through a hard linked dependency tree, and a symlinked one it
# refuses outright.
#
# A gate that fails on good code is worse than no gate, because the next person
# to see it learns to ignore it, and then it is not a gate at all. The three
# checks below are exact here and are the ones that caught both real breakages
# this harness was written for: a consumer committed without its producer, twice.
# The build belongs to CI and to Vercel, which have a real install.
#
# If you want the build too, run it in the repository against a clean tree:
#   NEXT_DIST_DIR=.next-yours npm run build

echo
echo "HEAD is clean on the house rules, the typecheck and the tests."
echo "The build is not run here on purpose, see the comment in this script."
