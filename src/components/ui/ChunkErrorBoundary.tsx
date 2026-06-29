'use client'
// src/components/ui/ChunkErrorBoundary.tsx
// Catches Next.js chunk-load failures after a new deployment and auto-refreshes.
// Avoids the "Application error: a client-side exception" blank screen.

import React from 'react'

interface State { hasError: boolean; refreshed: boolean }

export class ChunkErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false, refreshed: false }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const isChunkError =
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('Importing a module script failed')
    return { hasError: isChunkError }
  }

  componentDidCatch(error: Error) {
    const isChunkError =
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('Importing a module script failed')

    if (isChunkError && !this.state.refreshed) {
      this.setState({ refreshed: true })
      // Hard reload to pick up the new deployment's chunks
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError && !this.state.refreshed) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-ink-1">
          <p className="font-rajdhani text-zinc-400 text-sm">
            Updating to latest version…
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
