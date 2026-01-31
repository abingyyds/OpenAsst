'use client'

import { useEffect } from 'react'

interface KeyboardShortcut {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  callback: () => void
  description: string
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const ctrlOrMeta = shortcut.ctrlKey || shortcut.metaKey
        const matchesCtrl = ctrlOrMeta ? (e.ctrlKey || e.metaKey) : true
        const matchesShift = shortcut.shiftKey ? e.shiftKey : !e.shiftKey
        const matchesKey = e.key.toLowerCase() === shortcut.key.toLowerCase()

        if (matchesCtrl && matchesShift && matchesKey) {
          e.preventDefault()
          shortcut.callback()
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts])
}
