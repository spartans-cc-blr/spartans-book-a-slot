import { describe, it, expect } from 'vitest'
import { recordNavigation, canGoBack, EMPTY_NAV_HISTORY } from './navHistory'

describe('recordNavigation', () => {
  it('starts with no history on the first page', () => {
    const s = recordNavigation(EMPTY_NAV_HISTORY, '/team-stats')
    expect(s).toEqual({ stack: ['/team-stats'], pointer: 0 })
    expect(canGoBack(s)).toBe(false)
  })
  it('pushes a new page and can go back', () => {
    let s = recordNavigation(EMPTY_NAV_HISTORY, '/team-stats?by=opponent')
    s = recordNavigation(s, '/matches/history/abc')
    expect(canGoBack(s)).toBe(true)
    expect(s.pointer).toBe(1)
  })
  it('recognises a back navigation and a forward one', () => {
    let s = recordNavigation(EMPTY_NAV_HISTORY, '/team-stats?by=opponent')
    s = recordNavigation(s, '/matches/history/abc')
    s = recordNavigation(s, '/team-stats?by=opponent')      // back
    expect(s.pointer).toBe(0)
    expect(canGoBack(s)).toBe(false)
    s = recordNavigation(s, '/matches/history/abc')          // forward
    expect(s.pointer).toBe(1)
    expect(s.stack.length).toBe(2)
  })
  it('truncates forward entries when pushing from the middle', () => {
    let s = recordNavigation(EMPTY_NAV_HISTORY, '/a')
    s = recordNavigation(s, '/b')
    s = recordNavigation(s, '/a')   // back to /a
    s = recordNavigation(s, '/c')   // new push — /b is discarded
    expect(s.stack).toEqual(['/a', '/c'])
    expect(s.pointer).toBe(1)
  })
  it('ignores a repeat of the current URL', () => {
    let s = recordNavigation(EMPTY_NAV_HISTORY, '/a')
    const again = recordNavigation(s, '/a')
    expect(again).toBe(s)
  })
  it('treats a query-only change on the same page as a replace', () => {
    let s = recordNavigation(EMPTY_NAV_HISTORY, '/captains-corner')
    s = recordNavigation(s, '/team-stats?year=all&opponent=id:x')
    s = recordNavigation(s, '/team-stats?year=all&opponent=id:x&by=year')
    expect(s.stack).toEqual(['/captains-corner', '/team-stats?year=all&opponent=id:x&by=year'])
    expect(s.pointer).toBe(1)
    s = recordNavigation(s, '/captains-corner')   // back lands on the origin page
    expect(s.pointer).toBe(0)
  })
  it('never claims history on a cold open followed by filter changes', () => {
    let s = recordNavigation(EMPTY_NAV_HISTORY, '/leaderboard?ground=g1')
    s = recordNavigation(s, '/leaderboard?ground=g1&category=batting')
    expect(canGoBack(s)).toBe(false)
  })
})
