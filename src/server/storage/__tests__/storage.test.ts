import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createLocalDiskStorage, createMemoryStorage, newUploadKey, StorageKeyError } from "../storage";
import { JPEG } from "./fixtures";

const dirs: string[] = [];
afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

describe("archivio dei file (8.2)", () => {
  it("round-trip su disco locale: scrittura, lettura con tipo, cancellazione", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lovato-uploads-"));
    dirs.push(root);
    const storage = createLocalDiskStorage(root);
    const { id, key } = newUploadKey("foto");
    expect(id).toMatch(/^[A-Za-z0-9_-]{32}$/);
    await storage.put(key, JPEG, "image/jpeg");
    expect(await storage.get(key)).toEqual({ bytes: JPEG, contentType: "image/jpeg" });
    expect(await readdir(path.join(root, "foto"))).toEqual([id, `${id}.type`].sort());
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });

  it("chiavi non generate dal server rifiutate (niente percorsi)", async () => {
    const storage = createLocalDiskStorage(path.join(tmpdir(), "mai-usata"));
    for (const key of ["../../etc/passwd", "foto/../../x", "foto/abc", "altro/" + "a".repeat(32), "/foto/" + "a".repeat(32)])
      await expect(storage.get(key)).rejects.toBeInstanceOf(StorageKeyError);
    await expect(createMemoryStorage().put("foto/..", JPEG, "image/jpeg")).rejects.toBeInstanceOf(StorageKeyError);
  });

  it("chiavi casuali e distinte", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newUploadKey("foto").id));
    expect(ids.size).toBe(200);
  });
});
