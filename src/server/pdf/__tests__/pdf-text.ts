import { inflateSync } from "node:zlib";

/**
 * Estrazione minima del testo da un PDF di `@react-pdf/renderer` (solo test): decomprime
 * gli stream FlateDecode e legge le stringhe esadecimali degli operatori `Tj`/`TJ`
 * (font standard, codifica WinAnsi). Ogni operatore di testo diventa una riga.
 */
const WIN_ANSI_HIGH: Record<number, string> = { 0x80: "€", 0x96: "–", 0x97: "—", 0x95: "•", 0x92: "’", 0x93: "“", 0x94: "”", 0x85: "…" };

const decodeHex = (hex: string) => {
  let out = "";
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const code = parseInt(hex.slice(i, i + 2), 16);
    out += WIN_ANSI_HIGH[code] ?? String.fromCharCode(code);
  }
  return out;
};

export function extractPdfText(pdf: Uint8Array): string {
  const raw = Buffer.from(pdf).toString("latin1");
  const lines: string[] = [];
  const streamRe = /(?<!end)stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    const bytes = Buffer.from(raw.slice(start, end), "latin1");
    let content: string;
    try {
      content = inflateSync(bytes).toString("latin1");
    } catch {
      content = bytes.toString("latin1");
    }
    for (const op of content.matchAll(/\[((?:<[0-9a-fA-F]*>|[-\d.\s])*)\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj/g)) {
      const hexes = op[1] !== undefined ? [...op[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => h[1]!) : [op[2]!];
      lines.push(hexes.map(decodeHex).join(""));
    }
    streamRe.lastIndex = end + "endstream".length;
  }
  return lines.join("\n");
}
