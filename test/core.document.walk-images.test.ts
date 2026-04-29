import { describe, it, expect } from "vitest";
import { openDocument, closeDocument, walkImages, getImageBytes } from "../src/core/document.js";

describe("walkImages / getImageBytes", () => {
  it("lists the inserted image with mime and length", async () => {
    const doc = await openDocument("test/fixtures/simple.hwp");
    const imgs = walkImages(doc);
    expect(imgs.length).toBeGreaterThanOrEqual(1);
    const first = imgs[0];
    expect(first.mime).toMatch(/png|image/i);
    expect(first.byteLength).toBeGreaterThan(0);
    closeDocument(doc);
  });

  it("retrieves image bytes that start with the PNG signature", async () => {
    const doc = await openDocument("test/fixtures/simple.hwp");
    const imgs = walkImages(doc);
    const bytes = getImageBytes(doc, imgs[0]);
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
    closeDocument(doc);
  });
});
