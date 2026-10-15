import { crc32, deflateSync } from "node:zlib";

/** Byte iniziali di file reali (sufficienti per il riconoscimento del tipo). */
export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
export const WEBP = new Uint8Array([...Buffer.from("RIFF"), 0x24, 0x00, 0x00, 0x00, ...Buffer.from("WEBPVP8 ")]);
export const HEIC = new Uint8Array([0x00, 0x00, 0x00, 0x18, ...Buffer.from("ftypheic"), 0x00, 0x00, 0x00, 0x00]);
export const PDF = new Uint8Array(Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj\n"));
export const SVG = new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
export const HTML = new Uint8Array(Buffer.from("<!doctype html><script>alert(1)</script>"));

/** PNG 2×2 valido (RGB) per l'immagine della scena. */
export function tinyPng(): Uint8Array {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.from([0, 200, 150, 100, 90, 60, 30, 0, 90, 60, 30, 200, 150, 100]);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

