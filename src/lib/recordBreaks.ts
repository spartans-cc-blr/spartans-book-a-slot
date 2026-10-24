// Pure, client-safe record-break detection — no DB access. See
// .claude/rules/features/record-breaking.md.
//
// Given the match that just synced and every other synced match, work out
// which club records the new match broke. A record is "broken" when the new
// match's best value for that record STRICTLY beats every other match in the
// same scope — which is also what makes this date-safe: a match that a later
// match has already overtaken is never announced, and a re-sync of the same
// match finds the same answer (the DB unique key then dedupes it).
//
// Scopes: <format> all-time, and <format> in the match's calendar year. T20
// and T30 are separate worlds (a T30 total isn't comparable with a T20 one).
// When a record breaks at the all-time scope the year-scope version is
// dropped — one announcement per record, the widest one.
//
// A scope with fewer than MIN_PRIOR_ENTRIES earlier entries stays silent:
// being the best of two earlier 3rd-wicket stands isn't news.

import { computePartnerships, type FinalScore } from '@/lib/partnerships'

export const MIN_PRIOR_ENTRIES = 5
export const MAX_BREAKS_PER_MATCH = 6
export const RECORD_FORMATS = ['T20', 'T30'] as const

interface BatRow  { player_name: string; runs?: number | string | null; balls?: number | string | null; not_out?: string | null; batted?: boolean; batting_order?: number | null; player_id?: string | null; dismissal_method?: string | null }
interface BowlRow { player_name: string; wickets?: number | string | null; runs?: number | string | null; overs?: number | string | null; did_bowl?: boolean | null }
interface FowRow  { wicket_number: number; team_score: number; over: number; player_name: string; is_retirement?: boolean | null; returning_player_name?: string | null }

export interface RecordMatch {
  bookingId:    string
  gameDate:     string            // YYYY-MM-DD
  format:       string | null
  isPractice:   boolean
  opponentName: string
  result:       'won' | 'lost' | 'tied' | 'nr' | null
  battedFirst:  boolean | null
  teamTotal:    number | null
  teamWickets:  number | null
  teamOvers:    number | null
  batting:      BatRow[]
  bowling:      BowlRow[]
  fallOfWickets: FowRow[]
}

interface Candidate {
  key:     string          // record key, e.g. 'partnership_w3'
  value:   number          // higher is better (lower-is-better records are negated)
  holder:  string
  display: string
}

