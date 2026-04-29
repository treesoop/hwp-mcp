import { describe, it, expect } from "vitest";

describe("server module", () => {
  it("imports without throwing", async () => {
    const mod = await import("../src/server.js");
    expect(mod).toBeDefined();
    expect(typeof mod.buildServer).toBe("function");
  });
});
