/**
 * Electron main process entry shim.
 *
 * tsyringe checks for the Reflect.metadata polyfill the moment its CJS
 * module is evaluated, so reflect-metadata must already be installed in
 * the global scope by then. This shim is the package's `main`, and it
 * loads reflect-metadata synchronously before requiring the bundled
 * main process (./main.cjs). Keeping this entry CJS also avoids the
 * Electron behavior where an ESM main paired with an async dynamic
 * import causes app.whenReady() to never resolve.
 *
 * This file MUST be CJS — Electron loads it synchronously and the
 * require() ordering is the whole point of the shim. ESLint's
 * no-require-imports rule does not apply here.
 */
/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
require('reflect-metadata');
require('./main.cjs');
