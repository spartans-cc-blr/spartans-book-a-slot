export function ScheduleSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="flex gap-2 mb-4">
        {[1,2,3].map(i => <div key={i} className="h-7 w-24 bg-ink-4 rounded-full" />)}
      </div>
      <div className="h-14 bg-ink-3 rounded border border-ink-5" />
      <div className="flex gap-4 mb-5">
        {[1,2,3,4].map(i => <div key={i} className="h-4 w-16 bg-ink-4 rounded" />)}
      </div>
      {[0,1].map(i => (
        <div key={i} className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
          <div className="h-16 bg-ink-4 border-b border-ink-5" />
          <div className="h-14 bg-ink-3" />
        </div>
      ))}
    </div>
  )
}
