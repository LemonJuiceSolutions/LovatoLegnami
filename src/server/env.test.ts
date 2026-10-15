import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "./env";

const PROD_OK = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://u:p@db.example.com:5432/lovato",
  AUTH_SECRET: "x".repeat(32),
  NEXT_PUBLIC_SITE_URL: "https://www.lovatolegnami.it",
  RESEND_API_KEY: "re_123",
  EMAIL_FROM: "Lovato Legnami <preventivi@lovatolegnami.it>",
  OFFICE_EMAIL: "ufficio@lovatolegnami.it",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_123",
};

describe("parseEnv", () => {
  it("in produzione senza AUTH_SECRET fallisce citando AUTH_SECRET", () => {
    const { AUTH_SECRET: _omit, ...rest } = PROD_OK;
    expect(() => parseEnv(rest)).toThrow(EnvError);
    expect(() => parseEnv(rest)).toThrow(/AUTH_SECRET/);
  });

  it("in produzione elenca tutte le variabili mancanti", () => {
    try {
      parseEnv({ NODE_ENV: "production" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      const err = e as EnvError;
      expect(err.variables).toEqual(
        expect.arrayContaining(["DATABASE_URL", "AUTH_SECRET", "NEXT_PUBLIC_SITE_URL", "EMAIL_FROM", "OFFICE_EMAIL"]),
      );
      expect(err.message).toContain("OFFICE_EMAIL");
    }
  });

  it("in produzione con tutte le variabili usa i servizi reali", () => {
    const env = parseEnv(PROD_OK);
    expect(env.production).toBe(true);
    expect(env.services).toEqual({ database: "postgres", email: "resend", storage: "blob" });
    expect(env.siteUrl).toBe("https://www.lovatolegnami.it");
    expect(env.warnings).toEqual([]);
  });

  it("in produzione senza RESEND_API_KEY ripiega sulla console con un avviso", () => {
    const { RESEND_API_KEY: _omit, ...rest } = PROD_OK;
    const env = parseEnv(rest);
    expect(env.services.email).toBe("console");
    expect(env.warnings.join(" ")).toContain("RESEND_API_KEY");
  });

  it("AUTH_SECRET troppo corto in produzione è rifiutato", () => {
    expect(() => parseEnv({ ...PROD_OK, AUTH_SECRET: "corto" })).toThrow(/AUTH_SECRET/);
  });

  it("formato non valido: messaggio con il nome della variabile", () => {
    expect(() => parseEnv({ ...PROD_OK, OFFICE_EMAIL: "non-una-email" })).toThrow(/OFFICE_EMAIL/);
    expect(() => parseEnv({ NODE_ENV: "development", NEXT_PUBLIC_SITE_URL: "localhost" })).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("in sviluppo senza variabili usa la configurazione locale", () => {
    const env = parseEnv({ NODE_ENV: "development" });
    expect(env.production).toBe(false);
    expect(env.services).toEqual({ database: "pglite", email: "console", storage: "disk" });
    expect(env.databaseUrl).toBeUndefined();
    expect(env.authSecret.length).toBeGreaterThanOrEqual(32);
    expect(env.siteUrl).toBe("http://localhost:3000");
    expect(env.analytics).toBe(false);
  });

  it("stringhe vuote valgono come assenti e NODE_ENV mancante vale sviluppo", () => {
    const env = parseEnv({ DATABASE_URL: "", RESEND_API_KEY: "" });
    expect(env.services.database).toBe("pglite");
    expect(env.services.email).toBe("console");
  });

  it("NEXT_PUBLIC_ANALYTICS=1 attiva gli analytics", () => {
    expect(parseEnv({ NEXT_PUBLIC_ANALYTICS: "1" }).analytics).toBe(true);
    expect(parseEnv({ NEXT_PUBLIC_ANALYTICS: "0" }).analytics).toBe(false);
  });
});
