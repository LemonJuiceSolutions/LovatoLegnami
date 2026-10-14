/** Errore della ferramenta: codice sconosciuto o applicazione impossibile. */
export class HardwareError extends Error {
  /** Codice di catalogo coinvolto. */
  readonly code: string;
  /** Id della voce di ferramenta (se già assegnato). */
  readonly hardwareId?: string;

  constructor(code: string, reason: string, hardwareId?: string) {
    super(`Ferramenta ${hardwareId ? `${hardwareId} ` : ""}"${code}": ${reason}`);
    this.name = "HardwareError";
    this.code = code;
    this.hardwareId = hardwareId;
  }
}
