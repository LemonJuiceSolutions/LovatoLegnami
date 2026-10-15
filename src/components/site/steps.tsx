/** "Come funziona": i passi reali dal sito al cantiere (una sequenza, quindi numerata). */
export const HOW_IT_WORKS = [
  {
    title: "Scegli la forma",
    text: "Addossata al muro o libera in giardino: parti dalla pergola più vicina a quella che hai in mente.",
  },
  {
    title: "Inserisci le misure",
    text: "Larghezza, profondità e altezza, più quello che c'è intorno: muro, pavimento, grondaie, finestre.",
  },
  {
    title: "Vedi il prezzo indicativo",
    text: "Il calcolo usa il nostro listino: legno, lavorazioni, ferramenta, montaggio e trasporto, IVA inclusa.",
  },
  {
    title: "Sopralluogo e preventivo",
    text: "Veniamo a misurare sul posto e ti mandiamo il preventivo definitivo. Nessun impegno fino alla firma.",
  },
] as const

export function Steps({ steps = HOW_IT_WORKS }: { steps?: readonly { title: string; text: string }[] }) {
  return (
    <ol className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => (
        <li key={s.title} className="relative border-t-2 border-[hsl(var(--site-gold))] pt-6">
          <span aria-hidden="true" className="site-display block text-[3.25rem] leading-none text-[hsl(var(--site-gold-ink))]">
            {i + 1}
          </span>
          <h3 className="site-display site-h3 mt-4">{s.title}</h3>
          <p className="mt-3 text-muted-foreground">{s.text}</p>
        </li>
      ))}
    </ol>
  )
}
