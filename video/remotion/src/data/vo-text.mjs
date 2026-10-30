// Testo della voce per scena — versione 5 minuti, voce neurale (edge-tts, it-IT-GiuseppeMultilingualNeural).
// Sintassi {a schermo|parlato}: la prima parte va nei sottotitoli, la seconda al TTS.
// Le parole inglesi sono scritte normalmente e la voce multilingue le legge in inglese;
// le sigle che in italiano si compitano (CNC, PDF, CSV, SAT, CAP, IVA) restano all'italiana.
export const FPS = 30;
export const PAD_IN = 0.3; // s di silenzio prima della voce in ogni scena
export const PAD_OUT = 0.6; // s dopo la fine della voce
const E = "{espeirIA|Espèiria}";
const CNC = "{CNC|ci enne ci}", PDF = "{PDF|pi di effe}", CSV = "{CSV|ci esse vu}", SAT = "{SAT|esse a ti}", CAP = "{CAP|cap}", IVA = "{IVA|iva}";
export const VO = [
  { id: "01", minSeconds: 13, text: `Lemonjuice Solutions presenta ${E}, la piattaforma che porta la progettazione dal rilievo fino alla macchina. Il primo progetto? Un configuratore per chi produce strutture in legno: pergole, gazebo, carport e tetti pre-tagliati.` },
  { id: "c1", minSeconds: 3.6, text: "Si parte dal sito, dal punto di vista del cliente." },
  { id: "02", minSeconds: 0, text: "Il cliente arriva sulla home e sfoglia le tipologie: addossate, autoportanti, carport, gazebo e pensiline. Ogni modello ha il suo disegno e un prezzo «a partire da», che viene dal listino gestito nel back-office." },
  { id: "03", minSeconds: 0, text: "Poi apre il preventivo, in sei passi. Uno: sceglie il modello. Due: inserisce le misure, con il cursore o in centimetri. Il sito gli dice subito quanti pilastri servono, e il modello si può cambiare quando vuole." },
  { id: "04", minSeconds: 0, extra: 2.5, text: `Tre: lo spazio. Il muro non è in squadra? Basta misurare i quattro lati e le due diagonali: l'angolo lo calcola ${E}. Il pavimento scende di sei centimetri verso il fronte, e sul muro c'è una grondaia. Per finire, il ${CAP} del cantiere, per il trasporto.` },
  { id: "05", minSeconds: 0, text: "Quattro: le finiture, direttamente dal listino. Larice lamellare, impregnante colorato e copertura in policarbonato." },
  { id: "06", minSeconds: 0, text: "Cinque: il riepilogo. La pergola in {3D|tre di}, già adattata allo spazio: l'altezza si abbassa per passare sotto la grondaia. Il prezzo indicativo ha una forbice, e ogni nota è scritta in modo semplice. Niente registrazione, nessun impegno." },
  { id: "07", minSeconds: 0, extra: 2, text: "Sei: i contatti. Nome, telefono, email, qualche foto del muro e il consenso privacy. Un clic, e la richiesta parte." },
  { id: "08", minSeconds: 0, text: `Il cliente riceve subito un'email con il riepilogo in ${PDF} e un link personale: la sua pagina, con la pergola, le misure e il prezzo indicativo, valida novanta giorni.` },
  { id: "c2", minSeconds: 3.6, text: "Ora, il lato dell'ufficio tecnico." },
  { id: "09", minSeconds: 0, extra: 2.5, text: "Il tecnico accede con email e password. In Richieste trova quella di Mario Rossi, con misure, foto e note, uno stato e un responsabile. Un clic su «Apri nel configuratore», e la pergola del cliente è già lì." },
  { id: "10", minSeconds: 0, text: "Il configuratore conosce dieci tipologie: dalla monofalda al gazebo a otto lati, fino al carport ad arco lamellare. C'è un filtro per categoria, e ogni tipologia ha una miniatura generata dal modello stesso. In più, ventisette modelli di catalogo, pronti da caricare." },
  { id: "11", minSeconds: 0, text: "Ogni parametro ha i suoi limiti. Le regole costruttive controllano luci, interassi, sbalzi e sezioni minime. E se una trave non basta, «Auto-dimensiona» propone la sezione giusta." },
  { id: "12", minSeconds: 0, extra: 1.5, text: "Poi c'è l'ingombro reale: ostacoli e quote del pavimento. Ogni pezzo che tocca la grondaia diventa rosso. Con «Adatta all'ingombro», la pergola rientra nello spazio. E con il muro fuori squadra, banchina e travetti seguono la pianta reale: ogni sconfinamento viene segnalato." },
  { id: "13", minSeconds: 0, extra: 1, text: "Ogni pezzo è un solido vero, calcolato dal kernel OpenCascade: tenoni e mortase, mezzo legno, becchi d'uccello, fori per la ferramenta. Anche l'arco lamellare del carport. Si ruota il modello, si clicca un pezzo, e si leggono sezione e lunghezza." },
  { id: "14", minSeconds: 0, text: `Il preventivo, in vista ufficio, parte dai pezzi. Il taglio viene ottimizzato sulle barre commerciali, con gli sfridi reali. Poi lavorazioni ${CNC}, ferramenta, montaggio, complicazioni di cantiere, trasporto in base al ${CAP}, margini e ${IVA}. Ogni riga ha la sua spiegazione.` },
  { id: "15", minSeconds: 0, extra: 2.5, text: `Da qui l'ufficio salva il preventivo definitivo, con voci manuali, sconto e ${IVA}. E lo manda al cliente via email, con il ${PDF} allegato.` },
  { id: "16", minSeconds: 0, text: `Poi si passa alla produzione. Con un clic si esportano il file ${SAT} per il centro di taglio ${CNC}, lo STEP e la distinta ${CSV} con tutta la ferramenta. Dal modello alla macchina, senza ridisegnare niente.` },
  { id: "c3", minSeconds: 3.6, text: "Infine, il back-office." },
  { id: "17", minSeconds: 0, extra: 3, text: `Il listino è diviso per sezioni: legno, lavorazioni, ferramenta, montaggio, trasporto e margini. Ogni modifica finisce in bozza. Il simulatore confronta la bozza con la versione attiva; poi si pubblica, con le differenze e la data di validità. E il listino si importa e si esporta in ${CSV}.` },
  { id: "18", minSeconds: 0, text: "Le complicazioni di cantiere si scrivono come frasi: se il dislivello è di almeno dieci centimetri, tre ore di montaggio in più. Poi ci sono le regole costruttive, le tipologie visibili sul sito e gli utenti con i loro ruoli. E il registro dice chi ha cambiato cosa, e quando." },
  { id: "19", minSeconds: 11.5, text: `Dal rilievo alla macchina, con una sola configurazione. ${E}, by Lemonjuice Solutions.` },
];

/** testo per i sottotitoli e per il TTS */
export const screenText = (t) => t.replace(/\{([^|}]*)\|([^}]*)\}/g, "$1");
export const ttsText = (t) => t.replace(/\{([^|}]*)\|([^}]*)\}/g, "$2").replace(/[«»]/g, "");
