import 'fake-indexeddb/auto';

// The crypto utilities were written for the browser and reference `window.crypto`.
// Vitest runs in Node, which already exposes the Web Crypto API globally.
if (typeof (globalThis as any).window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: globalThis,
    configurable: true,
    writable: true
  });
}
