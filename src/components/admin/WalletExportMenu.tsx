'use client'
// Top-right "⬇ Export" menu on /admin/wallet — see features/wallet-ledger.md
// §16. A single download link, not a fetch+blob: GET /api/admin/wallet/export
// already sets Content-Disposition: attachment, so a plain <a href> lets the
// browser handle the download directly, same-origin session cookie and all.

import { useEffect, useRef, useState } from 'react'

export function WalletExportMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="font-rajdhani text-xs font-bold tracking-wide border border-[#D4C9B0] dark:border-ink-5 hover:border-gold-dim text-[#44403C] dark:text-zinc-300 hover:text-amber-700 dark:hover:text-gold px-3 py-2 rounded transition-colors flex items-center gap-1.5"
      >
        ⬇ Export <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 top-full right-0 mt-1 w-72 bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded shadow-xl overflow-hidden">
          <a
            href="/api/admin/wallet/export"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 font-rajdhani text-sm text-[#44403C] dark:text-zinc-300 hover:bg-parchment-2 dark:hover:bg-ink-4 hover:text-amber-700 dark:hover:text-gold transition-colors"
          >
            📊 Wallet Report (.xlsx)
            <span className="block font-rajdhani text-xs text-[#78716C] dark:text-zinc-500 mt-0.5">
              Summary sheet (player + balance, with KPI tiles) · Detailed sheet (player, transaction, running total)
            </span>
          </a>
        </div>
      )}
    </div>
  )
}
