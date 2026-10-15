import Link from "next/link"

/** Invito all'azione su fascia verde bosco con un listello di venatura in testa. */
export function Cta({ title, text, href, label }: { title: string; text: string; href: string; label: string }) {
  return (
    <section aria-label={title} className="site-container py-10 md:py-16">
      <div className="overflow-hidden rounded-[calc(var(--site-radius)*2)] bg-[hsl(156_54%_19%)] text-[hsl(90_18%_96%)]">
        <div className="site-grain h-3" aria-hidden="true" />
        <div className="flex flex-col gap-8 px-6 py-12 md:flex-row md:items-end md:justify-between md:px-14 md:py-16">
          <div className="max-w-[36rem]">
            <h2 className="site-display site-h2">{title}</h2>
            <p className="mt-4 text-[1.125rem] text-[hsl(90_18%_96%/0.85)]">{text}</p>
          </div>
          <Link href={href} className="site-btn shrink-0 bg-[hsl(90_18%_96%)] text-[hsl(156_54%_16%)] hover:bg-white">
            {label}
          </Link>
        </div>
      </div>
    </section>
  )
}
