import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import init from "@rhwp/core";

const require = createRequire(import.meta.url);

let ready: Promise<void> | null = null;

function installMeasureShim(): void {
  if (typeof (globalThis as any).measureTextWidth === "function") return;
  (globalThis as any).measureTextWidth = (font: string, text: string): number => {
    const match = /([0-9.]+)\s*(px|pt)?/.exec(font);
    const size = match ? parseFloat(match[1]) : 12;
    let w = 0;
    for (const ch of text) {
      const cp = ch.codePointAt(0) ?? 0;
      const isCjk =
        (cp >= 0x3000 && cp <= 0x303f) ||
        (cp >= 0x3040 && cp <= 0x30ff) ||
        (cp >= 0x3400 && cp <= 0x4dbf) ||
        (cp >= 0x4e00 && cp <= 0x9fff) ||
        (cp >= 0xac00 && cp <= 0xd7a3) ||
        (cp >= 0xff00 && cp <= 0xffef);
      w += isCjk ? size : size * 0.55;
    }
    return w;
  };
}

export function initRhwp(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    installMeasureShim();
    const wasmPath = require.resolve("@rhwp/core/rhwp_bg.wasm");
    const bytes = readFileSync(wasmPath);
    await init({ module_or_path: bytes });
  })();
  return ready;
}
