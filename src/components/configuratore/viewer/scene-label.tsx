"use client"

import * as React from "react"
import { Html } from "@react-three/drei"
import { cn } from "@/lib/utils"

/** Etichetta DOM ancorata a un punto della scena, con lo stile dei popover del tema. */
export function SceneLabel({
  position,
  children,
  className,
  muted = false,
}: {
  position: [number, number, number]
  children: React.ReactNode
  className?: string
  /** Stile tenue (quote secondarie). */
  muted?: boolean
}) {
  return (
    <Html position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div
        className={cn(
          "whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium tabular-nums shadow-sm",
          muted ? "bg-background/80 text-muted-foreground" : "bg-popover text-popover-foreground",
          className
        )}
      >
        {children}
      </div>
    </Html>
  )
}
