import { describe, expect, it } from "vitest";
import { migrationTargetError } from "./migrate-target";

describe("destinazione delle migrazioni", () => {
  it("in locale senza DATABASE_URL si migra PGlite", () => {
    expect(migrationTargetError({})).toBeNull();
  });

  it("su Vercel senza DATABASE_URL il build fallisce nominando la variabile", () => {
    expect(migrationTargetError({ VERCEL: "1", VERCEL_ENV: "preview" })).toMatch(/DATABASE_URL.*preview/);
    expect(migrationTargetError({ VERCEL: "1", DATABASE_URL: "  " })).toMatch(/DATABASE_URL/);
  });

  it("su Vercel con DATABASE_URL si procede", () => {
    expect(migrationTargetError({ VERCEL: "1", DATABASE_URL: "postgres://u:p@h/db" })).toBeNull();
  });
});
