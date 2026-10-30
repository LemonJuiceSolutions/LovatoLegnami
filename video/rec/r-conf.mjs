// Scene 10–14 e 16: configuratore (1920×1080) — tipologie, regole, ingombro, solidi, preventivo, export.
import { setup } from "./lib.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const ONLY = process.argv.slice(2);
const want = (n) => !ONLY.length || ONLY.includes(n);
const s = await setup({ auth: true });
const { page: p } = s;
const VIEW = new URL("./viewer/", import.meta.url).pathname;

const dialog = () => p.getByRole("dialog").or(p.getByRole("alertdialog")).first();
async function ripristina() {
  await p.getByRole("button", { name: "Ripristina" }).first().click();
  await dialog().getByRole("button", { name: "Ripristina" }).click();
  await s.wait(1500);
}
async function toAddossata() {
  await p.getByRole("button", { name: "Cambia tipologia" }).click();
  await s.wait(600);
  await dialog().getByText("Addossata monofalda", { exact: true }).first().click();
  await s.wait(1500);
  await p.keyboard.press("Escape").catch(() => {});
  await ripristina();
}
async function loadPreset(q, name, rec = false) {
  if (rec) {
    await s.click(p.getByRole("button", { name: "Esempi dal catalogo" }));
    await s.type("#preset-search", q, { delay: 70 });
    await s.click(dialog().getByText(name, { exact: true }).first(), { after: 300 });
  } else {
    await p.getByRole("button", { name: "Esempi dal catalogo" }).click();
    await p.fill("#preset-search", q);
    await dialog().getByText(name, { exact: true }).first().click();
  }
  await s.wait(2500);
}
const canvasBox = async () => p.locator("canvas").first().boundingBox();
async function orbit(dxFrac = 0.25, ms = 1800) {
  const bb = await canvasBox();
  const y = bb.y + bb.height * 0.55;
  await s.drag(bb.x + bb.width * 0.4, y, bb.x + bb.width * (0.4 + dxFrac), y - 30, ms);
}
async function zoomAt(x, y, steps, dir = -1) {
  await s.moveTo(x, y, 600);
  for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, dir * 100); await s.wait(70); }
}

await s.goto("/configuratore", { waitMs: 7000 });
await ripristina();

// ---------- s10 tipologie e preset
if (want("s10")) {
  await s.start("s10-tipologie-preset");
  await s.wait(700);
  await s.click(p.getByRole("button", { name: "Cambia tipologia" }), { after: 1000 });
  const d = dialog();
  for (const cat of ["Gazebo", "Carport", "Tutte"]) await s.click(d.getByRole("button", { name: cat, exact: true }).or(d.getByRole("tab", { name: cat, exact: true })).first(), { ms: 450, after: 650 });
  await s.hover(d.getByText("Telaio a giunti metallici").first(), 700);
  await s.wait(500);
  await p.keyboard.press("Escape"); await s.wait(500);
  await loadPreset("ottagonale", "Gazebo ottagonale Ø4000", true);
  await s.wait(1200);
  await orbit(0.3, 2200);
  await s.wait(1000);
  await s.stop();
}

