/**
 * Word-level captions: ElevenLabs character alignment → timed words → ASS
 * subtitles (burned in by the renderer). TikTok-style short chunks.
 */

export interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface TimedWord {
  text: string;
  /** Seconds, relative to the start of the alignment's audio. */
  start: number;
  end: number;
}

/** Collapse character timings into word timings. */
export function alignmentToWords(alignment: Alignment): TimedWord[] {
  const words: TimedWord[] = [];
  let current = "";
  let start = 0;

  alignment.characters.forEach((char, i) => {
    if (/\s/.test(char)) {
      if (current) {
        words.push({
          text: current,
          start,
          end: alignment.character_end_times_seconds[i - 1] ?? start,
        });
        current = "";
      }
      return;
    }
    if (!current) start = alignment.character_start_times_seconds[i] ?? 0;
    current += char;
  });
  if (current) {
    words.push({
      text: current,
      start,
      end: alignment.character_end_times_seconds.at(-1) ?? start,
    });
  }
  return words;
}

const CHUNK_SIZE = 3;

/** Group words into short display chunks (≤3 words). */
export function chunkWords(words: TimedWord[]): TimedWord[] {
  const chunks: TimedWord[] = [];
  for (let i = 0; i < words.length; i += CHUNK_SIZE) {
    const group = words.slice(i, i + CHUNK_SIZE);
    chunks.push({
      text: group.map((w) => w.text).join(" "),
      start: group[0].start,
      end: group.at(-1)!.end,
    });
  }
  return chunks;
}

const assTime = (seconds: number) => {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${sec}`;
};

const escapeAss = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")");

export interface CaptionStyleSpec {
  fontSize: number;
  /** ASS colors are &HAABBGGRR (alpha, blue, green, red). */
  primaryColour: string;
  outlineColour: string;
  bold: number;
  marginV: number;
  alignment: number;
}

const STYLES: Record<"bold" | "minimal", CaptionStyleSpec> = {
  bold: {
    fontSize: 96,
    primaryColour: "&H00FFFFFF",
    outlineColour: "&H00000000",
    bold: 1,
    marginV: 320,
    alignment: 2, // bottom-center
  },
  minimal: {
    fontSize: 56,
    primaryColour: "&H00FFFFFF",
    outlineColour: "&H64000000",
    bold: 0,
    marginV: 140,
    alignment: 2,
  },
};

/**
 * Build a complete ASS file for a set of timed chunks.
 * `chunks` must already be offset to composition-global time.
 */
export function buildAss(
  chunks: TimedWord[],
  opts: { width: number; height: number; style: "bold" | "minimal" },
): string {
  const style = STYLES[opts.style];
  const scale = opts.height / 1920; // styles are tuned for 1080x1920

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${opts.width}
PlayResY: ${opts.height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Arial,${Math.round(style.fontSize * scale)},${style.primaryColour},&H000000FF,${style.outlineColour},&H96000000,${style.bold},0,0,0,100,100,0,0,1,${Math.max(2, Math.round(6 * scale))},0,${style.alignment},60,60,${Math.round(style.marginV * scale)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = chunks
    .map((chunk) => {
      const text = escapeAss(chunk.text.toUpperCase());
      return `Dialogue: 0,${assTime(chunk.start)},${assTime(chunk.end + 0.08)},Caption,,0,0,0,,{\\fad(60,40)}${text}`;
    })
    .join("\n");

  return header + events + "\n";
}
