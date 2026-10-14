import { EPS } from "../math/vec3";
import { MachiningError, formatPath } from "./errors";
import { MachiningSpecSchema } from "./schemas";
import { isMachiningType, type Face, type Machining, type MachiningSpec, type Piece } from "./types";

/** Dimensioni della faccia nel sistema locale: spessore normale e larghezza trasversale. */
export interface FaceExtents {
  /** Spessore del pezzo perpendicolare alla faccia (mm). */
  readonly thickness: number;
  /** Larghezza della faccia trasversalmente all'asse X (mm). */
  readonly across: number;
}

export function faceExtents(piece: Pick<Piece, "section" | "length">, face: Face): FaceExtents {
  const { b, h } = piece.section;
  switch (face) {
    case "superiore":
    case "inferiore":
      return { thickness: h, across: b };
    case "sinistra":
    case "destra":
      return { thickness: b, across: h };
    case "testa-inizio":
    case "testa-fine":
      return { thickness: piece.length, across: b };
  }
}

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);
const tan = (deg: number): number => Math.tan((Math.abs(deg) * Math.PI) / 180);

/** Verifica di applicabilità: restituisce il motivo del rifiuto o `undefined`. */
function applicabilityProblem(piece: Piece, m: MachiningSpec): string | undefined {
  const L = piece.length;
  const { b, h } = piece.section;
  const { thickness, across } = faceExtents(piece, m.face);
  if (m.at < -EPS || m.at > L + EPS) return `posizione at=${fmt(m.at)} oltre la lunghezza del pezzo (${fmt(L)})`;

  /** Intervallo [at−half, at+half] entro la lunghezza. */
  const alongX = (half: number, what: string): string | undefined =>
    m.at - half < -EPS || m.at + half > L + EPS
      ? `${what} (da ${fmt(m.at - half)} a ${fmt(m.at + half)}) esce dalla lunghezza del pezzo (${fmt(L)})`
      : undefined;
  /** Ingombro trasversale entro la faccia. */
  const withinFace = (offset: number, half: number, what: string): string | undefined =>
    Math.abs(offset) + half > across / 2 + EPS
      ? `${what} esce dalla faccia ${m.face} (larga ${fmt(across)}, ingombro ${fmt(Math.abs(offset) + half)} dall'asse)`
      : undefined;
  const depthWithin = (depth: number, strict: boolean): string | undefined =>
    depth > thickness + EPS || (strict && depth >= thickness - EPS)
      ? `profondità ${fmt(depth)} ${strict ? "non inferiore" : "maggiore"} della sezione (${fmt(thickness)} sulla faccia ${m.face})`
      : undefined;

  switch (m.type) {
    case "mezzo-legno":
      return depthWithin(m.depth, true) ?? alongX(m.width / 2, "la zona di mezzo legno");
    case "becco-uccello":
      if (m.angle >= 90) return `angolo ${fmt(m.angle)}° non valido (deve essere tra 0° e 90°)`;
      return depthWithin(m.depth, true);
    case "foro": {
      const r = m.diameter / 2;
      return (
        (m.depth !== undefined ? depthWithin(m.depth, false) : undefined) ??
        alongX(r, "il foro") ??
        withinFace(m.offset, r, "il foro")
      );
    }
    case "mortasa": {
      if (m.angle < 0 || m.angle >= 180) return `angolo ${fmt(m.angle)}° non valido (ammesso [0°, 180°))`;
      const a = (m.angle * Math.PI) / 180;
      const c = Math.abs(Math.cos(a));
      const s = Math.abs(Math.sin(a));
      const halfX = (m.width * c + m.height * s) / 2;
      const halfAcross = (m.width * s + m.height * c) / 2;
      return depthWithin(m.depth, false) ?? alongX(halfX, "la mortasa") ?? withinFace(m.offset, halfAcross, "la mortasa");
    }
    case "tenone": {
      const head = m.face === "testa-inizio" ? 0 : L;
      if (Math.abs(m.at - head) > EPS) return `il tenone deve stare sulla testa (${m.face} ⇒ at=${fmt(head)})`;
      if (m.width > b + EPS || m.height > h + EPS)
        return `tenone ${fmt(m.width)}×${fmt(m.height)} più grande della sezione ${fmt(b)}×${fmt(h)}`;
      if (m.length >= L - EPS) return `lunghezza del tenone ${fmt(m.length)} non inferiore alla lunghezza del pezzo (${fmt(L)})`;
      return undefined;
    }
    case "asola-lama": {
      const head = m.face === "testa-inizio" ? 0 : L;
      if (Math.abs(m.at - head) > EPS) return `l'asola deve partire dalla testa (${m.face} ⇒ at=${fmt(head)})`;
      if (m.width >= b - EPS) return `width ${fmt(m.width)} non inferiore alla base della sezione (${fmt(b)})`;
      if (m.height >= h - EPS) return `height ${fmt(m.height)} non inferiore all'altezza della sezione (${fmt(h)})`;
      if (m.depth >= thickness - EPS) return `depth ${fmt(m.depth)} non inferiore alla lunghezza del pezzo (${fmt(thickness)})`;
      const off = m.offset ?? 0;
      if (Math.abs(off) + m.height / 2 > h / 2 + EPS)
        return `offset ${fmt(off)}: l'asola (alta ${fmt(m.height)}) esce dalla sezione (altezza ${fmt(h)})`;
      return undefined;
    }
    case "taglio-testa": {
      const a2 = m.angle2 ?? 0;
      if (Math.abs(m.angle) >= 90 || Math.abs(a2) >= 90) return `angolo di taglio non valido (deve essere in (−90°, 90°))`;
      const extent = (h / 2) * tan(m.angle) + (b / 2) * tan(a2);
      const remaining = m.face === "testa-fine" ? m.at - extent : L - (m.at + extent);
      if (remaining <= EPS) return `il taglio di testa (ingombro ${fmt(extent)} dall'asse) supera la lunghezza del pezzo`;
      return undefined;
    }
  }
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Prossimo id di lavorazione libero sul pezzo: `<pieceId>-L<nn>`. */
export function nextMachiningId(piece: Piece): string {
  const used = new Set(piece.machinings.map((m) => m.id));
  let n = piece.machinings.length + 1;
  while (used.has(`${piece.id}-L${pad2(n)}`)) n++;
  return `${piece.id}-L${pad2(n)}`;
}

/**
 * Crea una lavorazione per `piece` validandone parametri e applicabilità
 * (posizione entro la lunghezza, profondità entro la sezione, ingombro entro la
 * faccia). Lancia `MachiningError` con id pezzo e tipo di lavorazione.
 */
export function createMachining(piece: Piece, spec: MachiningSpec): Machining {
  const type = (spec as { type?: unknown }).type;
  if (!isMachiningType(type))
    throw new MachiningError(piece.id, String(type), `tipo di lavorazione sconosciuto: ${JSON.stringify(type)}`);
  const parsed = MachiningSpecSchema.safeParse(spec);
  if (!parsed.success)
    throw new MachiningError(
      piece.id,
      type,
      parsed.error.issues.map((i) => `${formatPath(i.path)}: ${i.message}`).join("; "),
    );
  const problem = applicabilityProblem(piece, parsed.data);
  if (problem) throw new MachiningError(piece.id, type, problem);
  return { ...parsed.data, id: nextMachiningId(piece), pieceId: piece.id } as Machining;
}

/** Restituisce un nuovo pezzo con la lavorazione aggiunta (l'input non è mutato). */
export function addMachining(piece: Piece, spec: MachiningSpec): Piece {
  return { ...piece, machinings: [...piece.machinings, createMachining(piece, spec)] };
}
