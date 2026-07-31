'use client'

import type { RuleCheckItem } from '@/types'

const STATUS_STYLE: Record<RuleCheckItem['status'], { icon: string; text: string; border: string }> = {
  pass:     { icon: '✅', text: 'text-emerald-400', border: 'border-emerald-800' },
  warn:     { icon: '⚠️', text: 'text-yellow-400',  border: 'border-yellow-800' },
  fail:     { icon: '❌', text: 'text-red-400',     border: 'border-red-800' },
  override: { icon: '🔓', text: 'text-purple-400',  border: 'border-purple-800' },
  pending:  { icon: '⏳', text: 'text-zinc-600',    border: 'border-ink-5' },
}

interface RuleCheckStripProps {
  checks: RuleCheckItem[]
  /** rule -> admin-typed reason. Presence of a key means the rule is toggled overridden. */
  overrides: Record<string, string>
  onToggle: (rule: string) => void
  onReasonChange: (rule: string, reason: string) => void
}

/**
 * Admin-only, horizontal R1-R6 rule check row — placed directly above the
 * confirm/save button so pass/fail state is visible right where the admin
 * commits the booking. A failing rule can be overridden with a required,
 * permanently logged reason (booking_rule_overrides) — see
 * .claude/rules/architecture.md §7.
 */
export function RuleCheckStrip({ checks, overrides, onToggle, onReasonChange }: RuleCheckStripProps) {
  const failing = checks.filter(c => c.status === 'fail')
  const overriddenRules = checks.filter(c => c.rule in overrides)

  return (
    <div className="bg-ink-3 border border-ink-5 rounded p-4 space-y-3">
      <p className="font-cinzel text-xs text-gold">⚖ Rule Check</p>

      <div className="flex flex-wrap gap-2">
        {checks.map(c => {
          const overridden = c.rule in overrides
          const displayStatus: RuleCheckItem['status'] = overridden ? 'override' : c.status
          const s = STATUS_STYLE[displayStatus]
          return (
            <div key={c.rule} title={c.message}
              className={`flex items-center gap-1.5 border ${s.border} bg-ink-4 rounded-full pl-2.5 pr-1.5 py-1`}>
              <span className="text-xs leading-none">{s.icon}</span>
              <span className={`font-rajdhani text-xs font-bold ${s.text}`}>{c.rule}</span>
              {c.status === 'fail' && (
                <button type="button" onClick={() => onToggle(c.rule)}
                  className={`font-rajdhani text-[10px] font-bold uppercase tracking-wide ml-0.5 px-1.5 py-0.5 rounded transition-colors
                    ${overridden ? 'bg-purple-900/50 text-purple-300 hover:bg-purple-900/70' : 'bg-ink-5 text-zinc-400 hover:text-zinc-200'}`}>
                  {overridden ? 'Overridden ✕' : 'Override'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {failing.length > 0 && (
        <div className="space-y-1">
          {failing.map(c => (
            <p key={c.rule} className="font-rajdhani text-xs text-red-400">
              <span className="font-bold">{c.rule}:</span> {c.message}
            </p>
          ))}
        </div>
      )}

      {overriddenRules.length > 0 && (
        <div className="space-y-2 border-t border-ink-5 pt-3">
          <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-purple-400">
            🔓 Admin Override — reason required, logged permanently
          </p>
          {overriddenRules.map(c => (
            <div key={c.rule}>
              <label className="font-rajdhani text-xs text-zinc-500">{c.rule} — {c.label}</label>
              <textarea
                value={overrides[c.rule]}
                onChange={e => onReasonChange(c.rule, e.target.value)}
                rows={2}
                placeholder="Why are you overriding this rule? (min. 3 characters)"
                className="form-input resize-none mt-1"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Shared gate: a rule check row is all clear once every rule is pass/warn, or fail-but-overridden with a real reason. */
export function ruleChecksAllPassed(checks: RuleCheckItem[], overrides: Record<string, string>): boolean {
  return checks.every(c => {
    if (c.status === 'pass' || c.status === 'warn') return true
    if (c.status === 'fail') return (overrides[c.rule] ?? '').trim().length >= 3
    return false // pending
  })
}
