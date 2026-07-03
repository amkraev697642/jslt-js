// Node 18 exposes Web Crypto on node:crypto.webcrypto, not globalThis.crypto.
// Browser and Node 19+ already have globalThis.crypto.randomUUID.
import { webcrypto, randomUUID } from "node:crypto";

if (typeof globalThis.crypto?.randomUUID !== "function") {
  if (webcrypto?.randomUUID) {
    globalThis.crypto = webcrypto;
  } else {
    globalThis.crypto = { randomUUID: () => randomUUID() };
  }
}
