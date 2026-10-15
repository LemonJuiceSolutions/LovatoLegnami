import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, ONLY_IMAGES_MESSAGE, sniffImageType, UploadError, validateImage, validatePhotos } from "../images";
import { HEIC, HTML, JPEG, PDF, PNG, SVG, WEBP } from "./fixtures";

describe("validazione immagini (8.2)", () => {
  it("riconosce JPEG, PNG, WebP e HEIC dai byte iniziali", () => {
    expect([JPEG, PNG, WEBP, HEIC].map(sniffImageType)).toEqual(["image/jpeg", "image/png", "image/webp", "image/heic"]);
  });

  it("PDF rinominato .jpg rifiutato con «sono ammesse solo immagini»", () => {
    const err = (() => {
      try {
        validatePhotos([{ name: "foto-giardino.jpg", bytes: PDF }]);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(UploadError);
    expect((err as UploadError).message).toBe(ONLY_IMAGES_MESSAGE);
    expect((err as UploadError).field).toBe("photos");
  });

  it("SVG e HTML (contenuto attivo) non sono immagini ammesse", () => {
    expect(() => validateImage({ name: "a.png", bytes: SVG })).toThrow(ONLY_IMAGES_MESSAGE);
    expect(() => validateImage({ name: "a.webp", bytes: HTML })).toThrow(ONLY_IMAGES_MESSAGE);
  });

  it("6 file → rifiuto; 5 accettati", () => {
    expect(() => validatePhotos(Array.from({ length: 6 }, () => ({ bytes: JPEG })))).toThrow("al massimo 5 foto");
    expect(validatePhotos(Array.from({ length: 5 }, () => ({ bytes: PNG })))).toHaveLength(5);
  });

  it("oltre 8 MB o vuoto → rifiuto", () => {
    const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
    big.set(JPEG);
    expect(() => validateImage({ bytes: big })).toThrow("al massimo 8 MB");
    expect(() => validateImage({ bytes: new Uint8Array() })).toThrow("vuoto");
  });
});