export interface RecordBreak {
  recordKey:  string
  scopeKey:   string       // 'alltime|T20' | '2026|T20'
  title:      string       // '3rd-wicket partnership'
  scopeLabel: string       // 'T20 all-time' | 'T20 in 2026'
  holder:     string
  display:    string
  prevHolder: string | null
  prevDisplay: string | null
  value:      number
  prevValue:  number | null
  message:    string      // ready-to-send WhatsApp text
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

// CricHeroes overs.balls notation (9.2 = 9 overs 2 balls) — parsed as a string.
function oversToBalls(over: number | string): number {
  const [whole, part] = String(over).split('.')
  return (parseInt(whole, 10) || 0) * 6 + (part ? parseInt(part[0], 10) || 0 : 0)
}

const RECORD_ORDER = ['highest_total', 'highest_chase', 'lowest_defended', 'highest_score', 'best_bowling']

export function recordTitle(key: string): string {
  switch (key) {
    case 'highest_total':   return 'Highest team total'
    case 'highest_chase':   return 'Highest successful chase'
    case 'lowest_defended': return 'Lowest total defended'
    case 'highest_score':   return 'Highest individual score'
    case 'best_bowling':    return 'Best bowling figures'
    default: {
      const m = /^partnership_w(\d+)$/.exec(key)
      return m ? `${ordinal(Number(m[1]))}-wicket partnership` : key
    }
  }
}

function scoreLine(total: number, wickets: number | null, overs: number | null): string {
  return `${total}${wickets === null ? '' : `/${wickets}`}${overs === null ? '' : ` (${overs} ov)`}`
}

// Every record candidate a single match offers. One entry per candidate; the
// caller reduces to the best per key.
export function extractCandidates(m: RecordMatch): Candidate[] {
  const out: Candidate[] = []

  if (m.teamTotal !== null && m.result !== 'nr') {
    const line = scoreLine(m.teamTotal, m.teamWickets, m.teamOvers)
    out.push({ key: 'highest_total', value: m.teamTotal, holder: 'Spartans', display: line })
    if (m.result === 'won' && m.battedFirst === false) {
      out.push({ key: 'highest_chase', value: m.teamTotal, holder: 'Spartans', display: line })
    }
    if (m.result === 'won' && m.battedFirst === true) {
      out.push({ key: 'lowest_defended', value: -m.teamTotal, holder: 'Spartans', display: line })
    }
  }

  for (const b of m.batting) {
    if (b.batted === false || b.dismissal_method === 'did_not_bat') continue
    const balls = num(b.balls)
    out.push({
      key: 'highest_score',
      value: num(b.runs),
      holder: b.player_name,
      display: `${num(b.runs)}${b.not_out === 'Y' ? '*' : ''}${balls > 0 ? ` (${balls})` : ''}`,
    })
  }

  for (const w of m.bowling) {
    if (!w.did_bowl) continue
    const wk = num(w.wickets)
    if (wk < 3) continue            // a "best bowling" record needs a real haul
    out.push({
      key: 'best_bowling',
      value: wk * 1000 - num(w.runs),
      holder: w.player_name,
      display: `${wk}/${num(w.runs)}`,
    })
  }

  const finalScore: FinalScore | null = m.teamTotal !== null
    ? { total: m.teamTotal, overs: m.teamOvers ?? 0, wickets: m.teamWickets }
    : null
  const stands = computePartnerships(m.batting, m.fallOfWickets, finalScore) ?? []
  for (const p of stands) {
    if (p.wicketNumber < 1 || p.wicketNumber > 10) continue
    const balls = oversToBalls(p.overTo) - oversToBalls(p.overFrom)
    out.push({
      key: `partnership_w${p.wicketNumber}`,
      value: p.runs,
      holder: `${p.players[0].playerName} & ${p.players[1].playerName}`,
      display: `${p.runs}${p.outPlayer === null ? '*' : ''}${balls > 0 ? ` (${balls} balls)` : ''}`,
    })
  }
  return out
}

function bestPerKey(cands: Candidate[]): Map<string, Candidate> {
  const best = new Map<string, Candidate>()
  for (const c of cands) {
    const cur = best.get(c.key)
    if (!cur || c.value > cur.value) best.set(c.key, c)
  }
  return best
}

function buildMessage(opts: {
  title: string; scopeLabel: string; holder: string; display: string
  opponent: string; gameDate: string; prevHolder: string | null; prevDisplay: string | null
}): string {
  const date = new Date(`${opts.gameDate}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
  const lines = [
    `🏆 New Spartans record!`,
    ``,
    `${opts.title} (${opts.scopeLabel})`,
    `${opts.display} — ${opts.holder}`,
    `vs ${opts.opponent}, ${date}`,
  ]
  if (opts.prevDisplay) {
    lines.push(`Previous best: ${opts.prevDisplay}${opts.prevHolder ? ` — ${opts.prevHolder}` : ''}`)
  }
  lines.push(``, `Well played! 👏`)
  return lines.join('\n')
}

interface Entry extends Candidate { match: RecordMatch }
interface BaselineCell { best: Entry; count: number }

// The standing record (best entry) and entry count per record key across the
// given matches in one scope. This ONE function is the baseline: the admin
// "Current records" view and the alert check both call it, so what the admin
// sees is exactly what a new scorecard is validated against.
function buildBaseline(matches: RecordMatch[], inScope: (m: RecordMatch) => boolean): Map<string, BaselineCell> {
  const cells = new Map<string, BaselineCell>()
  for (const match of matches) {
    if (!inScope(match)) continue
    for (const c of extractCandidates(match)) {
      const cell = cells.get(c.key)
      if (!cell) cells.set(c.key, { best: { ...c, match }, count: 1 })
      else {
        cell.count += 1
        if (c.value > cell.best.value) cell.best = { ...c, match }
      }
    }
  }
  return cells
}

const rankOf = (k: string) => {
  const i = RECORD_ORDER.indexOf(k)
  return i === -1 ? RECORD_ORDER.length + (Number(k.replace(/\D/g, '')) || 0) : i
}

function scopesFor(fmt: string, year: string) {
  return [
    { scopeKey: `alltime|${fmt}`, scopeLabel: `${fmt} all-time`,    inScope: (_: RecordMatch) => true },
    { scopeKey: `${year}|${fmt}`,  scopeLabel: `${fmt} in ${year}`,  inScope: (o: RecordMatch) => o.gameDate.slice(0, 4) === year },
  ]
}

// Which records did `target` break, measured against `all` (which may include
// target itself — it is ignored by bookingId).
export function detectRecordBreaks(target: RecordMatch, all: RecordMatch[]): RecordBreak[] {
  const fmt = target.format
  if (target.isPractice || !fmt || !(RECORD_FORMATS as readonly string[]).includes(fmt)) return []
  const year = target.gameDate.slice(0, 4)

  const targetBest = bestPerKey(extractCandidates(target))
  const others = all.filter(o => o.bookingId !== target.bookingId && !o.isPractice && o.format === fmt)

  const found = new Map<string, RecordBreak>()   // by recordKey — widest scope wins
  for (const scope of scopesFor(fmt, year)) {
    const baseline = buildBaseline(others, scope.inScope)
    for (const [key, mine] of Array.from(targetBest.entries())) {
      if (found.has(key)) continue               // already broken at a wider scope
      const cell = baseline.get(key)
      if (!cell || cell.count < MIN_PRIOR_ENTRIES) continue
      const bestPrior = cell.best
      if (mine.value <= bestPrior.value) continue
      const title = recordTitle(key)
      found.set(key, {
        recordKey: key,
        scopeKey: scope.scopeKey,
        title,
        scopeLabel: scope.scopeLabel,
        holder: mine.holder,
        display: mine.display,
        prevHolder: bestPrior.holder,
        prevDisplay: bestPrior.display,
        value: mine.value,
        prevValue: bestPrior.value,
        message: buildMessage({
          title, scopeLabel: scope.scopeLabel, holder: mine.holder, display: mine.display,
          opponent: target.opponentName, gameDate: target.gameDate,
          prevHolder: bestPrior.holder, prevDisplay: bestPrior.display,
        }),
      })
    }
  }

  return Array.from(found.values())
    .sort((a, b) =>
      Number(b.scopeKey.startsWith('alltime')) - Number(a.scopeKey.startsWith('alltime')) ||
      rankOf(a.recordKey) - rankOf(b.recordKey))
    .slice(0, MAX_BREAKS_PER_MATCH)
}

export interface RecordBookEntry {
  format:      string
  scopeKey:    string        // 'alltime|T20' | '2026|T20'
  scopeLabel:  string
  year:        string | null // null = all-time
  recordKey:   string
  title:       string
  holder:      string
  display:     string
  bookingId:   string
  gameDate:    string
  opponentName: string
  entries:     number        // how many entries the record was picked from
  armed:       boolean       // false = fewer than MIN_PRIOR_ENTRIES: a new match won't alert yet
  // All-time scope only: the calendar year this record was set in, and what it
  // beat — the best from matches played BEFORE that year (null when there was
  // nothing earlier, i.e. the first ever entry).
  setInYear:   string | null
  beat:        { display: string; holder: string; year: string } | null
}

// Every current record — the full baseline new scorecards are checked against.
export function computeRecordBook(all: RecordMatch[]): RecordBookEntry[] {
  const out: RecordBookEntry[] = []
  for (const fmt of RECORD_FORMATS) {
    const matches = all.filter(m => !m.isPractice && m.format === fmt)
    const years = Array.from(new Set(matches.map(m => m.gameDate.slice(0, 4)))).sort().reverse()
    const scopes: { scopeKey: string; scopeLabel: string; year: string | null; inScope: (m: RecordMatch) => boolean }[] = [
      { scopeKey: `alltime|${fmt}`, scopeLabel: `${fmt} all-time`, year: null, inScope: () => true },
      ...years.map(y => ({ scopeKey: `${y}|${fmt}`, scopeLabel: `${fmt} in ${y}`, year: y, inScope: (m: RecordMatch) => m.gameDate.slice(0, 4) === y })),
    ]
    const beforeYear = new Map<string, Map<string, BaselineCell>>()   // baseline of matches before year Y
    const priorBaseline = (y: string) => {
      let b = beforeYear.get(y)
      if (!b) { b = buildBaseline(matches, m => m.gameDate.slice(0, 4) < y); beforeYear.set(y, b) }
      return b
    }
    for (const scope of scopes) {
      const cells = buildBaseline(matches, scope.inScope)
      for (const [key, cell] of Array.from(cells.entries())) {
        const setYear = scope.year === null ? cell.best.match.gameDate.slice(0, 4) : null
        const prev = setYear ? priorBaseline(setYear).get(key)?.best : undefined
        out.push({
          format: fmt, scopeKey: scope.scopeKey, scopeLabel: scope.scopeLabel, year: scope.year,
          recordKey: key, title: recordTitle(key),
          holder: cell.best.holder, display: cell.best.display,
          bookingId: cell.best.match.bookingId, gameDate: cell.best.match.gameDate,
          opponentName: cell.best.match.opponentName,
          entries: cell.count, armed: cell.count >= MIN_PRIOR_ENTRIES,
          setInYear: setYear,
          beat: prev ? { display: prev.display, holder: prev.holder, year: prev.match.gameDate.slice(0, 4) } : null,
        })
      }
    }
  }
  return out.sort((a, b) => rankOf(a.recordKey) - rankOf(b.recordKey))
}
