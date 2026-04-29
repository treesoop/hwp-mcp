import { describe, it, expect } from "vitest";
import { initRhwp } from "../src/core/wasm-init.js";
import { version } from "@rhwp/core";

describe("initRhwp", () => {
  it("returns once and lets us call rhwp's version()", async () => {
    await initRhwp();
    const v = version();
    expect(typeof v).toBe("string");
    expect(v.length).toBeGreaterThan(0);
  });

  it("is idempotent across multiple calls", async () => {
    await initRhwp();
    await initRhwp();
    await initRhwp();
    expect(typeof version()).toBe("string");
  });

  it("installs the measureTextWidth shim", async () => {
    await initRhwp();
    expect(typeof (globalThis as any).measureTextWidth).toBe("function");
    const w = (globalThis as any).measureTextWidth("12px sans", "한글");
    expect(typeof w).toBe("number");
    expect(w).toBeGreaterThan(0);
  });
});
