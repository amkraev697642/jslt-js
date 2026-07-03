// Node 18 exposes Web Crypto on node:crypto.webcrypto, not globalThis.crypto
// (needs --experimental-global-webcrypto there). Browser and Node 19+ already
// have a native, working globalThis.crypto.randomUUID.
//
// Resolved once here and exported directly, rather than mutating the global
// for a caller to read back later — avoids depending on module-load/test-
// runner ordering for whoever needs a UUID (see BuiltinFunctions.js Uuid).
import { webcrypto, randomUUID as nodeRandomUUID } from "node:crypto";

export const randomUUID = typeof globalThis.crypto?.randomUUID === "function"
  ? () => globalThis.crypto.randomUUID()
  : webcrypto?.randomUUID
    ? () => webcrypto.randomUUID()
    : () => nodeRandomUUID();
