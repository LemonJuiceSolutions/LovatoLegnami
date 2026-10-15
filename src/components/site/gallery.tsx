import Image from "next/image"
import { cn } from "@/lib/utils"

/** Elemento della galleria: foto caricata dall'ufficio o disegno generato dal modello. */
export type GalleryItem =
  | { readonly kind: "image"; readonly src: string; readonly alt: string; readonly caption: string }
  | { readonly kind: "drawing"; readonly svg: string; readonly caption: string; readonly size: string | null }

/**
 * Galleria: le foto passano da `next/image` (ottimizzate, riquadro 4:3 con dimensioni
 * dichiarate, nessuno spostamento del layout); i disegni sono SVG generati dal server
 * su carta millimetrata. Nessuna foto di terzi: finché l'ufficio non carica le sue,
 * la galleria mostra i disegni delle configurazioni reali.
 */
export function Gallery({ items, className }: { items: readonly GalleryItem[]; className?: string }) {
  if (items.length === 0) return <p className="text-muted-foreground">Le prime realizzazioni arriveranno presto.</p>
  return (
    <ul className={cn("grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {items.map((item, i) => (
        <li key={i}>
          <figure>
            <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--site-radius)] border border-border/80">
              {item.kind === "image" ? (
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                  unoptimized={/^https:\/\//.test(item.src)}
                />
              ) : (
                <div className="site-drafting site-drawing absolute inset-0 p-6 text-foreground" dangerouslySetInnerHTML={{ __html: item.svg }} />
              )}
            </div>
            <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4">
              <span className="font-medium">{item.caption}</span>
              {item.kind === "drawing" && item.size && <span className="text-muted-foreground">{item.size}</span>}
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  )
}
