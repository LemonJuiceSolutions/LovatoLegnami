import { describe, expect, it, vi } from "vitest";
import { downloadFile, toBlob, type DownloadEnv } from "./download";

function fakeEnv() {
  const anchor = {
    href: "",
    download: "",
    rel: "",
    style: { display: "" },
    click: vi.fn(),
    remove: vi.fn(),
  };
  const appended: unknown[] = [];
  const blobs: Blob[] = [];
  const revoked: string[] = [];
  const env: DownloadEnv = {
    document: {
      createElement: (() => anchor) as unknown as Document["createElement"],
      body: { appendChild: (n: unknown) => appended.push(n) } as unknown as HTMLElement,
    },
    URL: {
      createObjectURL: (b: Blob | MediaSource) => {
        blobs.push(b as Blob);
        return "blob:fake/1";
      },
      revokeObjectURL: (u: string) => revoked.push(u),
    },
    defer: (fn) => fn(),
  };
  return { env, anchor, appended, blobs, revoked };
}

describe("downloadFile", () => {
  it("crea il Blob, clicca un link con il nome file e revoca l'URL", async () => {
    const { env, anchor, appended, blobs, revoked } = fakeEnv();
    downloadFile("ISO-10303-21;", "pergola-x-20261014-0930.step", "application/step", env);
    expect(anchor.download).toBe("pergola-x-20261014-0930.step");
    expect(anchor.href).toBe("blob:fake/1");
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(appended).toEqual([anchor]);
    expect(revoked).toEqual(["blob:fake/1"]);
    expect(blobs[0].type).toBe("application/step");
    expect(await blobs[0].text()).toBe("ISO-10303-21;");
  });

  it("toBlob accetta Uint8Array e Blob", async () => {
    const b = toBlob(new Uint8Array([80, 75]), "application/zip");
    expect(b.type).toBe("application/zip");
    expect(new Uint8Array(await b.arrayBuffer())).toEqual(new Uint8Array([80, 75]));
    const typed = new Blob(["a"], { type: "text/plain" });
    expect(toBlob(typed, "application/json")).toBe(typed);
    expect(toBlob(new Blob(["a"]), "application/json").type).toBe("application/json");
  });
});
