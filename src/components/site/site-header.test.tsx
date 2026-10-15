import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SiteHeader } from "./site-header"

describe("SiteHeader (11.1)", () => {
  it("ha i collegamenti a tipologie, galleria, contatti e al preventivo", () => {
    render(<SiteHeader />)
    const nav = screen.getByRole("navigation", { name: "Principale" })
    expect(within(nav).getByRole("link", { name: "Pergole" }).getAttribute("href")).toBe("/pergole")
    expect(within(nav).getByRole("link", { name: "Galleria" }).getAttribute("href")).toBe("/galleria")
    expect(within(nav).getByRole("link", { name: "Contatti" }).getAttribute("href")).toBe("/contatti")
    expect(within(nav).getByRole("link", { name: "Richiedi preventivo" }).getAttribute("href")).toBe("/preventivo")
    expect(screen.getByRole("link", { name: /pagina iniziale/ }).getAttribute("href")).toBe("/")
  })

  it("il menu stretto si apre e si chiude con Esc", () => {
    render(<SiteHeader />)
    const button = screen.getByRole("button", { name: "Menu" })
    expect(button.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByRole("navigation", { name: "Menu" })).toBeNull()
    fireEvent.click(button)
    expect(button.getAttribute("aria-expanded")).toBe("true")
    const menu = screen.getByRole("navigation", { name: "Menu" })
    expect(within(menu).getByRole("link", { name: "Richiedi preventivo" }).getAttribute("href")).toBe("/preventivo")
    fireEvent.keyDown(window, { key: "Escape" })
    expect(button.getAttribute("aria-expanded")).toBe("false")
  })

  it("offre il salto al contenuto", () => {
    render(<SiteHeader />)
    expect(screen.getByRole("link", { name: "Vai al contenuto" }).getAttribute("href")).toBe("#contenuto")
  })
})
