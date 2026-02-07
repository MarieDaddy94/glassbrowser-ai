// Keep a single source of truth for preload bridge wiring.
// Some legacy launch paths still reference the root preload script.
require('./electron/preload.cjs');
