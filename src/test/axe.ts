import axe from "axe-core"

/**
 * Violazioni WCAG 2.1 A/AA trovate da axe-core nel DOM di jsdom (test `dom`). Il
 * contrasto dei colori è escluso perché jsdom non calcola gli stili: lo verifica
 * `components/site/site-theme.test.ts` direttamente sui token del tema.
 */
export async function axeViolations(container: Element): Promise<string[]> {
  const result = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  })
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)
}
