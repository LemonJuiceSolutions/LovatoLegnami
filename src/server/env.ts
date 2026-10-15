import { z } from "zod";

/**
 * Variabili d'ambiente del server (P12), validate con zod.
 *
 * In produzione (`NODE_ENV=production`) sono obbligatorie `DATABASE_URL`, `AUTH_SECRET`
 * (≥ 32 caratteri), `NEXT_PUBLIC_SITE_URL`, `EMAIL_FROM` e `OFFICE_EMAIL`; in sviluppo e
 * nei test nessuna è obbligatoria e si usa la configurazione locale: PGlite su disco,
 * email stampate in console, foto su disco (`.data/`). Le opzionali (`RESEND_API_KEY`,
 * `BLOB_READ_WRITE_TOKEN`, `ADMIN_EMAIL`, `NEXT_PUBLIC_ANALYTICS`) scelgono il servizio
 * reale quando presenti.
 *
 * `parseEnv` è puro (riceve la sorgente); `getEnv()` legge `process.env` una volta per
 * processo. Va chiamato a runtime, non al caricamento del modulo, così `next build`
 * non richiede le variabili di produzione.
 */

export type ServiceKind = {
  readonly database: "postgres" | "pglite";
  readonly email: "resend" | "console";
  readonly storage: "blob" | "disk";
};

export interface ServerEnv {
  readonly nodeEnv: string;
  readonly production: boolean;
  readonly databaseUrl?: string;
  readonly authSecret: string;
  readonly siteUrl: string;
  readonly resendApiKey?: string;
  readonly emailFrom: string;
  readonly officeEmail: string;
  readonly blobToken?: string;
  readonly adminEmail?: string;
  readonly analytics: boolean;
  readonly services: ServiceKind;
  /** Ripieghi locali attivi in produzione (es. email in console senza `RESEND_API_KEY`). */
  readonly warnings: readonly string[];
}

/** Variabili mancanti o non valide: il messaggio nomina ognuna. */
export class EnvError extends Error {
  constructor(
    readonly variables: readonly string[],
    readonly details: readonly string[],
  ) {
    super(`Configurazione d'ambiente non valida: ${details.join("; ")}`);
    this.name = "EnvError";
  }
}

/** Valori di sviluppo: mai usati in produzione. */
const DEV_DEFAULTS = {
  AUTH_SECRET: "sviluppo-locale-non-usare-in-produzione-0000",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  EMAIL_FROM: "Lovato Legnami <preventivi@localhost>",
  OFFICE_EMAIL: "ufficio@localhost",
} as const;

/** Obbligatorie solo in produzione. */
const REQUIRED_IN_PRODUCTION = ["DATABASE_URL", "AUTH_SECRET", "NEXT_PUBLIC_SITE_URL", "EMAIL_FROM", "OFFICE_EMAIL"] as const;

/** Indirizzo semplice o nella forma `Nome <indirizzo>`. */
const mailbox = z
  .string()
  .refine((v) => /^[^\s<>@]+@[^\s<>@]+$/.test(v) || /^[^<>]*<[^\s<>@]+@[^\s<>@]+>$/.test(v.trim()), {
    message: "indirizzo email non valido",
  });

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "deve iniziare con postgres:// o postgresql://")
    .optional(),
  AUTH_SECRET: z.string().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url("URL non valido (es. https://www.esempio.it)").optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: mailbox.optional(),
  OFFICE_EMAIL: z.string().email("indirizzo email non valido").optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  ADMIN_EMAIL: z.string().email("indirizzo email non valido").optional(),
  NEXT_PUBLIC_ANALYTICS: z.enum(["0", "1"], { message: "valori ammessi: 0 o 1" }).optional(),
});

/** Stringhe vuote (o di soli spazi) valgono come variabile assente. */
function clean(source: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(EnvSchema.shape)) {
    const v = source[key]?.trim();
    if (v) out[key] = v;
  }
  return out;
}

export function parseEnv(source: Readonly<Record<string, string | undefined>>): ServerEnv {
  const raw = clean(source);
  const parsed = EnvSchema.safeParse(raw);
  const variables: string[] = [];
  const details: string[] = [];
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const name = String(issue.path[0]);
      variables.push(name);
      details.push(`${name}: ${issue.message}`);
    }
    throw new EnvError(variables, details);
  }
  const v = parsed.data;
  const production = v.NODE_ENV === "production";

  if (production) {
    for (const name of REQUIRED_IN_PRODUCTION) {
      if (v[name] === undefined) {
        variables.push(name);
        details.push(`${name}: variabile mancante (obbligatoria in produzione)`);
      }
    }
    if (v.AUTH_SECRET !== undefined && v.AUTH_SECRET.length < 32) {
      variables.push("AUTH_SECRET");
      details.push("AUTH_SECRET: almeno 32 caratteri in produzione (es. `openssl rand -base64 32`)");
    }
    if (variables.length > 0) throw new EnvError(variables, details);
  }

  const warnings: string[] = [];
  if (production && !v.RESEND_API_KEY) warnings.push("RESEND_API_KEY assente: le email sono stampate in console e non inviate");
  if (production && !v.BLOB_READ_WRITE_TOKEN) warnings.push("BLOB_READ_WRITE_TOKEN assente: le foto sono salvate su disco locale");

  return {
    nodeEnv: v.NODE_ENV,
    production,
    databaseUrl: v.DATABASE_URL,
    authSecret: v.AUTH_SECRET ?? DEV_DEFAULTS.AUTH_SECRET,
    siteUrl: (v.NEXT_PUBLIC_SITE_URL ?? DEV_DEFAULTS.NEXT_PUBLIC_SITE_URL).replace(/\/+$/, ""),
    resendApiKey: v.RESEND_API_KEY,
    emailFrom: v.EMAIL_FROM ?? DEV_DEFAULTS.EMAIL_FROM,
    officeEmail: v.OFFICE_EMAIL ?? DEV_DEFAULTS.OFFICE_EMAIL,
    blobToken: v.BLOB_READ_WRITE_TOKEN,
    adminEmail: v.ADMIN_EMAIL,
    analytics: v.NEXT_PUBLIC_ANALYTICS === "1",
    services: {
      database: v.DATABASE_URL ? "postgres" : "pglite",
      email: v.RESEND_API_KEY ? "resend" : "console",
      storage: v.BLOB_READ_WRITE_TOKEN ? "blob" : "disk",
    },
    warnings,
  };
}

let cached: ServerEnv | undefined;

/** Configurazione del processo corrente (letta e validata alla prima chiamata). */
export function getEnv(): ServerEnv {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Solo per i test: dimentica la configurazione letta. */
export function resetEnvCache(): void {
  cached = undefined;
}
