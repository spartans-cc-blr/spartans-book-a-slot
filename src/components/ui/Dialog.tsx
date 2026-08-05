// src/components/ui/Dialog.tsx
//
// Shared modal dialog. Styled to match the site's actual shipped theme
// (ink/gold dark tokens — see tailwind.config.ts), not the Warm Light
// palette described in ui-theme.md, which is approved but not yet rolled
// out across pages (see that doc's "Status" line). Once that migration
// happens this component's tokens should move with it.
'use client'

import { useEffect } from 'react'

interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  actions?: React.ReactNode
  closeOnOverlayClick?: boolean
}

export function Dialog({ open, onClose, title, children, actions, closeOnOverlayClick = true }: DialogProps) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-8"
      onMouseDown={e => {
        if (closeOnOverlayClick && e.target === e.currentTarget) onClose()
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'dialog-title' : undefined}
        className="relative bg-ink-2 border border-gold-dim rounded-lg shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
      >
        {title && (
          <div className="px-5 py-4 border-b border-ink-5 flex items-start justify-between gap-4">
            <h2 id="dialog-title" className="font-cinzel text-base font-semibold text-parchment">
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-zinc-500 hover:text-parchment transition-colors text-xl leading-none -mt-0.5"
            >
              ×
            </button>
          </div>
        )}
        <div className="px-5 py-5">{children}</div>
        {actions && (
          <div className="px-5 py-4 border-t border-ink-5 flex items-center justify-end gap-3">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
