import { describe, it, expect } from "vitest";
import {
  PLAY_STORE_URL,
  effectiveDeviceMode,
  parseDeviceMode,
  shouldOfferApp,
} from "../../src/obsidian/deviceModeLogic";

describe("parseDeviceMode", () => {
  it("accepts the two choices and nothing else", () => {
    expect(parseDeviceMode("full")).toBe("full");
    expect(parseDeviceMode("light")).toBe("light");
    expect(parseDeviceMode(null)).toBeNull();
    expect(parseDeviceMode("Full")).toBeNull();
    expect(parseDeviceMode(1)).toBeNull();
  });
});

describe("effectiveDeviceMode", () => {
  it("desktop is always full, whatever is stored", () => {
    expect(effectiveDeviceMode(null, false)).toBe("full");
    expect(effectiveDeviceMode("light", false)).toBe("full");
  });

  it("mobile defaults to light; a stored choice wins", () => {
    expect(effectiveDeviceMode(null, true)).toBe("light");
    expect(effectiveDeviceMode("full", true)).toBe("full");
    expect(effectiveDeviceMode("light", true)).toBe("light");
  });
});

describe("shouldOfferApp", () => {
  it("only on a mobile device where nobody has chosen", () => {
    expect(shouldOfferApp(null, true)).toBe(true);
    expect(shouldOfferApp("light", true)).toBe(false);
    expect(shouldOfferApp("full", true)).toBe(false);
    expect(shouldOfferApp(null, false)).toBe(false);
  });
});

describe("PLAY_STORE_URL", () => {
  it("points at the app's package", () => {
    expect(PLAY_STORE_URL).toBe("https://play.google.com/store/apps/details?id=com.marktodo.app");
  });
});
