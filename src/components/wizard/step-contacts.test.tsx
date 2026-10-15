import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { axeViolations } from "@/test/axe"
import { testStore, wizardData } from "./__fixtures__/data"
import { preparePhotos, ONLY_IMAGES, TOO_MANY } from "./photos"
import { ThankYou } from "./thank-you"
import { PreventivoWizard } from "./wizard"

const nav = vi.hoisted(() => ({ push: vi.fn(), search: new URLSearchParams() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  useSearchParams: () => nav.search,
}))

beforeEach(() => {
  nav.push.mockReset()
  nav.search = new URLSearchParams()
})

const estimateResponse = () =>
  new Response(
    JSON.stringify({
      quote: {
        status: "completo",
        priceList: { version: 1, effectiveFrom: "2026-01-01" },
        groups: [{ id: "struttura", label: "Struttura in legno", amountCents: 790_000 }],
        discountCents: 0,
        minimumAdjustmentCents: 0,
        taxableCents: 647_541,
        vatPct: 22,
        vatCents: 142_459,
        roundingCents: 0,
        totalCents: 790_000,
        range: { pct: 10, minCents: 711_000, maxCents: 869_000 },
        notes: [],
      },
      notes: [],
    }),
    { status: 200 },
  )

function fakeFetch(submit: () => Response = () => new Response(JSON.stringify({ code: "PRV-2026-00042", token: "tok_abc" }), { status: 201 })) {
  const submits: FormData[] = []
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) === "/api/preventivo") {
      submits.push(init!.body as FormData)
      return submit()
    }
    return estimateResponse()
  })
  return { fn: fn as unknown as typeof fetch, submits }
}

async function renderContacts(fetcher: typeof fetch) {
  const store = testStore()
  store.getState().chooseTypology("autoportante-bifalda", null)
  store.getState().setFinishes({ treatment: "impregnante-tinta", tint: "noce" })
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(<PreventivoWizard data={wizardData()} step="contatti" store={store} fetcher={fetcher} />)
  })
  return { ...utils, store }
}

function fillValid() {
  fireEvent.change(screen.getByLabelText("Nome e cognome"), { target: { value: "Maria Rossi" } })
  fireEvent.change(screen.getByLabelText("Telefono"), { target: { value: "333 1234567" } })
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "maria@example.it" } })
  fireEvent.change(screen.getByLabelText("CAP del cantiere"), { target: { value: "37026" } })
  fireEvent.change(screen.getByLabelText("Comune del cantiere"), { target: { value: "Pescantina" } })
}

describe("passo 6 contatti (12.7)", () => {
  it("consenso mancante ⇒ invio bloccato con il messaggio sul campo consenso", async () => {
    const f = fakeFetch()
    await renderContacts(f.fn)
    fillValid()
    fireEvent.click(screen.getByRole("button", { name: /Invia la richiesta/ }))
    const consent = screen.getByLabelText(/Acconsento al trattamento/)
    expect(consent.getAttribute("aria-invalid")).toBe("true")
    expect(document.getElementById(consent.getAttribute("aria-describedby")!)!.textContent).toMatch(/devi accettare l'informativa/)
    expect(f.submits).toHaveLength(0)
  })

  it("PDF come foto ⇒ 'sono ammesse solo immagini'", async () => {
    await renderContacts(fakeFetch().fn)
    const input = document.getElementById("contatti-photos") as HTMLInputElement
    const pdf = new File(["%PDF-1.7"], "planimetria.pdf", { type: "application/pdf" })
    await act(async () => {
      fireEvent.change(input, { target: { files: [pdf] } })
    })
    expect((await screen.findByRole("alert")).textContent).toMatch(/ammesse solo immagini/i)
  })

  it("invio valido ⇒ multipart con consenso, versione, tinta nelle note e conferma con il codice", async () => {
    const f = fakeFetch()
    const { store } = await renderContacts(f.fn)
    fillValid()
    fireEvent.click(screen.getByLabelText(/Acconsento al trattamento/))
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Invia la richiesta/ }))
    })
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/preventivo/grazie?c=PRV-2026-00042"))
    const request = JSON.parse(String(f.submits[0]!.get("request")))
    expect(request.customer).toEqual({ name: "Maria Rossi", email: "maria@example.it", phone: "333 1234567", cap: "37026", comune: "Pescantina" })
    expect(request.consent).toEqual({ accepted: true, version: "2026-10" })
    expect(request.website).toBe("")
    expect(request.notes).toMatch(/Tinta preferita: Noce/)
    expect(request.estimate.config.typology).toBe("autoportante-bifalda")
    expect(request.estimate.declared).toEqual({ access: "facile", cap: "37026" })
    expect(store.getState().submitted).toMatchObject({ code: "PRV-2026-00042", token: "tok_abc", email: "maria@example.it" })
    // le risposte restano fino alla pagina di conferma (che le azzera)
    expect(store.getState().answers.tipologia.slug).toBe("autoportante-bifalda")
  })

  it("errore del server sul campo email ⇒ messaggio sul campo", async () => {
    const f = fakeFetch(() => new Response(JSON.stringify({ error: "richiesta non valida", issues: [{ path: "customer.email", message: "indirizzo email non valido" }] }), { status: 400 }))
    await renderContacts(f.fn)
    fillValid()
    fireEvent.click(screen.getByLabelText(/Acconsento al trattamento/))
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Invia la richiesta/ }))
    })
    await waitFor(() => expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBe("true"))
    expect(nav.push).not.toHaveBeenCalled()
  })

  it("pagina di conferma: codice e riepilogo con il PDF", async () => {
    const store = testStore()
    store.getState().markSubmitted({ code: "PRV-2026-00042", token: "tok_abc", typologyTitle: "Pergola bifalda", measures: "Larghezza 500 cm", totalCents: 790_000, rangeCents: [711_000, 869_000], email: "maria@example.it" })
    nav.search = new URLSearchParams("c=PRV-2026-00042")
    store.getState().chooseTypology("autoportante-bifalda", null)
    render(<ThankYou store={store} />)
    expect(screen.getByTestId("codice").textContent).toBe("PRV-2026-00042")
    expect(store.getState().answers.tipologia.slug).toBeNull()
    expect(store.getState().submitted?.code).toBe("PRV-2026-00042")
    expect(screen.getByRole("link", { name: /Scarica il riepilogo PDF/ }).getAttribute("href")).toBe("/api/preventivo/tok_abc/pdf")
    expect(screen.getByText("7.900 €")).toBeTruthy()
  })

  it("accessibilità (axe)", async () => {
    const { container } = await renderContacts(fakeFetch().fn)
    expect(await axeViolations(container)).toEqual([])
  })
})

describe("foto (12.7)", () => {
  const img = (name = "a.jpg") => new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: "image/jpeg" })
  it("solo immagini, al massimo 5, ridimensionate", async () => {
    const resize = vi.fn(async () => new Blob([new Uint8Array(10)], { type: "image/jpeg" }))
    expect((await preparePhotos([new File(["x"], "a.pdf", { type: "application/pdf" })], 0, resize)).error).toBe(ONLY_IMAGES)
    expect((await preparePhotos([new File(["<svg/>"], "a.svg", { type: "image/svg+xml" })], 0, resize)).error).toBe(ONLY_IMAGES)
    expect((await preparePhotos([img(), img()], 4, resize)).error).toBe(TOO_MANY)
    const ok = await preparePhotos([img("Muro.HEIC")], 0, resize)
    expect(ok.error).toBeNull()
    expect(ok.photos[0]!.name).toBe("Muro.jpg")
    expect(resize).toHaveBeenCalledTimes(1)
  })
})
