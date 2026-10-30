// Elenco unico delle scene — versione 5 minuti (da ../../script-5min.md).
// Le durate arrivano dalla voce (src/data/vo-timing.json, generato da scripts/make-vo.mjs);
// le durate delle registrazioni da src/data/recordings.json (scripts/probe-recordings.mjs).
import timing from "./vo-timing.json";
import timingEn from "./vo-timing.en.json";

export type ChipTone = "default" | "success" | "danger" | "mono" | "counter" | "gradient";
export type Chip = { label: string; tone?: ChipTone; arrow?: boolean };

type Base = { id: string; label: string };
export type IntroDef = Base & { kind: "intro" };
export type OutroDef = Base & { kind: "outro"; step: string };
export type ChapterDef = Base & { kind: "chapter"; letter: string; title: string; highlight: string; subtitle: string };
export type ScreenDef = Base & {
  kind: "screen";
  step: string; // "01 / 17"
  chapter: string; // "LATO SITO"
  title: string;
  highlight: string; // parola con accent-gradient (deve comparire nel titolo)
  chips: Chip[];
  recording: string; // public/recordings/<recording>.mp4
  device?: "browser" | "phone";
  url?: string;
  marquee?: string[];
};
export type SceneDef = IntroDef | OutroDef | ChapterDef | ScreenDef;

export const TIPOLOGIE = [
  "Addossata monofalda", "Autoportante bifalda", "Portale sandwich", "Addossata sandwich", "Monofalda scalare",
  "Telaio a giunti metallici", "Carport ad arco", "Gazebo a padiglione", "Pensilina a sbalzo", "Pergola a L",
];

const N = 17;
const st = (n: number) => `${String(n).padStart(2, "0")} / ${N}`;
const SITE = "LATO SITO", CONF = "LATO CONFIGURATORE", BO = "BACK-OFFICE";
const HOST = "espeiria.lemonjuicesolutions.it";

