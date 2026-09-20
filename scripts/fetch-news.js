import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_PATH = path.join(__dirname, "sources.json");
const CATEGORIES_PATH = path.join(__dirname, "categories.json");
const OUTPUT_PATH = path.join(__dirname, "..", "data", "news.json");

const MAX_ITEMS = 500;
const MAX_AGE_DAYS = 90;
const SUMMARY_MAX_LENGTH = 300;
const FETCH_TIMEOUT_MS = 15000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

async function loadJSON(filePath, fallback) {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripHtml(input) {
  if (!input) return "";
  return decodeEntities(
    input
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLength)}…`;
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sha1(value) {
  return createHash("sha1").update(value).digest("hex");
}

function keywordRegex(keyword) {
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu");
}

function categorize(title, summary, categoryKeywords) {
  const haystack = `${title} ${summary}`;
  const matches = [];
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some((kw) => keywordRegex(kw).test(haystack))) {
      matches.push(category);
    }
  }
  return matches.length > 0 ? matches : ["altro"];
}

function extractItems(parsed) {
  if (parsed?.rss?.channel) {
    const channel = parsed.rss.channel;
    const items = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];
    return items.map((item) => ({
      title: typeof item.title === "string" ? item.title : item.title?.["#text"] ?? "",
      link: typeof item.link === "string" ? item.link : item.link?.["#text"] ?? "",
      description: typeof item.description === "string" ? item.description : item.description?.["#text"] ?? "",
      pubDate: item.pubDate ?? item["dc:date"] ?? null,
    }));
  }
  if (parsed?.feed?.entry) {
    const entries = Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry];
    return entries.map((entry) => {
      let link = "";
      if (typeof entry.link === "string") link = entry.link;
      else if (entry.link?.["@_href"]) link = entry.link["@_href"];
      else if (Array.isArray(entry.link)) link = entry.link.find((l) => l["@_rel"] !== "self")?.["@_href"] ?? entry.link[0]?.["@_href"] ?? "";
      return {
        title: typeof entry.title === "string" ? entry.title : entry.title?.["#text"] ?? "",
        link,
        description: entry.summary ?? entry.content ?? "",
        pubDate: entry.published ?? entry.updated ?? null,
      };
    });
  }
  return [];
}

async function fetchFeed(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const parsed = parser.parse(xml);
    return extractItems(parsed);
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const sources = (await loadJSON(SOURCES_PATH, [])).filter((s) => s.enabled);
  const categoryKeywords = await loadJSON(CATEGORIES_PATH, {});
  const existing = await loadJSON(OUTPUT_PATH, []);

  const byId = new Map(existing.map((item) => [item.id, item]));
  const fetchedAt = new Date().toISOString();
  let totalFetched = 0;

  for (const source of sources) {
    try {
      const rawItems = await fetchFeed(source);
      let newCount = 0;
      for (const raw of rawItems) {
        if (!raw.link || !raw.title) continue;
        const id = sha1(raw.link);
        const title = stripHtml(raw.title);
        const summary = truncate(stripHtml(raw.description), SUMMARY_MAX_LENGTH);
        const categories = categorize(title, summary, categoryKeywords);
        if (source.strict_category_filter && categories.length === 1 && categories[0] === "altro") {
          continue;
        }
        const publishedDate = parseDate(raw.pubDate);
        const isNew = !byId.has(id);
        if (isNew) newCount++;
        byId.set(id, {
          id,
          title,
          link: raw.link.trim(),
          source: source.name,
          source_slug: source.id,
          published_at: publishedDate ? publishedDate.toISOString() : byId.get(id)?.published_at ?? fetchedAt,
          fetched_at: byId.get(id)?.fetched_at ?? fetchedAt,
          summary,
          categories,
        });
      }
      totalFetched += rawItems.length;
      console.log(`[${source.id}] ${rawItems.length} elementi nel feed, ${newCount} nuovi`);
    } catch (err) {
      console.error(`[${source.id}] ERRORE: ${err.message}`);
    }
  }

  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  let merged = Array.from(byId.values()).filter((item) => new Date(item.published_at).getTime() >= cutoff);
  merged.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  merged = merged.slice(0, MAX_ITEMS);

  await writeFile(OUTPUT_PATH, JSON.stringify(merged, null, 2), "utf-8");
  console.log(`\nTotale elementi processati dai feed: ${totalFetched}`);
  console.log(`Totale notizie salvate in data/news.json: ${merged.length}`);
}

main().catch((err) => {
  console.error("Errore fatale:", err);
  process.exitCode = 1;
});
