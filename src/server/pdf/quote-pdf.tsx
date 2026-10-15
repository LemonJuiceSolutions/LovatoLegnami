import { Document, Font, Image, Page, Polygon, Polyline, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatEuro, type CustomerQuote } from "@/domain";
import type { PlanDrawing, VectorDrawing } from "./drawing";

/**
 * Riepilogo PDF del preventivo (spec `richieste-preventivo`, "Riepilogo PDF"; P7):
 * `@react-pdf/renderer` nel runtime Node, font standard (Helvetica: nessun file di font da
 * distribuire, testo WinAnsi con €, –, ×, °, ±). Il documento è costruito **solo** da
 * `QuotePdfData`, a sua volta derivata dall'istantanea salvata (vista cliente già
 * calcolata): rigenerato dopo un nuovo listino riporta gli stessi importi e non può
 * contenere dati interni, perché la vista ufficio non entra mai qui.
 */

export interface QuotePdfMeasure {
  readonly label: string;
  readonly value: string;
}

export interface QuotePdfData {
  readonly code: string;
  /** Data del preventivo, `AAAA-MM-GG`. */
  readonly date: string;
  readonly kind: "indicativo" | "definitivo";
  readonly customer: {
    readonly name: string;
    readonly email?: string;
    readonly phone?: string;
    readonly cap?: string;
    readonly comune?: string;
  };
  readonly typology: string;
  readonly measures: readonly QuotePdfMeasure[];
  /** Pianta dell'ingombro con la deviazione massima dallo squadro (gradi). */
  readonly plan?: { readonly drawing: PlanDrawing; readonly maxDeviationDeg: number } | null;
  /** Immagine della scena catturata dal viewer (PNG/JPEG), altrimenti `drawing`. */
  readonly image?: { readonly format: "png" | "jpg"; readonly data: Uint8Array } | null;
  readonly drawing?: VectorDrawing | null;
  readonly quote: CustomerQuote;
  /** Note del cliente (testo libero, mostrato così com'è). */
  readonly customerNotes?: string | null;
  readonly siteName?: string;
  readonly siteAddress?: string;
}

// Niente sillabazione inglese automatica sulle parole italiane.
Font.registerHyphenationCallback((word) => [word]);

const C = { ink: "#1f1a17", muted: "#6b625c", line: "#d9cfc4", accent: "#5a3a22", band: "#f4efe8" };

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", fontSize: 10, color: C.ink, lineHeight: 1.35 },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: C.accent, paddingBottom: 8, marginBottom: 12 },
  brand: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.accent, lineHeight: 1.2, marginBottom: 3 },
  small: { fontSize: 8.5, color: C.muted },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  section: { marginBottom: 12 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.accent, marginBottom: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: C.line },
  cols: { flexDirection: "row", gap: 16 },
  col: { flex: 1 },
  label: { color: C.muted },
  total: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: C.band },
  totalText: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  note: { marginBottom: 2 },
  footer: { position: "absolute", left: 36, right: 36, bottom: 20, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: C.muted },
});

const euro = (cents: number) => formatEuro(cents);

const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
/**
 * Testo libero del cliente nei font standard del PDF (WinAnsi): i caratteri non
 * rappresentabili (emoji, alfabeti non latini) diventano "?" e i controlli spariscono.
 */
export function pdfText(value: string, max = 2000): string {
  let out = "";
  for (const ch of value.replace(/\r\n?/g, "\n").slice(0, max)) {
    const code = ch.codePointAt(0)!;
    if (ch === "\n" || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(ch)) out += ch;
    else if (code === 0x09) out += " ";
    else if (code >= 0x20 && !(code >= 0x7f && code < 0xa0)) out += "?";
  }
  return out;
}
const dateIt = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const deg = (n: number) => `${(Math.round(n * 10) / 10).toString().replace(".", ",")}°`;

export const PDF_CONDITIONS = [
  "Prezzo indicativo, soggetto a sopralluogo: il preventivo definitivo è emesso dall'ufficio dopo la verifica del cantiere.",
  "Gli importi sono calcolati sulle misure e sulle scelte indicate nella richiesta; variazioni di misure, finiture o condizioni del cantiere possono modificarli.",
  "Il documento non costituisce offerta vincolante né conferma d'ordine.",
] as const;

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={bold ? { fontFamily: "Helvetica-Bold" } : s.label}>{label}</Text>
      <Text style={bold ? { fontFamily: "Helvetica-Bold" } : {}}>{value}</Text>
    </View>
  );
}

function Picture({ data }: { data: QuotePdfData }) {
  // `Image` di react-pdf non ha `alt` (il PDF non è HTML): la regola jsx-a11y non si applica.
  // eslint-disable-next-line jsx-a11y/alt-text
  if (data.image) return <Image src={{ data: Buffer.from(data.image.data), format: data.image.format }} style={{ width: "100%", height: 200, objectFit: "contain" }} />;
  const d = data.drawing;
  if (!d || d.polygons.length === 0) return null;
  return (
    <Svg viewBox={`0 0 ${d.width} ${d.height}`} style={{ width: "100%", height: 200 }}>
      {d.shadow ? <Polygon points={d.shadow} fill={C.ink} fillOpacity={0.08} /> : null}
      {d.polygons.map((p, i) => (
        <Polygon key={i} points={p.points} fill={p.fill} stroke={C.ink} strokeOpacity={0.35} strokeWidth={0.4} />
      ))}
    </Svg>
  );
}