// ---------- s11 regole e auto-dimensiona
if (want("s11")) {
  await toAddossata();
  await s.start("s11-regole");
  await s.wait(600);
  await s.type(p.getByLabel(/Profondità \(asse/).first(), "5000", { delay: 130, after: 200 });
  await p.keyboard.press("Tab");
  await s.wait(1600);
  await s.hover(p.getByText(/Luce eccessiva/).first(), 800);
  await s.wait(1000);
  await s.click(p.getByRole("button", { name: "Auto-dimensiona" }), { after: 1500 });
  await s.hover(dialog().getByText("120×240 mm").first(), 700).catch(() => {});
  await s.wait(700);
  await s.click(dialog().getByRole("button", { name: /Applica/ }), { after: 2200 });
  await s.stop();
}

// ---------- s12 ingombro
if (want("s12")) {
  await loadPreset("grondaia", "Monofalda con grondaia");
  await s.start("s12-ingombro");
  await s.wait(600);
  await s.type(p.getByLabel(/Altezza utile/).first(), "2700", { delay: 120, after: 200 });
  await p.keyboard.press("Tab");
  await s.wait(1300);
  await s.hover(p.getByText(/interferisce con grondaia/).first(), 700).catch(() => {});
  await s.wait(700);
  await s.click(p.getByRole("button", { name: "Adatta all'ingombro" }), { after: 1300 });
  await s.click(dialog().getByRole("button", { name: /Applica/ }), { after: 1400 });
  const pianta = p.getByRole("combobox").filter({ hasText: "Rettangolare" }).first();
  await pianta.scrollIntoViewIfNeeded();
  await s.click(pianta, { after: 400 });
  await s.click(p.getByRole("option", { name: "Fuori squadra – diagonali" }), { after: 600 });
  const F = +(await p.locator("#plan-front").inputValue());
  const S = +(await p.getByLabel("Fianco sinistro").inputValue());
  const dev = +(process.env.DEV || 100);
  await s.type(p.getByLabel("Lato al muro"), Math.round(Math.hypot(F, dev)), { delay: 60, after: 80 });
  await s.type(p.getByLabel("Fianco destro"), S + dev, { delay: 60, after: 80 });
  await s.type(p.getByLabel("Diagonale 1"), Math.round(Math.hypot(F, S + dev)), { delay: 60, after: 150 });
  await p.keyboard.press("Tab");
  await s.wait(900);
  await s.click(p.getByRole("button", { name: "Pianta", exact: true }), { after: 1800 });
  await p.screenshot({ path: "shots/fit2.png" });
  if (await p.getByText(/^collisioni$/i).count()) {
    await s.click(p.getByRole("button", { name: "Adatta all'ingombro" }), { after: 1300 });
    console.log("FIT2:", (await dialog().innerText().catch(() => "?")).slice(0, 300));
    await s.click(dialog().getByRole("button", { name: /Applica|Chiudi/ }).first(), { after: 1400 });
    await p.screenshot({ path: "shots/fit3.png" });
  }
  await s.click(p.getByRole("button", { name: "Prospettica", exact: true }), { after: 1800 });
  await s.stop();
}

// ---------- s13 solidi e lavorazioni
if (want("s13")) {
  await s.start("s13-solidi");
  await s.wait(500);
  const bb = await canvasBox();
  // zoom sul nodo pilastro–trave–saetta
  await zoomAt(bb.x + bb.width * 0.36, bb.y + bb.height * 0.52, 9);
  await s.wait(900);
  await s.moveTo(bb.x + bb.width * 0.30, bb.y + bb.height * 0.62, 900);
  await s.wait(1300);
  await s.moveTo(bb.x + bb.width * 0.47, bb.y + bb.height * 0.40, 900);
  await s.wait(1300);
  await s.click(p.getByRole("button", { name: "Inquadra tutto" }), { after: 600 });
  await loadPreset("Carport 5×3", "Carport 5×3", true);
  await s.wait(800);
  await orbit(0.28, 2400);
  await s.wait(500);
  const b2 = await canvasBox();
  await s.moveTo(b2.x + b2.width * 0.5, b2.y + b2.height * 0.45, 800);
  await s.wait(1500);
  await s.stop();
}

// ---------- s14 preventivo vista ufficio
if (want("s14")) {
  await s.start("s14-preventivo");
  await s.wait(500);
  await s.hover(p.getByText("Totale IVA inclusa").first(), 800);
  await s.wait(600);
  await s.click(p.getByRole("button", { name: /^Legno/ }).first(), { after: 1300 });
  await s.click(p.getByRole("button", { name: /^Sfrido e recuperi/ }).first(), { after: 1200 });
  const det = p.getByRole("button", { name: /Dettaglio legno e piano di taglio/ }).first();
  await det.scrollIntoViewIfNeeded();
  await s.click(det, { after: 1800 });
  await s.scroll(250, 900, null);
  const cc = p.getByRole("button", { name: /Cantiere e complicazioni/ }).first();
  await cc.scrollIntoViewIfNeeded();
  await s.click(cc, { after: 1800 });
  const tab = p.getByRole("tab", { name: "Anteprima cliente" });
  await tab.scrollIntoViewIfNeeded();
  await s.click(tab, { after: 2200 });
  await s.click(p.getByRole("tab", { name: "Vista ufficio" }), { after: 900 });
  await s.stop();
}

// ---------- s16 export
if (want("s16")) {
  const exp = p.getByRole("button", { name: "Esporta SAT" });
  await exp.scrollIntoViewIfNeeded();
  await s.start("s16-export");
  await s.wait(600);
  const files = {};
  for (const name of ["Esporta SAT", "Esporta STEP", "Esporta distinta CSV"]) {
    const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 120000 }), s.click(p.getByRole("button", { name }), { after: 200 })]);
    const f = VIEW + "x-" + dl.suggestedFilename();
    await dl.saveAs(f); files[name] = { f, n: dl.suggestedFilename() };
    await s.wait(700);
  }
  await s.click(p.getByRole("button", { name: "Verifica file" }), { after: 900 });
  await s.scroll(300, 900, null).catch(() => {});
  await s.hover(p.getByText(/Struttura SAT valida|valid/i).first(), 700).catch(() => {});
  await s.wait(1500);
  // pagina con il contenuto reale dei file esportati
  const sat = readFileSync(files["Esporta SAT"].f, "utf8").split("\n").slice(0, 26).join("\n");
  const csv = readFileSync(files["Esporta distinta CSV"].f, "utf8").replace(/^﻿/, "");
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  writeFileSync(VIEW + "files.html", `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#0d1020;color:#d6dae6;font:15px/1.5 "JetBrains Mono",Menlo,monospace;display:flex;height:100vh}
.col{flex:1;display:flex;flex-direction:column;border-right:1px solid #22263a;min-width:0}
.tab{background:#161a2e;padding:12px 18px;color:#9fa6c0;font-size:14px;border-bottom:1px solid #22263a}.tab b{color:#38D6FF}
pre{margin:0;padding:16px 18px;white-space:pre;overflow:hidden;flex:1}
.csv pre{white-space:pre-wrap;font-size:14px}.k{color:#9D7BFF}
</style><div class="col"><div class="tab"><b>${files["Esporta SAT"].n}</b> · ACIS 7.0 · mm</div><pre>${esc(sat)}</pre></div>
<div class="col csv"><div class="tab"><b>${files["Esporta distinta CSV"].n}</b> · distinta + ferramenta</div><pre>${esc(csv)}</pre></div>`);
  await s.goto("file://" + VIEW + "files.html", { waitMs: 300 });
  await s.moveTo(1300, 500, 900);
  await s.wait(1500);
  await s.scroll(0, 10);
  await s.moveTo(1300, 760, 900);
  await s.wait(1600);
  await s.stop();
}
await s.browser.close();
