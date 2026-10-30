// Versione INGLESE della voce, con sottotitoli ITALIANI.
// Ogni scena è una lista di frasi [inglese, sottotitolo italiano]: una frase inglese = un sottotitolo
// (se il sottotitolo è lungo viene diviso in più cue dentro la durata della frase).
// Nel testo inglese vale la sintassi {a schermo|parlato} per la pronuncia del TTS.
// minSeconds / extra / PAD restano quelli della versione italiana (vo-text.mjs).
const E = "{espeirIA|Espayria}";
const LJ = "Lemonjuice Solutions";
const SAT = "{SAT|S.A.T.}", CSV = "CSV", CNC = "CNC", PDF = "PDF";

export const VO_EN = [
  { id: "01", lines: [
    [`${LJ} presents ${E}: the platform that takes design from site survey to machine.`, "Lemonjuice Solutions presenta espeirIA: la piattaforma che porta la progettazione dal rilievo alla macchina."],
    ["Its first project: a configurator for manufacturers of timber structures.", "Il primo progetto: un configuratore per chi produce strutture in legno."],
    ["Pergolas, gazebos, carports, pre-cut roofs.", "Pergole, gazebo, carport, tetti pre-tagliati."],
  ] },
  { id: "c1", lines: [
    ["First: the website, from the customer's side.", "Si parte dal sito, dal punto di vista del cliente."],
  ] },
  { id: "02", lines: [
    ["The customer lands on the home page and browses the categories: lean-to, freestanding, carports, gazebos, canopies.", "Il cliente arriva sulla home e sfoglia le tipologie: addossate, autoportanti, carport, gazebo, pensiline."],
    [`Every model has its own drawing and a "from" price, calculated from the price list managed in the back-office.`, "Ogni modello ha il suo disegno e un prezzo «a partire da», che viene dal listino gestito nel back-office."],
  ] },
  { id: "03", lines: [
    ["Then the customer opens the six-step quote.", "Poi apre il preventivo in sei passi."],
    ["One: choose the model.", "Uno: sceglie il modello."],
    ["Two: the dimensions, with a slider or in centimetres.", "Due: le misure, con il cursore o in centimetri."],
    ["The site instantly shows how many posts are needed, and the model can be changed at any time.", "Il sito gli dice subito quanti pilastri servono, e il modello si può cambiare in ogni momento."],
  ] },
  { id: "04", lines: [
    ["Three: the space.", "Tre: lo spazio."],
    ["Is the wall out of square?", "Il muro è fuori squadra?"],
    [`The customer measures the four sides and the two diagonals, and ${E} works out the angle.`, "Il cliente misura i quattro lati e le due diagonali, e l'angolo lo calcola espeirIA."],
    ["The floor drops six centimetres toward the front.", "Il pavimento scende di sei centimetri verso il fronte."],
    ["There's a gutter on the wall.", "Sul muro c'è una grondaia."],
    ["Finally, the site's postcode, for delivery.", "Infine il CAP del cantiere, per il trasporto."],
  ] },
  { id: "05", lines: [
    ["Four: the finishes, straight from the price list.", "Quattro: le finiture, prese dal listino."],
    ["Glulam larch, coloured stain, polycarbonate roofing.", "Larice lamellare, impregnante colorato, copertura in policarbonato."],
  ] },
  { id: "06", lines: [
    ["Five: the summary.", "Cinque: il riepilogo."],
    ["The pergola in 3D, already fitted to the space: its height drops to clear the gutter.", "La pergola in 3D, già adattata allo spazio: l'altezza scende per passare sotto la grondaia."],
    ["The indicative price comes as a range, and every note is written in plain words.", "Il prezzo indicativo ha una forbice, e ogni nota è scritta in parole semplici."],
    ["No sign-up. No commitment.", "Senza registrazione, senza impegno."],
  ] },
  { id: "07", lines: [
    ["Six: contact details.", "Sei: i contatti."],
    ["Name, phone, email, a few photos of the wall, and privacy consent.", "Nome, telefono, email, qualche foto del muro e il consenso privacy."],
    ["One click, and the request is sent.", "Un clic, e la richiesta è inviata."],
  ] },
  { id: "08", lines: [
    [`The customer instantly receives an email with a ${PDF} summary and a personal link:`, "Il cliente riceve subito un'email con il riepilogo in PDF e un link personale:"],
    ["their own page, with the pergola, the dimensions and the indicative price, valid for ninety days.", "la sua pagina, con la pergola, le misure e il prezzo indicativo, valida novanta giorni."],
  ] },
  { id: "c2", lines: [
    ["Next: the technical office side.", "Ora, il lato dell'ufficio tecnico."],
  ] },
  { id: "09", lines: [
    ["The technician signs in with email and password.", "Il tecnico entra con email e password."],
    ["Under Requests, there's Mario Rossi's, with dimensions, photos and notes, a status and an owner.", "In Richieste trova quella di Mario Rossi, con misure, foto e note, uno stato e un responsabile."],
    ["Open in configurator: the customer's pergola is already loaded.", "«Apri nel configuratore»: la pergola del cliente è già caricata."],
  ] },
  { id: "10", lines: [
    ["The configurator knows ten structure types, from the lean-to to the eight-sided gazebo, all the way to the glulam arch carport.", "Il configuratore conosce dieci tipologie, dalla monofalda al gazebo a otto lati, fino al carport ad arco lamellare."],
    ["A category filter, and a thumbnail for each, generated by the model itself.", "Un filtro per categoria, una miniatura per ciascuna, generata dal modello stesso."],
    ["Plus twenty-seven catalogue models, ready to load.", "E ventisette modelli di catalogo, pronti da caricare."],
  ] },
  { id: "11", lines: [
    ["Every parameter has its limits.", "Ogni parametro ha i suoi limiti."],
    ["Building rules check spans, spacing, overhangs and minimum sections.", "Le regole costruttive controllano luci, interassi, sbalzi e sezioni minime."],
    ["If a beam falls short, Auto-size proposes the right section.", "Se una trave non basta, «Auto-dimensiona» propone la sezione giusta."],
  ] },
  { id: "12", lines: [
    ["Then the real footprint: obstacles and floor levels.", "Poi l'ingombro reale: ostacoli e quote del pavimento."],
    ["Every piece that touches the gutter turns red.", "Ogni pezzo che tocca la grondaia diventa rosso."],
    ["Fit to footprint, and the pergola slots back into the space.", "«Adatta all'ingombro», e la pergola rientra nello spazio."],
    ["With an out-of-square wall, the wall plate and rafters follow the real plan, and every overrun is flagged.", "Con il muro fuori squadra, banchina e travetti seguono il piano reale, e ogni sconfinamento viene segnalato."],
  ] },
  { id: "13", lines: [
    ["Every piece is a true solid, computed by the OpenCascade kernel: mortise and tenon, half-laps, birdsmouth cuts, holes for the hardware.", "Ogni pezzo è un solido vero, calcolato dal kernel OpenCascade: tenoni e mortase, mezzo legno, becchi d'uccello, fori per la ferramenta."],
    ["Even the carport's glulam arch.", "Anche l'arco lamellare del carport."],
    ["Spin it, click a piece, and read its section and length.", "Si gira, si clicca un pezzo, e si leggono sezione e lunghezza."],
  ] },
  { id: "14", lines: [
    ["In office view, the quote starts from the pieces.", "Il preventivo, in vista ufficio, parte dai pezzi."],
    ["Cutting is optimised on commercial stock lengths, with real offcuts.", "Il taglio è ottimizzato sulle barre commerciali, con gli sfridi reali."],
    [`Then ${CNC} machining, hardware, assembly, on-site complications, delivery by postcode, margins and VAT.`, "Poi lavorazioni CNC, ferramenta, montaggio, complicazioni di cantiere, trasporto per CAP, margini e IVA."],
    ["Every line comes with its own explanation.", "Ogni riga ha la sua spiegazione."],
  ] },
  { id: "15", lines: [
    ["From here, the office saves the final quote: manual items, discount, VAT.", "Da qui l'ufficio salva il preventivo definitivo: voci manuali, sconto, IVA."],
    [`And sends it to the customer by email, with the ${PDF}.`, "E lo invia al cliente per email, con il PDF."],
  ] },
  { id: "16", lines: [
    ["Then, production.", "Poi la produzione."],
    [`In one click, the system exports the ${SAT} file for the ${CNC} cutting centre, the STEP, and the ${CSV} bill of materials with all the hardware.`, "Con un clic il sistema esporta il file SAT per il centro di taglio CNC, lo STEP e la distinta CSV con tutta la ferramenta."],
    ["From model to machine, without redrawing a thing.", "Dal modello alla macchina, senza ridisegnare."],
  ] },
  { id: "c3", lines: [
    ["Finally, the back-office.", "Infine, il back-office."],
  ] },
  { id: "17", lines: [
    ["The price list is split into sections: timber, machining, hardware, assembly, delivery, margins.", "Il listino è diviso per sezioni: legno, lavorazioni, ferramenta, montaggio, trasporto, margini."],
    ["Every change goes into a draft.", "Ogni modifica va in bozza."],
    ["The simulator compares the draft with the live version; then it's published, with the differences and a valid-from date.", "Il simulatore confronta la bozza con la versione attiva; poi si pubblica, con le differenze e la data di validità."],
    [`And everything imports and exports as ${CSV}.`, "E si importa ed esporta in CSV."],
  ] },
  { id: "18", lines: [
    ["On-site complications are written as sentences: if the height difference is at least ten centimetres, add three hours of assembly.", "Le complicazioni di cantiere si scrivono come frasi: se il dislivello è di almeno dieci centimetri, tre ore di montaggio in più."],
    ["Then the building rules, the types shown on the website, and the users with their roles.", "Poi le regole costruttive, le tipologie visibili sul sito, gli utenti con i loro ruoli."],
    ["And the log shows who changed what, and when.", "E il registro dice chi ha cambiato cosa, e quando."],
  ] },
  { id: "19", lines: [
    ["From survey to machine.", "Dal rilievo alla macchina."],
    ["One single configuration.", "Una sola configurazione."],
    [`${E}, by ${LJ}.`, "espeirIA, by Lemonjuice Solutions."],
  ] },
];

/** frasi-gancio per le animazioni (cercate nel testo inglese a schermo) */
export const HOOKS_EN = {
  "01": { esp: "espeirIA", project: "Its first project" },
  "19": { lockup: "espeirIA, by" },
};

export const screenText = (t) => t.replace(/\{([^|}]*)\|([^}]*)\}/g, "$1");
export const ttsText = (t) => t.replace(/\{([^|}]*)\|([^}]*)\}/g, "$2").replace(/[«»"]/g, "");
