// Scene 17–18: back-office (1440×810 @1.333).
import { setup } from "./lib.mjs";
const ONLY = process.argv.slice(2);
const want = (n) => !ONLY.length || ONLY.includes(n);
const s = await setup({ auth: true, width: 1440, height: 810, dsf: 4 / 3 });
const { page: p } = s;
const dialog = () => p.getByRole("dialog");

if (want("s17")) {
  await s.goto("/admin/listino", { waitMs: 1200 });
  {
    // ripristino fuori camera del prezzo azzerato da una prova precedente
    const sec0 = p.getByText("Prezzi del legno al m³", { exact: true }).locator("xpath=ancestor::*[.//table][1]");
    const pr0 = sec0.locator("table input:not([type=checkbox])").nth(2);
    const v0 = parseFloat((await pr0.inputValue()).replace(/\./g, "").replace(",", ".")) || 0;
    console.log("valore iniziale", v0);
    if (v0 < 1) {
      await pr0.fill("820"); await pr0.press("Tab");
      await sec0.getByRole("button", { name: "Salva nella bozza" }).first().click(); await s.wait(1500);
      await p.getByRole("button", { name: "Pubblica" }).first().click(); await s.wait(1000);
      await dialog().getByRole("button", { name: /^Pubblica v/ }).click(); await s.wait(1500);
      await dialog().getByRole("button", { name: "Chiudi" }).click().catch(() => {});
      await s.goto("/admin/listino", { waitMs: 1200 });
    }
  }
  await s.start("s17-listino");
  await s.wait(600);
  for (const t of ["Lavorazioni", "Montaggio", "Legno e lunghezze"]) await s.click(p.getByRole("link", { name: t, exact: true }).or(p.getByRole("tab", { name: t, exact: true })).first(), { ms: 500, after: 800 });
  const sec = p.getByText("Prezzi del legno al m³", { exact: true }).locator("xpath=ancestor::*[.//table][1]");
  await sec.scrollIntoViewIfNeeded();
  await s.scrollToEl(p.getByText("Prezzi del legno al m³", { exact: true }), { ms: 900, offset: 140 });
  const price = sec.locator("table input:not([type=checkbox])").nth(2);
  const old = parseFloat((await price.inputValue()).replace(/\./g, "").replace(",", ".")) || 820;
  console.log("prezzo precedente", old);
  await s.type(price, String(Math.round(old * 1.06 / 10) * 10), { delay: 120, after: 400 });
  await s.hover(sec.getByRole("button", { name: "Esporta CSV" }), 600);
  await s.wait(300);
  await s.hover(sec.getByRole("button", { name: "Importa CSV" }), 500);
  await s.click(sec.getByRole("button", { name: "Salva nella bozza" }).first(), { after: 1500 });
  await s.scroll(-2000, 900);
  await s.wait(500);
  // simulatore
  await s.click(p.getByRole("link", { name: "Simula", exact: true }).first(), { after: 1000 });
  await p.waitForURL("**/admin/simula**").catch(() => {});
  await s.wait(500);
  const sel = p.locator("select").filter({ has: p.locator("option", { hasText: "Pergola addossata 3×4" }) }).first();
  await s.click(sel, { after: 200 });
  await sel.selectOption({ label: "Pergola addossata 3×4" });
  await s.wait(300);
  await s.type(p.getByLabel("CAP di consegna"), "37026", { delay: 80, after: 300 });
  await p.getByLabel("Specie").selectOption({ label: "Larice" }).catch((e) => console.log("specie", e.message));
  await s.hover(p.getByLabel("Specie"), 400).catch(() => {});
  await p.getByLabel("Qualità").selectOption({ label: "Massello (bilama/uso Fiume)" }).catch((e) => console.log("qualita", e.message));
  await s.hover(p.getByLabel("Qualità"), 400).catch(() => {});
  await s.click(p.getByRole("button", { name: "Simula", exact: true }).last(), { after: 1800 });
  await s.scrollToEl(p.getByText(/Differenza|Bozza|Attiva/).last(), { ms: 1300, offset: 200 }).catch(() => s.scroll(500, 1200));
  await s.wait(1800);
  // pubblicazione
  await s.click(p.getByRole("link", { name: "Listino", exact: true }).first(), { after: 1000 });
  await s.click(p.getByRole("button", { name: "Pubblica" }).first(), { after: 1300 });
  await s.hover(dialog().locator("input[type=date]"), 500).catch(() => {});
  await dialog().locator("input[type=date]").fill("2026-11-01").catch((e) => console.log("data", e.message));
  await s.wait(400);
  await s.hover(dialog().getByText(/differenz/).first(), 600).catch(() => {});
  await s.wait(1200);
  await s.click(dialog().getByRole("button", { name: /^Pubblica v/ }), { after: 2200 });
  await s.stop();
}

if (want("s18")) {
  await s.goto("/admin/listino/complicazioni", { waitMs: 1200 });
  await s.start("s18-backoffice");
  await s.wait(500);
  await s.scrollToEl(p.getByText(/^Se deviazione dallo squadro/).first(), { ms: 1000, offset: 330 });
  await s.hover(p.getByText(/^Se deviazione dallo squadro/).first(), 700);
  await s.wait(700);
  await s.scrollToEl(p.getByText(/^Se dislivello del pavimento/).first(), { ms: 1200, offset: 330 });
  await s.hover(p.getByText(/^Se dislivello del pavimento/).first(), 700);
  await s.wait(1300);
  for (const [tab, dy] of [["Regole", 500], ["Tipologie", 700], ["Utenti", 0], ["Registro", 0]]) {
    await s.click(p.getByRole("link", { name: tab, exact: true }).first(), { ms: 600, after: 900 });
    if (dy) await s.scroll(dy, 1400);
    await s.wait(dy ? 500 : 1200);
  }
  await s.hover(p.getByText(/pubblicazione · Listino/).first(), 800).catch(() => {});
  await s.wait(1500);
  await s.stop();
}
await s.browser.close();
