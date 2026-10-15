/**
 * Consenso al trattamento dei dati (GDPR) richiesto all'invio della richiesta. Il testo
 * e la versione sono quelli del server: il client dichiara la versione che ha mostrato e,
 * se non coincide (informativa aggiornata nel frattempo), l'invio è rifiutato.
 * Testo DA VALIDARE con il consulente privacy di Lovato; la pagina `/privacy` arriva con
 * il sito pubblico (gruppo 11) e deve riportare la stessa versione.
 */
export const PRIVACY_NOTICE_VERSION = "2026-10";

export const CONSENT_TEXT =
  "Acconsento al trattamento dei miei dati personali da parte di Lovato Legnami per rispondere alla richiesta di preventivo, " +
  "come descritto nell'informativa sulla privacy (versione " +
  PRIVACY_NOTICE_VERSION +
  ").";

export const CONSENT_REQUIRED_MESSAGE = "Per inviare la richiesta devi accettare l'informativa sul trattamento dei dati.";
