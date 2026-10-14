"use client"

import * as React from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface ColorPickerFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  id?: string
  className?: string
}

export function ColorPickerField({
  label,
  value,
  onChange,
  id,
  className,
}: ColorPickerFieldProps) {
  const inputId = id ?? `color-picker-${label.toLowerCase().replace(/\s+/g, "-")}`

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex items-center gap-3">
        <div
          className="h-8 w-8 rounded-md border border-input shadow-sm"
          style={{ backgroundColor: value || "#ffffff" }}
        />
        <Input
          id={inputId}
          type="color"
          value={value || "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-20 cursor-pointer p-1"
        />
        <Input
          type="text"
          value={value || "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="h-10 w-28 font-mono text-sm"
          maxLength={7}
        />
      </div>
    </div>
  )
}
