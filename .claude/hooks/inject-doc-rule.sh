#!/usr/bin/env bash
# SessionStart hook: nudges the model, up front, that code changes in this
# repo require a matching documentation update. This is a reminder
# alongside the hard gate in check-docs-updated.sh (a Stop hook), not a
# replacement for it — that script is what actually blocks completion.

set -uo pipefail

MESSAGE="Reminder: this repo enforces docs-with-code. Any session that adds, modifies, or deletes code under src/**, or adds/changes a migration under supabase/migrations/** or analytics-db/migrations/**, must update or create the matching .claude/rules/features/*.md doc (or architecture.md for cross-cutting changes) before finishing, per .claude/rules/knowledge-base.md. A Stop hook (.claude/hooks/check-docs-updated.sh) enforces this and will block session completion if source changed with no matching doc update."

cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${MESSAGE}"
  }
}
JSON
