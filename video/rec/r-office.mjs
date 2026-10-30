// Scena 09 (accesso e richieste, 1440×810 @1.333) e scena 15 (preventivo definitivo, 1920×1080).
import { setup } from "./lib.mjs";
const ONLY = process.argv.slice(2);
const want = (n) => !ONLY.length || ONLY.includes(n);
const RID = "41f5d606-4ee2-45da-8beb-c1fe4b7d6be5";

if (want("s09")) {
  const s = await setup({ width: 1440, height: 810, dsf: 4 / 3 });
  const { page: p } = s;
  await s.goto("/accesso", { waitMs: 800 });
  await s.start("s09-richieste");
  await s.wait(600);
  await s.type("#accesso-password-email", "tecnico@lemonjuicesolutions.it", { delay: 45, after: 150 });
  await s.type("#accesso-password", "DemoLocale-2026!", { delay: 40, after: 250 });
  await s.click(p.getByRole("button", { name: /^Accedi/ }).first(), { after: 300 });
  await p.waitForURL("**/dashboard**", { timeout: 20000 }).catch(() => {});
  await s.wait(800);
  await s.click(p.getByRole("link", { name: /^ADMIN$/i }).first(), { after: 600 });
  await p.waitForURL("**/admin**").catch(() => {});
  await s.click(p.getByRole("link", { name: "Richieste", exact: true }).first(), { after: 800 });
  await p.waitForURL("**/admin/richieste**").catch(() => {});
  await s.wait(500);
  await s.click(p.getByRole("link", { name: /PRV-2026-00001/ }).or(p.getByText("PRV-2026-00001")).first(), { after: 600 });
  await p.waitForURL(`**/admin/richieste/${RID}**`, { timeout: 5000 }).catch(() => s.goto(`/admin/richieste/${RID}`));
  await s.wait(900);
  await s.click(p.getByRole("button", { name: "Prendi in carico" }), { after: 1000 }).catch(() => {});
  await s.scroll(420, 1500);
  await s.wait(900);
  await s.scroll(-420, 1000);
  await s.click(p.getByRole("link", { name: "Apri nel configuratore" }).or(p.getByRole("button", { name: "Apri nel configuratore" })).first(), { after: 300 });
  await p.waitForURL("**/configuratore**").catch(() => {});
  await s.wait(5500);
  await s.stop();
  await s.ctx.storageState({ path: new URL("./state.json", import.meta.url).pathname });
  await s.browser.close();
}

if (want("s15")) {
  const s = await setup({ auth: true });
  const { page: p } = s;
  await s.goto(`/configuratore?richiesta=${RID}`, { waitMs: 7000 });
  await s.start("s15-definitivo");
  await s.wait(500);
  await s.click(p.getByRole("button", { name: "Salva preventivo definitivo" }), { after: 900 });
  const d = p.getByRole("dialog");
  await s.click(d.getByRole("button", { name: "Aggiungi voce" }), { after: 500 });
  await s.type("#manual-0-desc", "Smontaggio vecchia tettoia", { delay: 30, after: 100 });
  await s.type("#manual-0-amount", "180", { delay: 80, after: 300 });
  await s.click("#final-discount-kind", { after: 400 });
  await s.click(p.getByRole("option", { name: "Percentuale" }), { after: 300 });
  await s.type("#final-discount-value", "5", { delay: 80, after: 800 });
  await s.hover(d.getByText("Totale IVA inclusa").first(), 700);
  await s.wait(600);
  const send = d.getByRole("checkbox", { name: "Invia il preventivo al cliente" });
  await send.scrollIntoViewIfNeeded();
  if ((await send.getAttribute("aria-checked")) !== "true") await s.click(send, { after: 300 });
  const mark = d.getByRole("checkbox", { name: /preventivo inviato/ });
  if ((await mark.getAttribute("aria-checked")) !== "true") await s.click(mark, { after: 300 });
  await s.click(d.getByRole("button", { name: "Salva preventivo definitivo" }), { after: 2600 });
  await s.stop();
  await s.browser.close();
}
