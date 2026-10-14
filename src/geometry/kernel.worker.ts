/// <reference lib="webworker" />
import { createKernel } from "./kernel-core";
import type { ClientMessage } from "./protocol";

/**
 * Web Worker del kernel geometrico (D6): creato da `client.ts` con
 * `new Worker(new URL("./kernel.worker.ts", import.meta.url), { type: "module" })`.
 * Tutta la logica è in `kernel-core.ts`.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;

const kernel = createKernel({
  post: (msg, transfer) => scope.postMessage(msg, transfer),
});

scope.onmessage = (event: MessageEvent<ClientMessage>) => {
  void kernel.handle(event.data);
};
