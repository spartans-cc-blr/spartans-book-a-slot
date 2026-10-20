// Instant placeholder shown by each route's loading.tsx while the server
// renders the real page (streams immediately, even on a cold start).
// Pure server component, theme-aware via parchment/ink tokens.

type Variant = 'cards' | 'table' | 'list'

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded bg-[#E2DACE] dark:bg-zinc-700/70 ${className}`} />
}

function CardBlock() {
  return (
    <div className="rounded-xl border border-[#D4C9B0] dark:border-ink-5 bg-white dark:bg-ink-3 p-4 space-y-3">
      <div className="flex justify-between">
        <Bar className="h-3 w-24" />
        <Bar className="h-3 w-10" />
      </div>
      <Bar className="h-5 w-3/4" />
      <Bar className="h-3 w-1/2" />
      <div className="flex gap-2 pt-1">
        <Bar className="h-9 flex-1" />
        <Bar className="h-9 flex-1" />
        <Bar className="h-9 flex-1" />
        <Bar className="h-9 flex-1" />
      </div>
    </div>
  )
}

export function PageSkeleton({
  variant = 'cards',
  wide = false,
  title,
}: {
  variant?: Variant
  wide?: boolean
  title?: string
}) {
  return (
    <div className="min-h-screen bg-parchment dark:bg-ink" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading{title ? ` ${title}` : ''}…</span>
      {/* Same height as SiteNav so the page doesn't jump when it arrives */}
      <div className="h-14 border-b border-[#D4C9B0] dark:border-ink-5 bg-white dark:bg-ink-2" />
      {/* Branded loading cue: stays visible in dark mode, where the grey bars alone read as a black screen. */}
      <div className="fixed inset-0 z-10 flex items-center justify-center pointer-events-none">
        <img src="/images/logo-128.png" alt="" width={72} height={72} className="w-[72px] h-[72px] object-contain animate-pulse drop-shadow-lg" />
      </div>
      <div className={`animate-pulse px-5 md:px-8 lg:px-10 py-6 space-y-5 ${wide ? 'max-w-5xl' : 'max-w-2xl'}`}>
        <div className="space-y-2">
          <Bar className="h-7 w-48" />
          <Bar className="h-3 w-64 max-w-full" />
        </div>
        {variant === 'cards' && (
          <div className={wide ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'space-y-4'}>
            {Array.from({ length: wide ? 4 : 3 }).map((_, i) => <CardBlock key={i} />)}
          </div>
        )}
        {variant === 'table' && (
          <>
            <div className="flex gap-2 overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => <Bar key={i} className="h-8 w-20 shrink-0 rounded-full" />)}
            </div>
            <div className="rounded-xl border border-[#D4C9B0] dark:border-ink-5 bg-white dark:bg-ink-3 divide-y divide-[#E2DACE] dark:divide-ink-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <Bar className="h-8 w-8 rounded-full shrink-0" />
                  <Bar className="h-4 flex-1" />
                  <Bar className="h-4 w-12" />
                </div>
              ))}
            </div>
          </>
        )}
        {variant === 'list' && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-[#D4C9B0] dark:border-ink-5 bg-white dark:bg-ink-3 p-4 flex gap-3">
                <Bar className="h-10 w-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Bar className="h-4 w-2/3" />
                  <Bar className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
