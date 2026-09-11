# Spartans Hub — UI Theme & Design System

**Applies to:** All pages and components in `hub.spartanscricketclub.in`
**Last updated: September 2026**
**Status: Option 1 (Warm Light) — approved as the default for all new work (see Rollout Policy below)**

---

## Rollout Policy (added September 2026)

**Warm Light (Option 1, this document's palette) is the approved theme for
all *new* pages and components going forward.** Anything built from here
on should use this palette directly — no need to ask before a new page
goes Warm Light; it's the default, not an opt-in.

**Existing pages are explicitly NOT to be migrated proactively.** The
dark-ink theme still in use across most of the app (`/captains-corner`,
`/profile`, `/leaderboard`, `/admin/**`, and everything else that hasn't
had its own Warm Light rebuild) stays as-is until a session is already
touching that specific page for some other reason — and even then, only
migrate its theme after asking the user to confirm first. Don't fold a
theme migration into an unrelated change as a drive-by improvement.

**Two pieces of shared chrome are the exception, already migrated
site-wide** — not page bodies, but persistent UI that wraps every page
regardless of that page's own theme: the top nav bar (`SiteNav.tsx`) and
the mobile bottom tab bar (`MobileTabBar.tsx`, defaults to `'light'` as of
September 2026). Both are documented in `navigation.md` §4/§4.1. Neither
migration touched any page body — a light nav/tab bar sitting above or
below a still-dark page is an accepted seam, not a bug (see `navigation.md`
§4's "Deliberately still just the nav bar, not a wider reskin" note).

---

## Design Principles

1. **Daylight-first** — primary users are on mobile outdoors. Every colour decision
   must pass a sunlight legibility test. Light backgrounds, dark high-contrast text.
2. **Scale-aware** — font sizes must use CSS custom properties so user preference
   scales all text proportionally (see Font Scale section).
3. **Theme-aware** — all colours must use CSS custom properties so theme switching
   works without touching components.
4. **Security-first** — any new profile preference fields (font_scale, color_theme)
   must be read server-side and injected at render time. Never trust client-sent
   theme values for security-sensitive UI.

---

## Approved Colour Palette — Option 1 (Warm Light / Slate & Saffron)

### Page & Surface
| Token | Value | Usage |
|---|---|---|
| `--color-bg` | `#F8F4EE` | Page background |
| `--color-surface` | `#EEEAE2` | Card background |
| `--color-surface-deep` | `#E2DACE` | Input bg, date blocks, deeper cards |
| `--color-border` | `#D4C9B0` | All borders and dividers |

### Text
| Token | Value | Usage |
|---|---|---|
| `--color-text` | `#1C1917` | Primary body text (stone-950) |
| `--color-text-2` | `#44403C` | Secondary text (stone-700) |
| `--color-text-muted` | `#78716C` | Labels, sublabels, metadata (stone-500) |
| `--color-text-faint` | `#A8A29E` | Placeholder, disabled (stone-400) |

### Accent
| Token | Value | Usage |
|---|---|---|
| `--color-gold` | `#D97706` | Primary accent, links, active states (amber-600) |
| `--color-gold-hover` | `#B45309` | Hover state, headings, captain names (amber-700) |
| `--color-gold-light` | `#FEF3C7` | Tinted backgrounds (amber-50) |
| `--color-crimson` | `#DC2626` | Errors, danger states (red-600) |
| `--color-crimson-dark` | `#B91C1C` | Hover on danger (red-700) |

### Status / Semantic
| Token | Value | Usage |
|---|---|---|
| `--color-success` | `#059669` | Completed, confirmed (emerald-600) |
| `--color-success-bg` | `#D1FAE5` | Success tinted surface (emerald-100) |
| `--color-warning` | `#D97706` | Scheduled, pending (amber-600) |
| `--color-warning-bg` | `#FEF3C7` | Warning tinted surface (amber-50) |
| `--color-neutral` | `#78716C` | Unbooked, inactive (stone-500) |

### Navigation Bar (Warm Light, site-wide — changed September 2026)
Previously an intentional dark exception, kept dark regardless of what
theme the page content below it used (see `navigation.md` §4's changelog
note). Reversed per a direct request for the top nav to match the rest of
the Warm Light palette everywhere, not just on the pages that had already
adopted it — `SiteNav.tsx` now renders on `bg-white` (`#FFFFFF`) with a
`border-[#D4C9B0]` bottom border on every page, dropdown panels included.

**The border is a literal arbitrary-value class, not `border-ink-5`
(corrected September 2026, same pass as the "still a black band" fix
below)** — the first cut of this change kept `border-ink-5`, on the
mistaken belief (this doc's own "Tailwind Token Mapping" section said so)
that `ink-5` already resolved to this same light `#D4C9B0` tan. It
doesn't — see the ⚠️ correction note under Tailwind Token Mapping below;
`ink-5` actually ships as `#2E2E2E`, a dark gray. Every `border-ink-5` in
`SiteNav.tsx` was switched to the literal `border-[#D4C9B0]` to get the
colour this section always intended.
| Token | Value | Usage |
|---|---|---|
| `--color-nav-bg` | `#FFFFFF` | Nav background |
| `--color-nav-border` | `#D4C9B0` | Nav bottom border, dropdown panel borders (literal hex — not the `ink-5` token, see above) |
| `--color-nav-text` | `#D97706` | Active nav label, icons — this is the *intended* value; the bare `text-gold` class actually renders `#C9A84C` (see the Tailwind Token Mapping correction below), a close but not identical muted gold |

---

## Tailwind Token Mapping

> ⚠️ **Correction (September 2026) — this section describes the *planned*
> Option 1 palette, not what `tailwind.config.ts` actually ships.** This
> was discovered live while chasing a "still a black band at the bottom"
> report: `ink-5`, documented below as the light `#D4C9B0` border token,
> was assumed unchanged when `SiteNav.tsx` went Warm Light (PR #234) —
> its real value is `#2E2E2E`, a dark gray, since the real `ink` scale was
> never migrated off the original dark-ink palette. Every `border-ink-5`
> in `SiteNav.tsx` has since been corrected to the literal `border-[#D4C9B0]`
> (§4's changelog note has the fix). The real, currently-shipped tokens are:
>
> ```ts
> // tailwind.config.ts — colors block, as actually shipped
> colors: {
>   gold: {
>     DEFAULT: '#C9A84C',   // muted khaki-gold, NOT #D97706
>     light: '#E8C97A',
>     dim: '#7A6030',        // NOT #B45309
>     glow: 'rgba(201,168,76,0.15)',
>   },
>   crimson: {
>     DEFAULT: '#C0132C',   // deep maroon-red, NOT #DC2626
>     dark: '#8B0000',
>   },
>   ink: {
>     DEFAULT: '#080808',   // near-black — matches globals.css's `body` bg
>     2: '#111111',
>     3: '#1A1A1A',
>     4: '#242424',
>     5: '#2E2E2E',          // dark gray border, NOT light tan
>   },
>   parchment: {
>     DEFAULT: '#F8F4EE',   // this one *does* match the table below
>     2: '#EEEAE2',
>     3: '#E2DACE',
>   },
> }
> ```
>
> Every Home dashboard/`FixturesCard`/`SelectedMatchCard` colour cited
> elsewhere in this file as a hex literal (`#D97706`, `#B45309`, `#DC2626`,
> `#D4C9B0`, …) is a plain inline `style={{ color: '...' }}` or a Tailwind
> arbitrary-value class (`bg-[#...]`) — those are unaffected by this gap,
> since they never went through the `gold`/`crimson`/`ink` token names at
> all. Only code using the bare Tailwind utility classes (`text-gold`,
> `border-ink-5`, `bg-ink-2`, etc.) is actually rendering the *shipped*
> palette below, not the aspirational one in the rest of this doc. Not
> re-audited further as part of this fix — the gold/crimson shift (muted
> khaki vs. punchy amber, deep maroon vs. bright red) doesn't read as
> "broken" the way a dark-gray border or a near-black background did, so
> it wasn't in scope for the reported bug. Worth a dedicated pass if the
> two palettes are ever meant to fully converge — either update
> `tailwind.config.ts` to match this table, or update this table to match
> the config.

The table below (and the rest of this document) still describes the
**intended** Option 1 values — useful as the target design, just not a
reliable source for what a bare `text-gold`/`border-ink-5`/`bg-ink-2`
class actually renders today. Prefer literal hex (inline `style` or
`bg-[#...]`) over the `gold`/`crimson`/`ink` Tailwind tokens when the exact
Warm Light value matters, until the two are reconciled.

```ts
// tailwind.config.ts — colors block (as intended, still not shipped for gold/crimson/ink)
colors: {
  gold: {
    DEFAULT: '#D97706',
    light: '#F59E0B',
    dim: '#B45309',
    glow: 'rgba(217,119,6,0.12)',
  },
  crimson: {
    DEFAULT: '#DC2626',
    dark: '#B91C1C',
  },
  ink: {
    DEFAULT: '#1C1917',
    2: '#292524',
    3: '#44403C',
    4: '#EEEAE2',   // card surface
    5: '#D4C9B0',   // borders
  },
  parchment: {
    DEFAULT: '#F8F4EE',   // page bg — this one is actually shipped
    2: '#EEEAE2',          // card bg
    3: '#E2DACE',          // deep surface
  },
}
```

---

## Font Scale System

### How it works
A single CSS variable `--font-scale` on `<html>` drives all text sizes.
Inject server-side from `players.font_scale` (default: `1`):
```html
<html style="--font-scale: 1.125" data-theme="warm-light">
```

### Scale stops
| Label | Value | Tailwind equivalent |
|---|---|---|
| Small | `0.875` | ~14px base |
| Default | `1.0` | 16px base |
| Large | `1.125` | ~18px base |
| Extra Large | `1.25` | 20px base |

### Rules for font sizes in components
- **Never use hardcoded `text-[9px]`, `text-[10px]`** — these bypass scaling
- Use Tailwind scale classes (`text-xs`, `text-sm`, `text-base`) which will be
  multiplied by `--font-scale` via the Tailwind plugin (to be added)
- Minimum readable size: `text-xs` (12px × scale). Nothing smaller in production UI.
- Stat numbers, headings: `text-lg` minimum

---

### Reading text vs Structural UI text

Font scale applies to TWO separate variables — not one:

```css
--font-scale: 1.125;      /* reading text — user controlled */
--font-scale-ui: 1.0;     /* structural text — always fixed at 1.0 */
```

| Category | Variable | Examples |
|---|---|---|
| **Reading text** ✅ scales | `--font-scale` | Captain names, organiser names, section headings, descriptions, stat numbers, body copy |
| **Structural UI text** ❌ fixed | `--font-scale-ui` | Pill labels (Sat/Sun, T20, 12:30), stat bar column headers, nav labels, date block (day/month/dayname), gap column label |

**Why:** Scaling structural text causes card distortion — pills overflow,
date blocks clip, column headers push into neighbours. Scaling reading text
gives users the outdoor legibility benefit without breaking any layouts.

**Rule:** When adding a new text element, decide which category it belongs to
before assigning a font size.


## Colour Theme System (planned — implement after Warm Light baseline)

### How it works
`data-theme` attribute on `<html>` swaps CSS variable sets.
Saved to `players.color_theme` (default: `warm-light`).

### Planned themes
| Key | Name | Feel |
|---|---|---|
| `warm-light` | Warm Light | Parchment + saffron — **current default** |
| `dark-classic` | Dark Classic | Original dark + gold |
| `high-contrast` | High Contrast | Pure white + black + amber — accessibility |
| `slate-teal` | Slate & Teal | Cool grey + teal — modern indoor |

---

## Component Patterns

### Captain name
Always render with `PlayerNameLink` component.
Colour: `text-gold-dim` (`#B45309`) + `font-semibold`.
If `cricheroes_url` is set on the player profile, wrap in `<a>` linking to it.

### Stat numbers (e.g. tournament totals)
`font-cinzel text-2xl font-bold` — never smaller than `text-lg`.

### Section labels / eyebrows
`font-rajdhani text-xs font-bold tracking-widest uppercase text-muted`
Never `text-[9px]` or `text-[10px]`.

### Status pills (Sat/Sun day badges)
- Sat: `bg-blue-100 text-blue-700 border border-blue-300`
- Sun: `bg-pink-100 text-pink-700 border border-pink-300`

### "Verified" badge (scorecard verification, `/matches/history`)
Scalloped-seal shape — two rounded squares (`rx=4`) offset 45° from each
other, overlaid to form an 8-point rosette, with a white checkmark path on
top. Fill `#059669` (emerald). This is the familiar Twitter/X verified
look, in the app's own success colour rather than Twitter blue. Use this
shape (not a bare `✓`/tick) anywhere a "this has been manually verified"
status needs an icon — see `VerifiedBadge` in
`src/components/matches/MatchHistoryClient.tsx` for the reference SVG, and
`features/post-match-scorecard.md` §14 for where it's used.

### Slot time / format pills
`bg-parchment-3 text-ink-3 border border-ink-5`

### Game row left accent strip
3px left border by status:
- Completed: `border-l-2 border-success`
- Scheduled: `border-l-2 border-gold`
- Unbooked: `border-l-2 border-neutral`

### Stat bar layout
Use 2-row layout instead of 5 cramped columns:
- Row 1: Total · Completed · Scheduled (3 cols)
- Row 2: Unbooked · Avg Gap (2 cols)

### WhatsApp / nudge banners
`bg-emerald-50 border border-emerald-200 text-emerald-700`

---

## Page-level background

Every page `<main>` must use:
```tsx
<main className="min-h-screen bg-parchment px-4 py-8 ...">
```
Not `bg-ink-1`, not `bg-zinc-900`.

Admin pages may retain dark sidebar but page content area uses `bg-parchment`.

---

## Checklist — when touching any page or component

Before submitting any code change, verify:

- [ ] No `bg-zinc-800`, `bg-zinc-900`, `bg-ink-1` on page backgrounds
- [ ] No `text-zinc-400`, `text-zinc-500`, `text-zinc-600` on light backgrounds
  (use `text-stone-*` equivalents instead)
- [ ] No hardcoded `text-[9px]` or `text-[10px]` font sizes
- [ ] Captain names use `PlayerNameLink` with `text-gold-dim font-semibold`
- [ ] Stat numbers are `text-lg` minimum
- [ ] `*-400` colour shades replaced with `*-600`/`*-700` for text on light bg
- [ ] Page `<main>` uses `bg-parchment`
- [ ] Nav bar (`SiteNav.tsx`) stays Warm Light (`bg-white`/`border-ink-5`) — do not re-darken it (changed September 2026, see `navigation.md` §4)

---

## Schema additions required (not yet implemented)

```sql
-- players table
ALTER TABLE players
  ADD COLUMN font_scale   numeric(4,3) NOT NULL DEFAULT 1.0
    CHECK (font_scale IN (0.875, 1.0, 1.125, 1.25)),
  ADD COLUMN color_theme  text NOT NULL DEFAULT 'warm-light'
    CHECK (color_theme IN ('warm-light', 'dark-classic', 'high-contrast', 'slate-teal'));
```

---

*Maintained by: Muthu, Spartans CC BLR · May 2026*
*Design direction approved: Option 1 Warm Light (Slate & Saffron)*