export const SCENES: SceneDef[] = [
  { id: "01", kind: "intro", label: "Intro: Lemonjuice presenta espeirIA" },
  { id: "c1", kind: "chapter", label: "Capitolo: lato sito", letter: "A", title: "Lato sito.", highlight: "sito.", subtitle: "Il cliente configura e chiede il preventivo" },
  {
    id: "02", kind: "screen", label: "Home e tipologie", chapter: SITE, step: st(1),
    title: "Ogni modello, il suo prezzo.", highlight: "prezzo.",
    chips: [{ label: "Addossate" }, { label: "Autoportanti" }, { label: "Carport" }, { label: "Gazebo" }, { label: "Pensiline" }, { label: "«a partire da»", tone: "gradient" }],
    recording: "s02-home-tipologie", url: `${HOST}/pergole`, marquee: TIPOLOGIE,
  },
  {
    id: "03", kind: "screen", label: "Wizard · modello e misure", chapter: SITE, step: st(2),
    title: "Sei passi, dal telefono.", highlight: "telefono.",
    chips: [{ label: "01 Modello", tone: "mono" }, { label: "02 Misure", tone: "mono" }, { label: "3 pilastri", tone: "success" }],
    recording: "s03-wizard-modello", device: "phone",
  },
  {
    id: "04", kind: "screen", label: "Wizard · spazio", chapter: SITE, step: st(3),
    title: "Il muro storto? Bastano le diagonali.", highlight: "diagonali.",
    chips: [{ label: "03 Spazio", tone: "mono" }, { label: "Fuori squadra ~2°", tone: "danger" }, { label: "Pavimento −6 cm" }, { label: "Grondaia" }, { label: "CAP 37026", tone: "mono" }],
    recording: "s04-wizard-spazio", device: "phone",
  },
  {
    id: "05", kind: "screen", label: "Wizard · finiture", chapter: SITE, step: st(4),
    title: "Finiture dal listino.", highlight: "listino.",
    chips: [{ label: "04 Finiture", tone: "mono" }, { label: "Larice lamellare" }, { label: "Impregnante colorato" }, { label: "Policarbonato 16 mm" }],
    recording: "s05-wizard-finiture", device: "phone",
  },
  {
    id: "06", kind: "screen", label: "Wizard · riepilogo", chapter: SITE, step: st(5),
    title: "Il 3D e un prezzo onesto.", highlight: "onesto.",
    chips: [{ label: "05 Prezzo", tone: "mono" }, { label: "Adattata allo spazio", tone: "success" }, { label: "Forbice ±10%" }, { label: "Prezzo indicativo", tone: "gradient" }],
    recording: "s06-wizard-riepilogo", device: "phone",
  },
  {
    id: "07", kind: "screen", label: "Wizard · contatti", chapter: SITE, step: st(6),
    title: "Un clic, richiesta inviata.", highlight: "inviata.",
    chips: [{ label: "06 Contatti", tone: "mono" }, { label: "Foto del muro" }, { label: "Consenso privacy" }, { label: "PRV-2026-00001", tone: "success" }],
    recording: "s07-wizard-contatti", device: "phone",
  },
  {
    id: "08", kind: "screen", label: "Email, PDF e pagina cliente", chapter: SITE, step: st(7),
    title: "Riepilogo in PDF, link personale.", highlight: "personale.",
    chips: [{ label: "Email di conferma" }, { label: "preventivo.pdf", tone: "mono" }, { label: "/p/… valido 90 giorni", tone: "mono" }],
    recording: "s08-pdf-pagina", url: `${HOST}/p/…`,
  },
  { id: "c2", kind: "chapter", label: "Capitolo: lato configuratore", letter: "B", title: "Lato configuratore.", highlight: "configuratore.", subtitle: "L'ufficio tecnico, dal preventivo alla CNC" },
  {
    id: "09", kind: "screen", label: "Accesso e richieste", chapter: CONF, step: st(8),
    title: "La richiesta arriva già pronta.", highlight: "pronta.",
    chips: [{ label: "Email + password", tone: "mono" }, { label: "In lavorazione", tone: "success" }, { label: "Apri nel configuratore", tone: "gradient", arrow: false }],
    recording: "s09-richieste", url: `${HOST}/admin/richieste`,
  },
  {
    id: "10", kind: "screen", label: "Tipologie e preset", chapter: CONF, step: st(9),
    title: "Dieci tipologie, ventisette modelli.", highlight: "ventisette",
    chips: [{ label: "10 TIPOLOGIE", tone: "counter" }, { label: "27 PRESET", tone: "counter" }, { label: "Gazebo ottagonale Ø4000", tone: "mono" }],
    recording: "s10-tipologie-preset", url: `${HOST}/configuratore`, marquee: TIPOLOGIE,
  },
  {
    id: "11", kind: "screen", label: "Regole costruttive", chapter: CONF, step: st(10),
    title: "Le regole costruttive, in tempo reale.", highlight: "reale.",
    chips: [{ label: "Luce eccessiva", tone: "danger" }, { label: "Auto-dimensiona", tone: "gradient" }, { label: "80×160 → 120×240", tone: "mono" }, { label: "Nessuna violazione", tone: "success" }],
    recording: "s11-regole", url: `${HOST}/configuratore`,
  },
  {
    id: "12", kind: "screen", label: "Ingombro e collisioni", chapter: CONF, step: st(11),
    title: "La pergola entra nello spazio vero.", highlight: "vero.",
    chips: [{ label: "Collisione: grondaia", tone: "danger" }, { label: "Pianta fuori squadra" }, { label: "Quote pavimento" }, { label: "Adatta all'ingombro", tone: "success" }, { label: "Sconfinamenti segnalati", tone: "danger" }],
    recording: "s12-ingombro", url: `${HOST}/configuratore`,
  },
  {
    id: "13", kind: "screen", label: "Solidi e lavorazioni", chapter: CONF, step: st(12),
    title: "Ogni pezzo è un solido vero.", highlight: "solido",
    chips: [{ label: "OpenCascade", tone: "mono" }, { label: "Tenone e mortasa" }, { label: "Mezzo legno" }, { label: "Becco d'uccello" }, { label: "Arco lamellare" }],
    recording: "s13-solidi", url: `${HOST}/configuratore`,
  },
  {
    id: "14", kind: "screen", label: "Preventivo vista ufficio", chapter: CONF, step: st(13),
    title: "Sfridi reali, non stimati.", highlight: "reali,",
    chips: [{ label: "Legno" }, { label: "Sfrido" }, { label: "CNC" }, { label: "Ferramenta" }, { label: "Montaggio" }, { label: "Complicazioni" }, { label: "Trasporto" }, { label: "Margini" }, { label: "IVA" }],
    recording: "s14-preventivo", url: `${HOST}/configuratore`,
  },
  {
    id: "15", kind: "screen", label: "Preventivo definitivo", chapter: CONF, step: st(14),
    title: "Il definitivo parte in un clic.", highlight: "definitivo",
    chips: [{ label: "Voci manuali" }, { label: "Sconto 5%" }, { label: "Email + PDF", tone: "success" }],
    recording: "s15-definitivo", url: `${HOST}/configuratore?richiesta=…`,
  },
  {
    id: "16", kind: "screen", label: "Export CNC", chapter: CONF, step: st(15),
    title: "Dal 3D alla macchina.", highlight: "macchina.",
    chips: [{ label: ".sat", tone: "mono" }, { label: ".step", tone: "mono" }, { label: "distinta.csv", tone: "mono" }, { label: "Centro di taglio CNC" }],
    recording: "s16-export", url: `${HOST}/configuratore`,
  },
  { id: "c3", kind: "chapter", label: "Capitolo: back-office", letter: "C", title: "Back-office.", highlight: "Back-office.", subtitle: "Listini e regole, senza toccare il codice" },
  {
    id: "17", kind: "screen", label: "Listino versionato", chapter: BO, step: st(16),
    title: "Bozza, simulazione, pubblicazione.", highlight: "pubblicazione.",
    chips: [{ label: "BOZZA", tone: "mono" }, { label: "Simula", tone: "mono" }, { label: "Differenze" }, { label: "Pubblicata", tone: "success" }, { label: "CSV", tone: "mono" }],
    recording: "s17-listino", url: `${HOST}/admin/listino`,
  },
  {
    id: "18", kind: "screen", label: "Complicazioni, regole, registro", chapter: BO, step: st(17),
    title: "Regole scritte come frasi.", highlight: "frasi.",
    chips: [{ label: "Se dislivello ≥ 100 mm → +3 ore", tone: "mono" }, { label: "Tipologie visibili" }, { label: "Ruoli" }, { label: "Registro modifiche", tone: "success" }],
    recording: "s18-backoffice", url: `${HOST}/admin/listino/complicazioni`,
  },
  { id: "19", kind: "outro", label: "Outro / CTA", step: "" },
];

export type Lang = "it" | "en";
export type SceneTiming = {
  id: string; from: number; durationInFrames: number; voiceStartFrame: number; file: string; seconds: number;
  cues: { start: number; end: number; text: string }[];
  /** solo versione inglese: frasi (s, relative all'inizio voce) e ganci delle animazioni */
  lines?: { start: number; end: number; en: string; it: string }[];
  hooks?: Record<string, number>;
};
type TimingFile = { scenes: SceneTiming[]; totalFrames: number };
const FILES: Record<Lang, TimingFile> = { it: timing as TimingFile, en: timingEn as unknown as TimingFile };
export const TIMING: SceneTiming[] = FILES.it.scenes;
export const TOTAL_FRAMES: number = FILES.it.totalFrames;
export const totalFramesFor = (lang: Lang) => FILES[lang].totalFrames;
export const timingOf = (id: string, lang: Lang = "it") => {
  const t = FILES[lang].scenes.find((s) => s.id === id);
  if (!t) throw new Error(`timing mancante per la scena ${id} (${lang}): rilanciare npm run vo${lang === "en" ? ":en" : ""}`);
  return t;
};
