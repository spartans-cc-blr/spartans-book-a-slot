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


## Pull requests — check the merge status before pushing follow-up work

Before pushing any further commit to a branch that already has a pull request, or
before opening a PR for work done on top of one, **check whether that PR has been
merged** (GitHub MCP `pull_request_read` with `get`, or `list_pull_requests` for the
branch; look at `merged` / `state`). Do this every time, not only when asked, and again
after any long pause or when the user mentions a PR number.

- **Merged or closed:** do not push to that branch or reuse the PR. Fetch the latest
  default branch, start a new branch from it (`git fetch origin main && git checkout -b <new-branch> origin/main`),
  cherry-pick only the commits that are not yet on `main` (`git log origin/main..<old-branch>`),
  push, and open a **new** PR. Say in the new PR's description which PR it follows.
- **Still open:** push to the same branch; the PR updates itself.
- **No PR yet:** only open one when the user asks.
- Never assume a PR is still open because it was open earlier in the session; merges
  happen between turns.
