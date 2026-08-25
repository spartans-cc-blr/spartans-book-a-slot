# Spartans Hub — Project Memory

This file is Claude Code's real, documented auto-load mechanism for project
instructions — unlike the `rules.include` key in `.claude/settings.json`,
which is **not** a recognized Claude Code setting and has no effect on its
own. The actual knowledge base lives under `.claude/rules/` (architecture,
security, navigation, UI theme, feature docs under `.claude/rules/features/`,
and the docs-update policy in `.claude/rules/knowledge-base.md`) — read
those for how this app is built and how it should be worked on.

## Documentation is mandatory, not advisory

`.claude/rules/knowledge-base.md` requires that any session touching code
under `src/**`, or adding/changing a migration under
`supabase/migrations/**` or `analytics-db/migrations/**`, updates or
creates the matching `.claude/rules/features/*.md` doc (or
`architecture.md` for cross-cutting changes) before finishing.

This is enforced, not just requested: a `Stop` hook
(`.claude/hooks/check-docs-updated.sh`, wired in `.claude/settings.json`)
blocks session completion if source changed with no corresponding doc
change in the same session. A `SessionStart` hook
(`.claude/hooks/inject-doc-rule.sh`) also surfaces this reminder at the
start of every session. Do not route around the gate (e.g. by touching an
unrelated `.claude/rules/**/*.md` file) — update the doc that actually
describes the change.
