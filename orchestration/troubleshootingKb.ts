export interface TroubleshootingKbSection {
  id: string;
  title: string;
  steps: string[];
  escalationCriteria: string[];
  rawBody: string;
}

export interface TroubleshootingKbDocument {
  source: string;
  loadedAt: string;
  sections: TroubleshootingKbSection[];
}

export interface InlineTroubleshootingKbFile {
  name: string;
  markdown: string;
}

const DEFAULT_KB_PATH = "/public/kb/troubleshooting.md";

let cachedKb: TroubleshootingKbDocument | undefined;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

function parseSteps(lines: string[]): string[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
}

function parseSection(title: string, bodyLines: string[], source: string): TroubleshootingKbSection {
  const normalized = bodyLines.map((line) => line.trim());
  const escalationIndex = normalized.findIndex((line) => /^(#{3,6}\s+)?escalation criteria\b/i.test(line));
  const stepLines = escalationIndex >= 0 ? normalized.slice(0, escalationIndex) : normalized;
  const escalationLines = escalationIndex >= 0 ? normalized.slice(escalationIndex + 1) : [];

  return {
    id: `${slugify(source)}--${slugify(title)}`,
    title,
    steps: parseSteps(stepLines),
    escalationCriteria: parseSteps(escalationLines),
    rawBody: bodyLines.join("\n")
  };
}

export function parseTroubleshootingMarkdown(markdown: string, source: string): TroubleshootingKbDocument {
  const lines = markdown.split(/\r?\n/);
  const sections: TroubleshootingKbSection[] = [];
  let currentTitle: string | undefined;
  let currentBody: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      if (currentTitle) sections.push(parseSection(currentTitle, currentBody, source));
      currentTitle = headingMatch[1].trim();
      currentBody = [];
      continue;
    }
    if (currentTitle) currentBody.push(line);
  }

  if (currentTitle) sections.push(parseSection(currentTitle, currentBody, source));

  return {
    source,
    loadedAt: new Date().toISOString(),
    sections
  };
}

export async function loadTroubleshootingKb(source?: string): Promise<TroubleshootingKbDocument> {
  const selectedSource = source?.trim() || DEFAULT_KB_PATH;
  if (cachedKb && cachedKb.source === selectedSource) return cachedKb;

  const normalizedSource = selectedSource.replace(/\\/g, "/");
  const isLocalPath = /^(\/|\.?\.\/|[A-Za-z]:[\\/])/.test(normalizedSource);
  if (isLocalPath && typeof window === "undefined") {
    const [{ readFile }, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
    const relativeSource = normalizedSource
      .replace(/^\/public\//, "public/")
      .replace(/^\/kb\//, "public/kb/")
      .replace(/^\//, "");
    const absolutePath = path.resolve(process.cwd(), relativeSource);
    const markdown = await readFile(absolutePath, "utf8");
    const parsed = parseTroubleshootingMarkdown(markdown, selectedSource);
    cachedKb = parsed;
    return parsed;
  }

  const response = await fetch(normalizedSource, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load troubleshooting KB from ${selectedSource} (${response.status}).`);
  }

  const markdown = await response.text();
  const parsed = parseTroubleshootingMarkdown(markdown, selectedSource);
  cachedKb = parsed;
  return parsed;
}

export function composeInlineTroubleshootingKb(files: InlineTroubleshootingKbFile[]): TroubleshootingKbDocument {
  const validFiles = files
    .map((file) => ({ name: file.name.trim(), markdown: file.markdown }))
    .filter((file) => file.name && file.markdown.trim());

  if (!validFiles.length) {
    throw new Error("No valid inline troubleshooting KB files were provided.");
  }

  const parsedDocs = validFiles.map((file) => parseTroubleshootingMarkdown(file.markdown, `uploaded:${file.name}`));

  return {
    source: parsedDocs.map((doc) => doc.source).join(", "),
    loadedAt: new Date().toISOString(),
    sections: parsedDocs.flatMap((doc) => doc.sections)
  };
}

export function rankSectionsBySymptoms(params: {
  kb: TroubleshootingKbDocument;
  utterance: string;
  suspectedSymptoms?: string[];
}): TroubleshootingKbSection[] {
  const tokens = new Set(
    `${params.utterance} ${(params.suspectedSymptoms ?? []).join(" ")}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2)
  );

  const scored = params.kb.sections
    .map((section) => {
      const corpus = `${section.title} ${section.rawBody}`.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (corpus.includes(token)) score += 1;
      }

      if (/red|blink|blinking/.test(params.utterance.toLowerCase()) && /red|blink/.test(section.title.toLowerCase())) score += 6;
      if (/no lights|lights off/.test(params.utterance.toLowerCase()) && /no lights/.test(section.title.toLowerCase())) score += 6;
      if (/wifi|wi-fi/.test(params.utterance.toLowerCase()) && /wi-?fi/.test(section.title.toLowerCase())) score += 6;
      if (/slow|unstable|dropping|disconnect/.test(params.utterance.toLowerCase()) && /slow|unstable/.test(section.title.toLowerCase())) score += 6;

      return { section, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((item) => item.section);
}
