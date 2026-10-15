import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  ROLES,
  can,
  canPublishPriceList,
  permissionsOf,
  priceListChangePermissions,
  priceListPathPermission,
  reservedTo,
  type Permission,
  type Role,
} from "../permissions";

const u = (role: Role, active = true) => ({ role, active });

/** Matrice attesa dalla spec `autenticazione-ruoli` (✓ = permesso). */
const MATRIX: Record<Permission, Record<Role, boolean>> = {
  "configuratore:usa": { admin: true, "ufficio-tecnico": true, commerciale: true },
  "richieste:leggi": { admin: true, "ufficio-tecnico": true, commerciale: true },
  "richieste:gestisci": { admin: true, "ufficio-tecnico": false, commerciale: true },
  "listino:scrivi": { admin: true, "ufficio-tecnico": false, commerciale: true },
  "listino-tecnico:scrivi": { admin: true, "ufficio-tecnico": true, commerciale: false },
  "regole:scrivi": { admin: true, "ufficio-tecnico": true, commerciale: false },
  "tipologie:scrivi": { admin: true, "ufficio-tecnico": false, commerciale: false },
  "preset:scrivi": { admin: true, "ufficio-tecnico": true, commerciale: false },
  "utenti:gestisci": { admin: true, "ufficio-tecnico": false, commerciale: false },
  "dati:cancella": { admin: true, "ufficio-tecnico": false, commerciale: false },
};

describe("permessi per ruolo (7.1)", () => {
  it("la matrice coincide con la spec", () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...PERMISSIONS].sort());
    for (const p of PERMISSIONS) for (const r of ROLES) expect([p, r, can(u(r), p)]).toEqual([p, r, MATRIX[p][r]]);
  });

  it("il commerciale pubblica il listino ma non le regole", () => {
    expect(can(u("commerciale"), "listino:scrivi")).toBe(true);
    expect(canPublishPriceList(u("commerciale"))).toBe(true);
    expect(can(u("commerciale"), "regole:scrivi")).toBe(false);
    expect(reservedTo("regole:scrivi")).toBe("operazione riservata all'ufficio tecnico");
  });

  it("solo l'admin gestisce utenti e cancella dati personali", () => {
    for (const p of ["utenti:gestisci", "dati:cancella"] as const) {
      expect(ROLES.filter((r) => can(u(r), p))).toEqual(["admin"]);
      expect(reservedTo(p)).toBe("operazione riservata all'amministratore");
    }
    expect(reservedTo("richieste:gestisci")).toBe("operazione riservata al commerciale");
  });

  it("utente disattivato, ruolo sconosciuto o assente ⇒ nessun permesso", () => {
    expect(permissionsOf(u("admin", false))).toEqual([]);
    expect(permissionsOf({ role: "ospite" })).toEqual([]);
    expect(can(null, "configuratore:usa")).toBe(false);
    expect(can(undefined, "richieste:leggi")).toBe(false);
  });

  it("le parti tecniche del listino richiedono l'ufficio tecnico", () => {
    expect(priceListPathPermission("timber.stockLengths.80×160[0].length")).toBe("listino-tecnico:scrivi");
    expect(priceListPathPermission("machining.perType.foro.baseCents")).toBe("listino-tecnico:scrivi");
    expect(priceListPathPermission("timber.pricePerM3.abete.lamellare")).toBe("listino:scrivi");
    expect(priceListPathPermission("timber.kerfX")).toBe("listino:scrivi");
    expect(priceListPathPermission("complications[2].value")).toBe("listino:scrivi");
    expect(priceListChangePermissions(["margins.materialsPct", "timber.kerf", "transport.zones[0].priceCents"])).toEqual(["listino-tecnico:scrivi", "listino:scrivi"]);
    expect(canPublishPriceList(u("ufficio-tecnico"))).toBe(true);
  });
});