function PlanView({ plan }: { plan: NonNullable<QuotePdfData["plan"]> }) {
  const d = plan.drawing;
  return (
    <View>
      <Svg viewBox={`0 0 ${d.width} ${d.height}`} style={{ width: 150, height: (150 * d.height) / d.width }}>
        <Polygon points={d.box} fill="none" stroke={C.muted} strokeWidth={0.5} strokeDasharray="2,2" />
        <Polygon points={d.outline} fill={C.band} stroke={C.accent} strokeWidth={1} />
        {d.wall ? <Polyline points={d.wall} stroke={C.ink} strokeWidth={3} /> : null}
      </Svg>
      <Text style={s.small}>
        {plan.maxDeviationDeg > 0.05 ? `Pianta fuori squadra: deviazione massima ${deg(plan.maxDeviationDeg)}` : "Pianta in squadra"}
        {d.wall ? " · linea spessa = muro" : ""}
      </Text>
    </View>
  );
}

export function QuotePdf({ data }: { data: QuotePdfData }) {
  const q = data.quote;
  const site = data.siteName ?? "Lovato Legnami";
  const priced = q.status === "completo";
  const c = {
    name: pdfText(data.customer.name, 120),
    email: data.customer.email && pdfText(data.customer.email, 254),
    phone: data.customer.phone && pdfText(data.customer.phone, 40),
    cap: data.customer.cap && pdfText(data.customer.cap, 10),
    comune: data.customer.comune && pdfText(data.customer.comune, 120),
  };
  const customerNotes = data.customerNotes ? pdfText(data.customerNotes) : null;
  return (
    <Document title={`Preventivo ${data.code}`} author={site} subject={`Riepilogo del preventivo ${data.kind}`} language="it" creationDate={new Date(`${data.date}T12:00:00Z`)}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>{site}</Text>
            <Text style={s.small}>{data.siteAddress ?? "Settimo di Pescantina (VR)"}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.title}>{data.kind === "definitivo" ? "Preventivo" : "Preventivo indicativo"}</Text>
            <Text>Codice {data.code}</Text>
            <Text style={s.small}>del {dateIt(data.date)}</Text>
          </View>
        </View>

        <View style={[s.section, s.cols]}>
          <View style={s.col}>
            <Text style={s.h2}>Cliente</Text>
            <Text>{c.name}</Text>
            {c.email ? <Text style={s.small}>{c.email}</Text> : null}
            {c.phone ? <Text style={s.small}>{c.phone}</Text> : null}
            {c.cap || c.comune ? <Text style={s.small}>Cantiere: {[c.cap, c.comune].filter(Boolean).join(" ")}</Text> : null}
          </View>
          <View style={s.col}>
            <Text style={s.h2}>{data.typology}</Text>
            {data.measures.map((m) => (
              <Row key={m.label} label={m.label} value={m.value} />
            ))}
          </View>
        </View>

        <View style={[s.section, s.cols]}>
          <View style={{ flex: 2 }}>
            <Picture data={data} />
          </View>
          {data.plan ? (
            <View style={s.col}>
              <Text style={s.h2}>Pianta</Text>
              <PlanView plan={data.plan} />
            </View>
          ) : null}
        </View>

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>Prezzo</Text>
          {priced ? (
            <>
              {q.groups.map((g) => (
                <Row key={g.id} label={g.label} value={euro(g.amountCents)} />
              ))}
              {q.discountCents !== 0 ? <Row label="Sconti" value={euro(q.discountCents)} /> : null}
              {q.minimumAdjustmentCents !== 0 ? <Row label="Adeguamento al minimo d'ordine" value={euro(q.minimumAdjustmentCents)} /> : null}
              <Row label="Imponibile" value={euro(q.taxableCents)} />
              <Row label={`IVA ${String(q.vatPct).replace(".", ",")}%`} value={euro(q.vatCents)} />
              {q.roundingCents !== 0 ? <Row label="Arrotondamento" value={euro(q.roundingCents)} /> : null}
              <View style={s.total}>
                <Text style={s.totalText}>Totale IVA inclusa</Text>
                <Text style={s.totalText}>{euro(q.totalCents)}</Text>
              </View>
              <Text style={[s.small, { marginTop: 3 }]}>
                Fascia indicativa (±{String(q.range.pct).replace(".", ",")}%): da {euro(q.range.minCents)} a {euro(q.range.maxCents)}
              </Text>
            </>
          ) : (
            <Text>Prezzo su richiesta: alcuni elementi vanno valutati dall&apos;ufficio, che ti contatterà con il preventivo.</Text>
          )}
        </View>

        {q.notes.length || customerNotes ? (
          <View style={s.section}>
            <Text style={s.h2}>Note</Text>
            {q.notes.map((n, i) => (
              <Text key={i} style={s.note}>
                • {n}
              </Text>
            ))}
            {customerNotes ? <Text style={[s.note, { marginTop: 4 }]}>Le tue note: {customerNotes}</Text> : null}
          </View>
        ) : null}

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>Condizioni</Text>
          {PDF_CONDITIONS.map((t, i) => (
            <Text key={i} style={[s.small, s.note]}>
              {t}
            </Text>
          ))}
        </View>

        <View style={s.footer} fixed>
          <Text>
            {site} · {data.code} · listino v{q.priceList.version} del {dateIt(q.priceList.effectiveFrom)}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} di ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** PDF del preventivo (Node): byte del file. */
export async function renderQuotePdf(data: QuotePdfData): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<QuotePdf data={data} />);
  return new Uint8Array(buffer);
}
