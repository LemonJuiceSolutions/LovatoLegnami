import type { ValidationIssue } from "@/domain/components/errors";

/**
 * Errori dei repository: hanno messaggi in italiano mostrabili all'ufficio e un `code`
 * stabile che le server action e le route traducono in stato HTTP (400/404/409).
 */

export type RepositoryErrorCode = "non-valido" | "non-trovato" | "conflitto" | "modificato";

export class RepositoryError extends Error {
  constructor(
    readonly code: RepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

/** Documento non valido per lo schema del suo insieme di dati: elenca i campi errati. */
export class DatasetValidationError extends RepositoryError {
  constructor(
    readonly dataset: string,
    readonly issues: readonly ValidationIssue[],
  ) {
    super("non-valido", `${dataset} non valido: ${issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join("; ")}`);
    this.name = "DatasetValidationError";
  }
}

export class NotFoundError extends RepositoryError {
  constructor(message: string) {
    super("non-trovato", message);
    this.name = "NotFoundError";
  }
}

/** Operazione in conflitto con lo stato attuale (es. stato della richiesta non ammesso). */
export class ConflictError extends RepositoryError {
  constructor(message: string) {
    super("conflitto", message);
    this.name = "ConflictError";
  }
}

/** Lock ottimistico: la bozza è cambiata dopo che l'utente l'ha aperta. */
export class ConcurrentEditError extends RepositoryError {
  constructor(
    readonly modifiedBy: string,
    readonly modifiedAt: Date,
  ) {
    super("modificato", `la bozza è stata modificata da ${modifiedBy} il ${modifiedAt.toLocaleString("it-IT", { timeZone: "Europe/Rome" })}: ricarica la pagina prima di salvare`);
    this.name = "ConcurrentEditError";
  }
}
