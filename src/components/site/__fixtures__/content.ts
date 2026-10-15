import type { SiteContent, SiteTypology } from "@/server/site/content"

/** Dati finti per i test dom del sito (nessun database). */
export const DRAWING = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" role="img" aria-label="Disegno di prova"><rect width="10" height="10"/></svg>'

export function fakeTypology(over: Partial<SiteTypology> = {}): SiteTypology {
  return {
    slug: "autoportante-bifalda",
    seoSlug: "pergola-bifalda",
    title: "Pergola bifalda",
    tagline: "Libera in giardino, con il tetto a capanna",
    description: "Due falde su quattro pilastri.",
    category: "autoportante",
    categoryLabel: "Autoportanti",
    tags: ["bifalda"],
    heroImage: null,
    gallery: [],
    drawingSvg: DRAWING,
    features: ["Larghezza da 2,00 a 7,00 m"],
    fromPrice: { totalCents: 789_000, widthMm: 5000, depthMm: 4000, heightMm: 2900, presetName: "Bifalda libera", includes: ["Struttura in legno"], finish: "Abete lamellare" },
    ...over,
  }
}

export function fakeContent(over: Partial<SiteContent> = {}): SiteContent {
  return {
    typologies: [
      fakeTypology(),
      fakeTypology({ slug: "addossata-monofalda", seoSlug: "pergola-addossata", title: "Pergola addossata", category: "addossata", categoryLabel: "Addossate al muro", fromPrice: null }),
    ],
    gallery: [
      { kind: "drawing", svg: DRAWING, caption: "Pergola bifalda, Bifalda libera", size: "5,00 × 4,00 m" },
      { kind: "image", src: "/galleria/esempio.jpg", alt: "Pergola in larice in un giardino", caption: "Pergola bifalda" },
    ],
    source: "archivio",
    ...over,
  }
}
