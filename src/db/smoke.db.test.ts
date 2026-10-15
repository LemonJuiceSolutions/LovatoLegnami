import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";

describe("progetto db: PGlite in memoria", () => {
  const db = new PGlite();
  afterAll(() => db.close());

  it("apre un database in memoria ed esegue SQL", async () => {
    await db.exec("create table prova (id serial primary key, nome text not null)");
    await db.query("insert into prova (nome) values ($1)", ["abete"]);
    const res = await db.query<{ nome: string }>("select nome from prova");
    expect(res.rows).toEqual([{ nome: "abete" }]);
  });
});
