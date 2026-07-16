// Browsers and Node 19+ expose a working globalThis.crypto.randomUUID.
// A *static* `import … from "node:crypto"` breaks browser ESM (native modules,
// esm.sh, …): CDNs rewrite it to `/node/crypto.mjs` and the page fails with
// "Failed to fetch dynamically imported module".
//
// Prefer globalThis.crypto; on older Node, fall back via process.getBuiltinModule
// (Node 22+, sync, no static import). Otherwise fail with a clear message —
// Node 18 can pass --experimental-global-webcrypto.
//
// Resolved once here and exported directly, rather than mutating the global
// for a caller to read back later — avoids depending on module-load/test-
// runner ordering for whoever needs a UUID (see BuiltinFunctions.js Uuid).

function resolveRandomUUID() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return () => globalThis.crypto.randomUUID();
  }
  try {
    const getBuiltin = globalThis.process?.getBuiltinModule;
    if (typeof getBuiltin === "function") {
      const crypto = getBuiltin("crypto");
      if (typeof crypto?.webcrypto?.randomUUID === "function") {
        return () => crypto.webcrypto.randomUUID();
      }
      if (typeof crypto?.randomUUID === "function") {
        return () => crypto.randomUUID();
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

const resolved = resolveRandomUUID();

export const randomUUID = resolved
  ? resolved
  : () => {
      throw new Error(
        "globalThis.crypto.randomUUID is unavailable. " +
          "Use a modern browser, Node 19+, or Node 18 with --experimental-global-webcrypto."
      );
    };
