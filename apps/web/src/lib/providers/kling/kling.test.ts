import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { klingAuthorization, klingJwt } from "./index";

describe("klingAuthorization", () => {
  it("uses the API key directly when present", () => {
    expect(klingAuthorization({ apiKey: "kl-abc123" })).toBe("Bearer kl-abc123");
  });

  it("prefers the API key over legacy credentials", () => {
    const header = klingAuthorization({
      apiKey: "kl-abc123",
      accessKey: "ak",
      secretKey: "sk",
    });
    expect(header).toBe("Bearer kl-abc123");
  });

  it("falls back to a JWT for legacy access/secret key pairs", () => {
    const header = klingAuthorization({ accessKey: "ak", secretKey: "sk" });
    expect(header).toBe(`Bearer ${klingJwt("ak", "sk")}`);
  });

  it("throws without any credentials", () => {
    expect(() => klingAuthorization({})).toThrow(/API key/);
  });
});

describe("klingJwt", () => {
  it("produces a valid HS256 JWT with Kling's claims", () => {
    const token = klingJwt("my-access-key", "my-secret");
    const [header, payload, signature] = token.split(".");

    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "HS256",
      typ: "JWT",
    });

    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    const now = Math.floor(Date.now() / 1000);
    expect(claims.iss).toBe("my-access-key");
    expect(claims.exp).toBeGreaterThan(now + 1700);
    expect(claims.exp).toBeLessThanOrEqual(now + 1800);
    expect(claims.nbf).toBeLessThan(now);

    const expected = createHmac("sha256", "my-secret")
      .update(`${header}.${payload}`)
      .digest("base64url");
    expect(signature).toBe(expected);
  });
});
