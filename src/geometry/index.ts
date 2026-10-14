// Modulo geometry – API pubblica per UI ed export (D6). Solo moduli senza
// dipendenze da OCCT: il kernel (replicad/WASM) vive nel worker
// (`kernel.worker.ts`, `kernel-core.ts`, `occt/*`) e non va importato da qui.
export * from "./protocol";
export * from "./neutral-brep";
export * from "./neutral-brep-box";
export * from "./cache";
export * from "./client";
