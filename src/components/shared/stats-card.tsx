"use client"

import * as React from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface StatsCardProps {
  icon: LucideIcon
  title: string
  count: number | string
  href?: string
  className?: string
}

export function StatsCard({
  icon: Icon,
  title,
  count,
  href,
  className,
}: StatsCardProps) {
  const content = (
    <Card
      className={cn(
        "transition-all hover:shadow-md",
        href && "cursor-pointer hover:border-primary/50",
        className
      )}
    >
      <CardContent className="flex items-center gap-4 p-6">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{count}</p>
        </div>
      </CardContent>
    </Card>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}
