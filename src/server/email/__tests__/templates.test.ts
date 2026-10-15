import { describe, expect, it } from "vitest";
import { customerConfirmationEmail } from "../templates/conferma-cliente";
import { officeNotificationEmail } from "../templates/notifica-ufficio";

const confirmation = {
  leadId: "lead-1",
  code: "PRV-2026-00042",
  name: "Anna <script>alert(1)</script> Verdi",
  typology: "Pergola addossata monofalda",
  total: "4.700,00 €",
  range: "4.230,00 € – 5.170,00 €",
  notes: ["Prezzo indicativo (±10%), soggetto a sopralluogo."],
  link: "https://www.esempio.it/p/abc",
  expiresOn: "2027-01-13",
};

describe("template email (8.1)", () => {
  it("conferma al cliente: codice, prezzo, collegamento, PDF allegato e valori del cliente con escape", () => {
    const m = customerConfirmationEmail("anna@esempio.it", confirmation, new Uint8Array([37, 80, 68, 70]));
    expect(m.subject).toBe("Lovato Legnami: richiesta di preventivo PRV-2026-00042 ricevuta");
    expect(m.text).toContain("4.700,00 € IVA inclusa");
    expect(m.text).toContain("https://www.esempio.it/p/abc");
    expect(m.text).toContain("13/01/2027");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.attachments).toEqual([{ filename: "preventivo-PRV-2026-00042.pdf", content: new Uint8Array([37, 80, 68, 70]), contentType: "application/pdf" }]);
  });

  it("conferma senza prezzo (incompleto) → prezzo su richiesta, nessun allegato senza PDF", () => {
    const m = customerConfirmationEmail("anna@esempio.it", { ...confirmation, total: null, range: null });
    expect(m.text).toContain("su richiesta");
    expect(m.attachments).toBeUndefined();
  });

  it("collegamento non http(s) rifiutato", () => {
    expect(() => customerConfirmationEmail("a@b.it", { ...confirmation, link: "javascript:alert(1)" })).toThrow();
  });

  it("notifica all'ufficio: oggetto su una riga, escape delle note, replyTo del cliente", () => {
    const m = officeNotificationEmail("ufficio@lovato.it", {
      leadId: "lead-1",
      code: "PRV-2026-00042",
      customer: { name: "Mario\r\nBcc: x@evil.it", email: "mario@esempio.it", phone: "333", cap: "37026", comune: "Pescantina" },
      typology: "Pergola addossata monofalda",
      total: "4.700,00 €",
      notes: "<img src=x onerror=alert(1)>\nseconda riga",
      photos: 2,
      adminUrl: "https://www.esempio.it/admin/richieste/lead-1",
    });
    expect(m.subject).toBe("Nuova richiesta PRV-2026-00042 – Mario Bcc: x@evil.it (Pescantina)");
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain("&lt;img src=x onerror=alert(1)&gt;<br>seconda riga");
    expect(m.replyTo).toBe("mario@esempio.it");
    expect(m.text).toContain("Apri la richiesta: https://www.esempio.it/admin/richieste/lead-1");
  });
});
