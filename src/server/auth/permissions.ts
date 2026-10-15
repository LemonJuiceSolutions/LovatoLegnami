/**
 * Ruoli e permessi (spec `autenticazione-ruoli`, P6). Modulo puro, senza dipendenze dal
 * server: lo usano le action e le route (controllo vincolante) e l'interfaccia (solo per
 * nascondere ciò che non è permesso).
 *
 * - `ufficio-tecnico` e `admin`: regole costruttive, lunghezze commerciali e tariffe di
 *   lavorazione (`regole:scrivi`, `listino-tecnico:scrivi`);
 * - `commerciale` e `admin`: prezzi del listino, complicazioni, trasporti, margini e
 *   richieste (`listino:scrivi`, `richieste:gestisci`);
 * - solo `admin`: utenti, impostazioni del sito, cancellazione dei dati personali
 *   (`utenti:gestisci`, `tipologie:scrivi`, `dati:cancella`);
 * - tutti: configuratore interno e lettura di richieste e preventivi.
 */

export const ROLES = ["admin", "ufficio-tecnico", "commerciale"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  admin: "amministratore",
  "ufficio-tecnico": "ufficio tecnico",
  commerciale: "commerciale",
};

export const PERMISSIONS = [
  "configuratore:usa",
  "richieste:leggi",
  "richieste:gestisci",
  "listino:scrivi",
  "listino-tecnico:scrivi",
  "regole:scrivi",
  "tipologie:scrivi",
  "preset:scrivi",
  "utenti:gestisci",
  "dati:cancella",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Role[] = ROLES;

/** Ruoli abilitati per ogni permesso. */
export const PERMISSION_ROLES: Readonly<Record<Permission, readonly Role[]>> = {
  "configuratore:usa": ALL,
  "richieste:leggi": ALL,
  "richieste:gestisci": ["admin", "commerciale"],
  "listino:scrivi": ["admin", "commerciale"],
  "listino-tecnico:scrivi": ["admin", "ufficio-tecnico"],
  "regole:scrivi": ["admin", "ufficio-tecnico"],
  "tipologie:scrivi": ["admin"],
  "preset:scrivi": ["admin", "ufficio-tecnico"],
  "utenti:gestisci": ["admin"],
  "dati:cancella": ["admin"],
};

/** Chi può operare: il minimo che serve per decidere (sessione o riga utente). */
export interface Actor {
  readonly role: Role | string;
  readonly active?: boolean;
}

export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as readonly string[]).includes(v);

/** `true` se l'utente (attivo) ha il permesso. Ruolo sconosciuto o utente disattivato ⇒ `false`. */
export function can(user: Actor | null | undefined, permission: Permission): boolean {
  if (!user || user.active === false || !isRole(user.role)) return false;
  return PERMISSION_ROLES[permission].includes(user.role);
}

/** Permessi dell'utente (per l'interfaccia). */
export const permissionsOf = (user: Actor | null | undefined): Permission[] => PERMISSIONS.filter((p) => can(user, p));

/**
 * Chi è abilitato, in una frase per i messaggi di rifiuto: "operazione riservata
 * all'ufficio tecnico", "… al commerciale", "… all'amministratore". L'`admin` è
 * sottinteso quando il permesso è condiviso con un altro ruolo.
 */
export function reservedTo(permission: Permission): string {
  const roles = PERMISSION_ROLES[permission];
  const shown = roles.length > 1 ? roles.filter((r) => r !== "admin") : roles;
  const art = (r: Role) => (r === "admin" || r === "ufficio-tecnico" ? `all'${ROLE_LABELS[r]}` : `al ${ROLE_LABELS[r]}`);
  return `operazione riservata ${shown.map(art).join(" o ")}`;
}

/**
 * Parti del listino di competenza dell'ufficio tecnico (prefissi di percorso del
 * documento): lunghezze commerciali e parametri di taglio, tariffe di lavorazione. Il
 * resto (prezzi, ferramenta, finiture, montaggio, complicazioni, trasporto, margini,
 * IVA) è del commerciale.
 */
export const TECHNICAL_PRICE_LIST_PATHS = ["timber.stockLengths", "timber.minReusableOffcut", "timber.endTrim", "timber.kerf", "machining"] as const;

/** Permesso richiesto per modificare il campo del listino al percorso dato (formato `diffDocuments`). */
export function priceListPathPermission(path: string): Permission {
  const technical = TECHNICAL_PRICE_LIST_PATHS.some((p) => path === p || path.startsWith(`${p}.`) || path.startsWith(`${p}[`));
  return technical ? "listino-tecnico:scrivi" : "listino:scrivi";
}

/** Permessi richiesti da un insieme di modifiche al listino (percorsi delle differenze). */
export function priceListChangePermissions(paths: Iterable<string>): Permission[] {
  const out = new Set<Permission>();
  for (const p of paths) out.add(priceListPathPermission(p));
  return [...out].sort();
}

/** Pubblicare il listino: basta uno dei due permessi di scrittura del listino. */
export const canPublishPriceList = (user: Actor | null | undefined): boolean => can(user, "listino:scrivi") || can(user, "listino-tecnico:scrivi");
