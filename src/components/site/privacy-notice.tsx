import type { CompanyInfo } from "./company"

const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]

/** Data leggibile della versione `AAAA-MM` dell'informativa (`2026-10` → `ottobre 2026`). */
export function versionDate(version: string): string {
  const m = version.match(/^(\d{4})-(\d{2})/)
  if (!m) return version
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`
}

/**
 * Informativa sul trattamento dei dati (art. 13 GDPR) per il form Contatti e la richiesta
 * di preventivo. La versione è quella del server (`PRIVACY_NOTICE_VERSION`), la stessa
 * dichiarata dal consenso. Testo DA VALIDARE con il consulente privacy di Lovato.
 */
export function PrivacyNotice({ version, company }: { version: string; company: CompanyInfo }) {
  return (
    <article className="site-prose text-[1.0625rem]">
      <p className="text-muted-foreground" data-testid="versione-informativa">
        Versione {version}, aggiornata a {versionDate(version)}.
      </p>

      <h2>Chi tratta i tuoi dati</h2>
      <p>
        Il titolare del trattamento è {company.legalName} ({company.brand}), {company.street}, {company.postalCode} {company.locality} ({company.province}), P.
        IVA {company.vatNumber}. Per qualsiasi domanda sui tuoi dati scrivi a <a href={`mailto:${company.email}`}>{company.email}</a> o chiama il{" "}
        <a href={`tel:${company.phoneHref}`}>{company.phone}</a>.
      </p>

      <h2>Quali dati raccogliamo</h2>
      <ul>
        <li>Con il form Contatti: nome, email, telefono se lo indichi e il testo del messaggio.</li>
        <li>
          Con la richiesta di preventivo: nome, email, telefono, CAP e comune del cantiere, le note, le foto che alleghi e la configurazione della pergola
          (misure, spazio, finiture).
        </li>
        <li>Al momento del consenso: data e ora, versione di questa informativa, indirizzo IP e tipo di browser, per poter dimostrare il consenso dato.</li>
      </ul>

      <h2>Perché li usiamo</h2>
      <p>
        Per rispondere alla tua richiesta, preparare il preventivo, organizzare il sopralluogo e restare in contatto su quel lavoro. La base giuridica è la
        tua richiesta (misure precontrattuali, art. 6.1.b del GDPR) e il consenso che dai inviando il form. Non usiamo i tuoi dati per pubblicità e non li
        vendiamo.
      </p>

      <h2>Chi li vede</h2>
      <p>
        Il personale di {company.brand} che segue la tua richiesta e i fornitori tecnici che ci permettono di far funzionare il sito (hosting, database,
        invio delle email, archivio delle foto), nominati responsabili del trattamento. I dati possono essere conservati su server nell&apos;Unione europea o
        presso fornitori che applicano le garanzie previste dal GDPR.
      </p>

      <h2>Per quanto tempo</h2>
      <p>
        Per il tempo necessario a gestire la richiesta e l&apos;eventuale lavoro, e poi per gli obblighi di legge (ad esempio fiscali). Se il preventivo non
        porta a un ordine, puoi chiederci in qualsiasi momento di cancellare i tuoi dati.
      </p>

      <h2>I tuoi diritti</h2>
      <p>
        Puoi chiedere di accedere ai tuoi dati, correggerli, cancellarli, limitarne il trattamento, riceverli in un formato leggibile e opporti al
        trattamento (artt. 15–22 del GDPR), e puoi ritirare il consenso: basta scrivere a <a href={`mailto:${company.email}`}>{company.email}</a>. Puoi
        anche presentare reclamo al Garante per la protezione dei dati personali (<a href="https://www.garanteprivacy.it">garanteprivacy.it</a>).
      </p>

      <h2>Cookie</h2>
      <p>
        Il sito non usa cookie di profilazione né di terze parti. Le statistiche di visita, se attive, sono anonime e senza cookie. Durante il preventivo il
        browser conserva le risposte nella memoria della scheda, che si cancella alla chiusura.
      </p>
    </article>
  )
}
