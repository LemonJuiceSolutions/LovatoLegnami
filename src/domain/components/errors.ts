import type { ZodError } from "zod";

/** Singolo problema di validazione con percorso del campo (es. `pieces[0].section.b`). */
export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

/** Errore di validazione di dati del dominio; il messaggio elenca percorso e problema. */
export class ValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(context: string, issues: readonly ValidationIssue[]) {
    super(`${context}: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

/** Lavorazione non applicabile al pezzo (o non riconosciuta). */
export class MachiningError extends Error {
  readonly pieceId: string;
  readonly machiningType: string;

  constructor(pieceId: string, machiningType: string, reason: string) {
    super(`Lavorazione "${machiningType}" non applicabile al pezzo ${pieceId}: ${reason}`);
    this.name = "MachiningError";
    this.pieceId = pieceId;
    this.machiningType = machiningType;
  }
}

/** Giunto non espandibile (pezzi mancanti, geometria incompatibile). */
export class JointError extends Error {
  readonly jointId: string;

  constructor(jointId: string, reason: string) {
    super(`Giunto ${jointId}: ${reason}`);
    this.name = "JointError";
    this.jointId = jointId;
  }
}

/** Percorso zod → stringa leggibile: `["pieces", 0, "section", "b"]` → `pieces[0].section.b`. */
export function formatPath(path: readonly (string | number)[]): string {
  let out = "";
  for (const seg of path) {
    if (typeof seg === "number") out += `[${seg}]`;
    else out += out === "" ? seg : `.${seg}`;
  }
  return out === "" ? "(radice)" : out;
}

export const issuesFromZod = (err: ZodError): ValidationIssue[] =>
  err.issues.map((i) => ({ path: formatPath(i.path), message: i.message }));
