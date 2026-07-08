import { describe, expect, it } from "vitest";
import { alignmentToWords, buildAss, chunkWords } from "./captions";

const alignment = {
  characters: [..."Hello brave new world"],
  character_start_times_seconds: [..."Hello brave new world"].map((_, i) => i * 0.05),
  character_end_times_seconds: [..."Hello brave new world"].map((_, i) => i * 0.05 + 0.05),
};

describe("alignmentToWords", () => {
  it("collapses character timings into words", () => {
    const words = alignmentToWords(alignment);
    expect(words.map((w) => w.text)).toEqual(["Hello", "brave", "new", "world"]);
    expect(words[0].start).toBe(0);
    expect(words[1].start).toBeCloseTo(0.3, 5);
    expect(words.at(-1)!.end).toBeCloseTo(21 * 0.05, 5);
  });
});

describe("chunkWords", () => {
  it("groups words into chunks of three", () => {
    const chunks = chunkWords(alignmentToWords(alignment));
    expect(chunks.map((c) => c.text)).toEqual(["Hello brave new", "world"]);
    expect(chunks[0].start).toBe(0);
    expect(chunks[0].end).toBeGreaterThan(chunks[0].start);
  });
});

describe("buildAss", () => {
  it("produces a valid ASS file with resolution and events", () => {
    const ass = buildAss(chunkWords(alignmentToWords(alignment)), {
      width: 1080,
      height: 1920,
      style: "bold",
    });
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("Style: Caption,Arial,96");
    expect(ass).toContain("Dialogue: 0,0:00:00.00,");
    expect(ass).toContain("HELLO BRAVE NEW");
    // Curly braces would break ASS override blocks.
    expect(ass).not.toMatch(/HELLO.*\{/);
  });

  it("scales style values for other resolutions", () => {
    const ass = buildAss([{ text: "hi", start: 0, end: 1 }], {
      width: 1920,
      height: 1080,
      style: "minimal",
    });
    // 56 * (1080/1920) = 31.5 → 32
    expect(ass).toContain("Style: Caption,Arial,32");
  });
});
