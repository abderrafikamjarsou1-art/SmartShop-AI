import { describe, it, expect } from "vitest";
import { zBoolParam } from "@/lib/validation";

/**
 * Regression: plain `z.coerce.boolean()` is a footgun for query-string
 * filters — `Boolean("false")` is `true`, so a client that explicitly
 * sends `?flag=false` (rather than omitting the param) gets `true` back.
 * Found via a real mobile bug: the notifications "All" filter always
 * behaved like "Unread" because the client sent `unreadOnly=false`
 * literally, which `z.coerce.boolean()` coerced to `true`.
 */
describe("zBoolParam", () => {
  it("the string \"false\" parses to false (the exact bug this fixes)", () => {
    expect(zBoolParam.parse("false")).toBe(false);
  });

  it("the string \"true\" parses to true", () => {
    expect(zBoolParam.parse("true")).toBe(true);
  });

  it("an omitted value falls back to the default (false)", () => {
    expect(zBoolParam.parse(undefined)).toBe(false);
  });

  it("a real boolean false stays false (JSON body case)", () => {
    expect(zBoolParam.parse(false)).toBe(false);
  });

  it("a real boolean true stays true (JSON body case)", () => {
    expect(zBoolParam.parse(true)).toBe(true);
  });
});
