// Pure, client-safe: what a "normal" opponent stand looks like, so a stand can
// be judged big *for its slot and format* instead of against a fixed run count
// (a 30 is ordinary for an opening stand in a T30, huge for the tail in a T20).
// Baselines are built from every synced opponent innings and bucketed by
// format × batting-position group. See features/partnerships.md §13.

import type { Breakthrough } from '@/lib/breakthroughs'

export type StandGroup = 'openers' | 'top' | 'middle' | 'tail'

// Wickets 1–2 openers, 3–4 top order, 5–8 middle order, 9+ tail.
export function standGroup(wicketNumber: number): StandGroup {
  if (wicketNumber <= 2) return 'openers'
  if (wicketNumber <= 4) return 'top'
  if (wicketNumber <= 8) return 'middle'
  return 'tail'
}

export const STAND_GROUP_LABEL: Record<StandGroup, string> = {
  openers: 'openers (wkts 1–2)', top: 'top order (3–4)', middle: 'middle order (5–8)', tail: 'tail (9–11)',
}

export interface StandBaseline {
  n:    number   // stands in the bucket
  p75:  number   // runs at the 75th percentile — at or above this is "big"
  mean: number   // average stand, the "par" for runs-above-par
}

// Keyed `${format}|${group}`, where format is T20, T30, or all (every format).
export type StandBaselines = Record<string, StandBaseline>

// A format bucket needs this many stands before it is trusted over the
// all-formats bucket for the same position group.
export const MIN_BASELINE_SAMPLE = 20

function normFormat(f: string | null | undefined): 'T20' | 'T30' | null {
  const s = String(f ?? '').trim().toUpperCase()
  return s === 'T20' || s === 'T30' ? s : null
}

function summarise(runs: number[]): StandBaseline {
  const sorted = runs.slice().sort((a, b) => a - b)
  const idx = 0.75 * (sorted.length - 1)
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  const p75 = sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
  return { n: sorted.length, p75, mean: sorted.reduce((a, b) => a + b, 0) / sorted.length }
}

// Unbroken closing stands are left out: they were cut short by the end of the
// innings, not by a dismissal, so they'd understate what a stand can reach.
export function buildStandBaselines(matches: { format: string | null; stands: Breakthrough[] }[]): StandBaselines {
  const buckets = new Map<string, number[]>()
  const add = (key: string, runs: number) => {
    const list = buckets.get(key) ?? []
    list.push(runs)
    buckets.set(key, list)
  }
  for (const m of matches) {
    const f = normFormat(m.format)
    for (const s of m.stands) {
      if (s.unbroken) continue
      const g = standGroup(s.wicketNumber)
      add(`all|${g}`, s.runs)
      if (f) add(`${f}|${g}`, s.runs)
    }
  }
  const out: StandBaselines = {}
  buckets.forEach((runs, key) => { out[key] = summarise(runs) })
  return out
}

export function lookupBaseline(b: StandBaselines | null | undefined, format: string | null | undefined, wicketNumber: number): StandBaseline | null {
  if (!b) return null
  const g = standGroup(wicketNumber)
  const f = normFormat(format)
  const specific = f ? b[`${f}|${g}`] : undefined
  if (specific && specific.n >= MIN_BASELINE_SAMPLE) return specific
  return b[`all|${g}`] ?? null
}

export function classifyStand(
  b: StandBaselines | null | undefined, format: string | null | undefined, wicketNumber: number, runs: number,
): { big: boolean; abovePar: number } {
  const base = lookupBaseline(b, format, wicketNumber)
  if (!base) return { big: false, abovePar: 0 }
  return { big: runs >= base.p75, abovePar: runs - base.mean }
}
