// Scene 03–07: wizard del preventivo su telefono (390×844 @2), con invio di una richiesta demo.
import { setup } from "./lib.mjs";
import { readFileSync } from "node:fs";
const only = process.argv[2]; // per prove: "dry" = non invia
const s = await setup({ mobile: true });
const { page } = s;
const next = () => page.locator("button").filter({ hasText: /^(Avanti|Vedi il prezzo|Richiedi preventivo)/ }).last();
const field = (label) => page.getByLabel(label, { exact: true }).and(page.locator("input[type=text], input:not([type]), input[inputmode]")).first();

await s.goto("/preventivo", { waitMs: 1500 });

// ---------- s03: modello + misure
await s.start("s03-wizard-modello");
await s.wait(900);
await s.click(page.getByRole("button", { name: "Addossate al muro" }).first(), { after: 900 }).catch(() => s.wait(500));
await s.click(page.getByRole("button", { name: "Tutti i modelli" }).first(), { after: 700 }).catch(() => {});
await s.scroll(380, 1200);
await s.wait(500);
await s.click(page.locator("text=Scegli questo modello").first(), { after: 1200 });
await page.waitForURL("**/misure");
await s.wait(600);
await s.type(field("Larghezza"), "550", { delay: 160, after: 900 });
await s.scrollToEl(page.locator("text=Come sarà fatta").first(), { ms: 1200, offset: 260 });
await s.wait(1300);
await s.stop();

// ---------- s04: spazio
await s.click(next(), { after: 1200 });
await page.waitForURL("**/spazio");
await s.start("s04-wizard-spazio");
await s.wait(500);
await s.scrollToEl(page.locator("text=Il muro è dritto?").first(), { ms: 650, offset: 90 });
await s.click(page.locator("text=Non proprio").first(), { after: 350 });
await s.scrollToEl(page.locator("text=muro di casa").first(), { ms: 700, offset: 70 });
await s.wait(500);
await s.scrollToEl(page.locator("text=Misura i quattro lati").first(), { ms: 600, offset: 60 });
const vals = [["Fronte (lato lontano dal muro)", 550], ["Lungo il muro", 550], ["Lato sinistro", 300], ["Lato destro", 315],
  ["Diagonale: davanti a sinistra → muro a destra", 634], ["Diagonale: davanti a destra → muro a sinistra", 627]];
for (const [k, v] of vals) await s.type(page.getByLabel(k), v, { delay: 38, after: 40 });

await s.scrollToEl(page.locator("text=Il pavimento è in piano?").first(), { ms: 650, offset: 80 });
await s.click(page.locator("text=No, è in pendenza").first(), { after: 500 });
await s.type(page.getByLabel("Dislivello"), "6", { delay: 120, after: 300 });
await s.click(page.locator("text=Verso il fronte (lontano dal muro)").first(), { after: 500 });
await s.scrollToEl(page.locator("text=C'è qualcosa sul muro o sopra?").first(), { ms: 650, offset: 80 });
await s.click(page.getByRole("button", { name: "Aggiungi grondaia" }), { after: 600 });
await s.type(page.getByLabel("Altezza da terra"), "300", { delay: 60, after: 60 });
await s.type(page.getByLabel("Quanto sporge dal muro"), "35", { delay: 60, after: 150 });
await s.scrollToEl(page.locator("text=Dove si trova il cantiere?").first(), { ms: 700, offset: 80 });
await s.type(page.getByLabel("CAP del cantiere"), "37121", { delay: 90, after: 800 });
await s.stop();

// ---------- s05: finiture
await s.click(next(), { after: 900 });
await page.waitForURL("**/finiture");
await s.start("s05-wizard-finiture");
await s.wait(500);
await s.click(page.locator("text=Larice").first(), { after: 500 });
await s.click(page.locator("text=Lamellare").first(), { after: 400 });
await s.scrollToEl(page.locator("text=Come lo proteggiamo?").first(), { ms: 900, offset: 80 });
await s.click(page.locator("text=Impregnante colorato").first(), { after: 700 });
await s.scrollToEl(page.locator("text=Vuoi una copertura?").first(), { ms: 1000, offset: 80 });
await s.click(page.locator("text=Policarbonato alveolare 16 mm").first(), { after: 1000 });
await s.stop();

// ---------- s06: riepilogo
await s.click(next(), { after: 300 });
await page.waitForURL("**/riepilogo");
await s.start("s06-wizard-riepilogo");
await s.wait(2600);
// gira la pergola
const canvas = page.locator("canvas").first();
const bb = await canvas.boundingBox();
if (bb) await s.drag(bb.x + bb.width * 0.3, bb.y + bb.height * 0.55, bb.x + bb.width * 0.75, bb.y + bb.height * 0.5, 1800);
await s.wait(900);
await s.scrollToEl(page.locator("text=Misure finali").first(), { ms: 1300, offset: 100 });
await s.wait(1200);
await s.scrollToEl(page.locator("text=Da sapere").first(), { ms: 1200, offset: 100 });
await s.wait(1600);
await s.scrollToEl(page.locator("text=IVA inclusa · tra").first(), { ms: 1300, offset: 160 });
await s.wait(1800);
await s.wait(600);
await s.stop();

// ---------- s07: contatti e invio
await s.click(next(), { after: 300 });
await page.waitForURL("**/contatti");
await s.start("s07-wizard-contatti");
await s.wait(500);
await s.type(page.getByLabel("Nome e cognome"), "Mario Rossi", { delay: 28, after: 100 });
await s.type(page.getByLabel("Telefono"), "333 000 0000", { delay: 28, after: 100 });
await s.type(page.getByLabel("Email"), "mario.rossi@example.com", { delay: 22, after: 100 });
await s.type(page.getByLabel("Comune del cantiere"), "Verona", { delay: 30, after: 100 });
await s.type(page.locator("#contatti-notes"), "Muro di casa esposto a sud.", { delay: 22, after: 200 });
await s.scrollToEl(page.locator("text=Foto dello spazio").first(), { ms: 800, offset: 120 });
await s.hover(page.locator("text=Aggiungi foto").first(), 600);
await page.setInputFiles("#contatti-photos", new URL("./muro-cliente.jpg", import.meta.url).pathname);
await s.wait(800);
await s.scrollToEl(page.locator("#contatti-consent"), { ms: 700, offset: 300 });
await s.click(page.locator("label[for=contatti-consent], #contatti-consent").first(), { after: 500 });
if (only !== "dry") {
  await s.click(page.getByRole("button", { name: "Invia la richiesta" }), { after: 300 });
  await page.waitForURL("**/grazie**", { timeout: 30000 });
  await s.wait(2600);
}
await s.stop();
console.log("URL finale", page.url());
await s.browser.close();
