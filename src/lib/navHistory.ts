// Pure reducer behind NavHistoryProvider — see features/back-navigation.md §2.
//
// Next's App Router has no API for "did this session navigate here", and
// `window.history.length` counts entries from before the app was opened,
// so the Hub keeps its own per-tab stack of visited URLs in sessionStorage
// and classifies each URL change as push / back / forward by comparing it
// to the neighbours of the current pointer. `canGoBack` is simply
// `pointer > 0`. The heuristic can misclassify a genuine forward
// navigation to the *same* URL as the previous entry as a "back" — the
// failure mode there is a pointer that's too low, i.e. BackButton falling
// back to its hardcoded parent link one step early. Never the reverse
// (claiming history exists when it doesn't), which is the case that would
// actually strand a standalone-PWA user.

export interface NavHistoryState {
  stack:   string[]
  pointer: number   // index into stack of the current URL; -1 when empty
}

export const EMPTY_NAV_HISTORY: NavHistoryState = { stack: [], pointer: -1 }

export function recordNavigation(state: NavHistoryState, url: string): NavHistoryState {
  const { stack, pointer } = state
  if (pointer >= 0 && stack[pointer] === url) return state                  // same page (re-render, hash change)
  if (pointer > 0 && stack[pointer - 1] === url) return { stack, pointer: pointer - 1 }   // back
  if (pointer + 1 < stack.length && stack[pointer + 1] === url) return { stack, pointer: pointer + 1 } // forward
  const next = stack.slice(0, pointer + 1)
  next.push(url)
  // Bound the stack — nobody navigates 200 pages deep in one tab, and
  // sessionStorage has a per-origin quota.
  const trimmed = next.length > 200 ? next.slice(next.length - 200) : next
  return { stack: trimmed, pointer: trimmed.length - 1 }
}

export function canGoBack(state: NavHistoryState): boolean {
  return state.pointer > 0
}
