"use client"

import * as React from "react"
import { DEFAULT_PALETTE, paletteFromTokens, type ViewerPalette } from "./theme-colors"

function readPalette(): ViewerPalette {
  if (typeof window === "undefined") return DEFAULT_PALETTE
  const style = getComputedStyle(document.documentElement)
  return paletteFromTokens((t) => style.getPropertyValue(`--${t}`))
}

/**
 * Tavolozza del visualizzatore dalle variabili CSS del tema; si aggiorna
 * quando cambiano `class`/`style`/`data-theme` di `<html>` o `<body>`
 * (es. attivazione di `.dark`).
 */
export function useViewerPalette(): ViewerPalette {
  const [palette, setPalette] = React.useState<ViewerPalette>(readPalette)

  React.useEffect(() => {
    const update = () =>
      setPalette((prev) => {
        const next = readPalette()
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next
      })
    update()
    const observer = new MutationObserver(update)
    const options = { attributes: true, attributeFilter: ["class", "style", "data-theme"] }
    observer.observe(document.documentElement, options)
    observer.observe(document.body, options)
    const media = window.matchMedia?.("(prefers-color-scheme: dark)")
    media?.addEventListener?.("change", update)
    return () => {
      observer.disconnect()
      media?.removeEventListener?.("change", update)
    }
  }, [])

  return palette
}
