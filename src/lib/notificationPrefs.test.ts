import { describe, expect, it } from 'vitest'
import {
  NUDGE_THEME_KEY, PREF_DEFS, isNewMatchMuted, isNudgeDayMuted, isNudgeThemeMuted,
  isValidPrefKey, tournamentPrefKey,
} from './notificationPrefs'

const TID = '123e4567-e89b-12d3-a456-426614174000'

describe('notification preference keys', () => {
  it('accepts registered keys and well-formed tournament keys only', () => {
    expect(isValidPrefKey('nudge_habitual')).toBe(true)
    expect(isValidPrefKey(tournamentPrefKey(TID))).toBe(true)
    expect(isValidPrefKey('newmatch_t:not-a-uuid')).toBe(false)
    expect(isValidPrefKey('wallet_debit')).toBe(false)
    expect(isValidPrefKey('squad_announced')).toBe(false)
  })

  it('every nudge theme maps to a registered key', () => {
    const keys = new Set(PREF_DEFS.map(d => d.key))
    for (const k of Object.values(NUDGE_THEME_KEY)) expect(keys.has(k)).toBe(true)
  })

  it('has no storable key for locked groups (squad, wallet)', () => {
    expect(PREF_DEFS.some(d => d.group === 'squad' || d.group === 'wallet')).toBe(false)
  })
})

describe('mute helpers', () => {
  it('reminder days: Sun–Tue use day keys, Wednesday is never a day mute', () => {
    const m = new Set(['nudge_day_mon', 'nudge_day_sun'])
    expect(isNudgeDayMuted(0, m)).toBe(true)
    expect(isNudgeDayMuted(1, m)).toBe(true)
    expect(isNudgeDayMuted(2, m)).toBe(false)
    expect(isNudgeDayMuted(3, new Set(['nudge_deadline']))).toBe(false)
  })

  it('theme mute covers both reactivation themes with one key', () => {
    const m = new Set(['nudge_comeback'])
    expect(isNudgeThemeMuted('reactivation_1', m)).toBe(true)
    expect(isNudgeThemeMuted('reactivation_2', m)).toBe(true)
    expect(isNudgeThemeMuted('habitual', m)).toBe(false)
  })

  it('new-match alert is muted by the master switch or the tournament', () => {
    expect(isNewMatchMuted(new Set(), TID)).toBe(false)
    expect(isNewMatchMuted(new Set(['newmatch']), TID)).toBe(true)
    expect(isNewMatchMuted(new Set([tournamentPrefKey(TID)]), TID)).toBe(true)
    expect(isNewMatchMuted(new Set([tournamentPrefKey('223e4567-e89b-12d3-a456-426614174000')]), TID)).toBe(false)
  })
})
