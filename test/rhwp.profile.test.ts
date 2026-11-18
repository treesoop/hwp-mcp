import { describe, expect, it } from "vitest";
import { CURATED, profileFromEnv, selectTools } from "../src/rhwp/profile.js";

const fake = [{ name: "hwp_redact" }, { name: "hwp_split_cell" }, { name: "hwp_run_plan" }];

describe("profileFromEnv", () => {
  const withEnv = (v: string | undefined, fn: () => void) => {
    const prev = process.env.HWP_MCP_PROFILE;
    if (v === undefined) delete process.env.HWP_MCP_PROFILE;
    else process.env.HWP_MCP_PROFILE = v;
    try {
      fn();
    } finally {
      if (prev === undefined) delete process.env.HWP_MCP_PROFILE;
      else process.env.HWP_MCP_PROFILE = prev;
    }
  };

  it("기본은 curated", () => withEnv(undefined, () => expect(profileFromEnv()).toBe("curated")));
  it("full·all 을 받는다", () => {
    withEnv("full", () => expect(profileFromEnv()).toBe("full"));
    withEnv("ALL", () => expect(profileFromEnv()).toBe("full"));
    withEnv(" Full ", () => expect(profileFromEnv()).toBe("full"));
  });
  it("모르는 값은 curated 로 떨어진다 — 오타로 184개가 열리면 안 된다", () =>
    withEnv("everything", () => expect(profileFromEnv()).toBe("curated")));
});

describe("selectTools", () => {
  it("curated 는 목록에 있는 것만", () => {
    expect(selectTools(fake, "curated").map((t) => t.name)).toEqual(["hwp_redact", "hwp_run_plan"]);
  });
  it("full 은 손대지 않고 전부", () => {
    expect(selectTools(fake, "full")).toHaveLength(3);
  });
  it("큐레이션 목록이 비지 않는다", () => {
    expect(CURATED.size).toBeGreaterThan(10);
  });
});
