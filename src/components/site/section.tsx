import { cn } from "@/lib/utils"

/** Identificativo stabile dal titolo (stesso valore sul server e nel browser). */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/** Sezione della pagina con titolo (h2) e introduzione facoltativa, allineata a sinistra. */
export function Section({
  title,
  intro,
  action,
  children,
  className,
  id,
}: {
  title: string
  intro?: React.ReactNode
  /** Collegamento accanto al titolo (es. "Vedi tutte le pergole"). */
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  id?: string
}) {
  const headingId = `titolo-${id ?? slugify(title)}`
  return (
    <section id={id} aria-labelledby={headingId} className={cn("site-container py-16 md:py-24", className)}>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-x-10 gap-y-4 md:mb-14">
        <div className="max-w-[44rem]">
          <h2 id={headingId} className="site-display site-h2">
            {title}
          </h2>
          {intro && <div className="mt-4 text-[1.125rem] text-muted-foreground">{intro}</div>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
