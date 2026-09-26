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

## Hosting limits — Vercel Hobby

The app is deployed on Vercel's **Hobby** plan, which has hard limits that
have already broken production more than once. Before adding or changing a
cron, a `vercel.json` setting, a long-running API route, a new dependency,
or any background work, check the **"Vercel Hobby — checklist before
shipping any change"** at the top of `.claude/rules/limitations.md`. The
most important rule: never put a cron that runs more than once a day in
`vercel.json`. Hobby rejects the entire deployment, and every merge after
it silently fails to deploy. Use a GitHub Actions workflow instead.

