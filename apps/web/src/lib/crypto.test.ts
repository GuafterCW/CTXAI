import { beforeAll, describe, expect, it } from "vitest";
import { decrypt, decryptJson, encrypt, encryptJson } from "./crypto";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = "a".repeat(64);
});

describe("crypto", () => {
  it("round-trips plaintext", () => {
    const secret = "sk-super-secret-key-🔑";
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it("round-trips JSON payloads", () => {
    const creds = { accessKey: "AK123", secretKey: "SK456" };
    expect(decryptJson(encryptJson(creds))).toEqual(creds);
  });

  it("produces a different ciphertext per call (random IV)", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("rejects tampered ciphertext", () => {
    const payload = Buffer.from(encrypt("payload"), "base64");
    payload[payload.length - 1] ^= 0xff;
    expect(() => decrypt(payload.toString("base64"))).toThrow();
  });

  it("requires a valid key", () => {
    const key = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "too-short";
    expect(() => encrypt("x")).toThrow(/ENCRYPTION_KEY/);
    process.env.ENCRYPTION_KEY = key;
  });
});
