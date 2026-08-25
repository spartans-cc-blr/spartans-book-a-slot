#!/usr/bin/env bash
# Stop hook: blocks session completion when source code changed this
# session but no doc under .claude/rules/**/*.md was updated to match.
#
# This is the deterministic enforcement of .claude/rules/knowledge-base.md
# ("update the relevant knowledge article whenever code changes"), which
# was previously advisory-only and got skipped (e.g. Tournament Planner
# shipped fully working with no features/tournament-planner.md).
#
# Exit 0 = allow Stop. Exit 2 = block Stop; stderr is shown to the model
# so it can go update docs and try again.

set -uo pipefail

# Not a git repo (or git unavailable) -> nothing we can check, don't block.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

# --- Collect changed files (staged + unstaged + untracked) -----------------
#
# git diff --name-only HEAD covers tracked modifications (staged and
# unstaged) against the last commit. git status --porcelain additionally
# catches untracked new files, and acts as a fallback when HEAD doesn't
# exist yet (a repo with no commits).

tmp_files="$(mktemp)"
trap 'rm -f "$tmp_files"' EXIT

if git rev-parse HEAD >/dev/null 2>&1; then
  git diff --name-only HEAD -- 2>/dev/null >>"$tmp_files" || true
fi

# Parse `git status --porcelain` output. Format is a 2-char status code,
# a space, then the path (or "old -> new" for a rename/copy) — so the
# path always starts at character 4.
git status --porcelain 2>/dev/null | while IFS= read -r line; do
  path="${line:3}"
  case "$path" in
    *" -> "*) path="${path##* -> }" ;;
  esac
  printf '%s\n' "$path"
done >>"$tmp_files" || true

changed_files="$(sort -u "$tmp_files" | sed '/^$/d')"

if [ -z "$changed_files" ]; then
  exit 0
fi

# --- Classify ----------------------------------------------------------

is_source() {
  case "$1" in
    src/*.ts|src/*.tsx) return 0 ;;
    supabase/migrations/*.sql) return 0 ;;
    analytics-db/migrations/*.sql) return 0 ;;
  esac
  return 1
}

is_doc() {
  case "$1" in
    .claude/rules/*.md) return 0 ;;
  esac
  return 1
}

source_changed=()
doc_changed=false

while IFS= read -r f; do
  [ -z "$f" ] && continue
  if is_source "$f"; then
    source_changed+=("$f")
  fi
  if is_doc "$f"; then
    doc_changed=true
  fi
done <<EOF
$changed_files
EOF

# No source touched this session -> nothing to enforce, don't nag on
# doc-only or read-only sessions.
if [ "${#source_changed[@]}" -eq 0 ]; then
  exit 0
fi

if [ "$doc_changed" = true ]; then
  exit 0
fi

# --- Block: source changed, no doc changed ---------------------------------

{
  echo "BLOCKED: source code changed this session with no matching documentation update."
  echo ""
  echo "Changed source file(s):"
  for f in "${source_changed[@]}"; do
    echo "  - $f"
  done
  echo ""
  echo "Per .claude/rules/knowledge-base.md, any session that adds, modifies, or"
  echo "deletes code under src/**, or adds/changes a migration under"
  echo "supabase/migrations/** or analytics-db/migrations/**, must update or"
  echo "create the matching knowledge article before finishing — typically the"
  echo "relevant .claude/rules/features/*.md file for the feature touched, or"
  echo ".claude/rules/architecture.md for a cross-cutting/system-map change."
  echo ""
  echo "Update (or create) the matching doc under .claude/rules/ and this check"
  echo "will pass. If no doc update is actually warranted for this change"
  echo "(e.g. a pure refactor with no behavioural/architectural difference),"
  echo "make that judgment call explicit by touching the relevant doc anyway"
  echo "with a short note, or explain to the user why no doc change applies"
  echo "before ending the session."
} >&2

exit 2
