const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = __dirname;
const WEB_ROOT = path.join(ROOT, "web");
const PORT = Number(process.env.UPSC_NOTES_PORT || 8765);
const HOST = process.env.HOST || "0.0.0.0";
const FETCH_TIMEOUT_MS = 25000;
const APP_ACCESS_KEY = process.env.APP_ACCESS_KEY || "";

const OFFICIAL_DOMAINS = new Set([
  "pib.gov.in",
  "www.pib.gov.in",
  "data.gov.in",
  "www.data.gov.in",
  "api.data.gov.in",
  "mospi.gov.in",
  "www.mospi.gov.in",
  "api.mospi.gov.in",
  "rbi.org.in",
  "www.rbi.org.in",
  "data.rbi.org.in",
  "dbieold.rbi.org.in",
  "upsc.gov.in",
  "www.upsc.gov.in",
  "india.gov.in",
  "www.india.gov.in",
]);

const SOURCES = [
  {
    id: "pib",
    name: "PIB",
    url: "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1",
    purpose: "Latest Government of India press releases",
  },
  {
    id: "data-gov",
    name: "data.gov.in",
    url: "https://api.data.gov.in/resource/",
    purpose: "Open Government Data resource APIs",
  },
  {
    id: "mospi",
    name: "MoSPI e-Sankhyiki",
    url: "https://www.mospi.gov.in/esankhyiki-python-library",
    purpose: "Official statistics through the MoSPI e-Sankhyiki page and client",
  },
  {
    id: "rbi",
    name: "RBI DBIE",
    url: "https://dbieold.rbi.org.in/DBIE/",
    purpose: "Database on Indian Economy pages and releases",
  },
  {
    id: "upsc",
    name: "UPSC",
    url: "https://upsc.gov.in/examinations/active-exams",
    purpose: "Official exam notifications, syllabus pages, and papers",
  },
];

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function cleanText(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function ensureOfficialUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ApiError(400, "Invalid URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ApiError(400, "Only HTTP/HTTPS official URLs are supported.");
  }
  if (!OFFICIAL_DOMAINS.has(parsed.hostname.toLowerCase())) {
    throw new ApiError(400, `Domain is not whitelisted as an official source: ${parsed.hostname}`);
  }
  return parsed.toString();
}

async function fetchOfficial(rawUrl) {
  const url = ensureOfficialUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "UPSCOfficialNotes/1.0 (+local web study tool)",
        accept: "text/html,application/xhtml+xml,application/xml,application/json,text/plain,*/*",
      },
    });
    const body = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) {
      throw new ApiError(response.status, `Official source returned HTTP ${response.status}.`);
    }
    return { body, contentType, url };
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(input) {
  const withoutHidden = input
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");
  const withBreaks = withoutHidden
    .replace(/<\/(?:p|div|li|tr|h1|h2|h3|h4|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  return cleanText(withBreaks.replace(/<[^>]+>/g, " "));
}

function extractTitle(input) {
  const match = input.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]) : "";
}

function extractLinks(baseUrl, input) {
  const links = [];
  const seen = new Set();
  const re = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(input))) {
    const href = match[1] || match[2] || match[3] || "";
    if (!href || href.startsWith("#") || /^javascript:|^mailto:/i.test(href)) {
      continue;
    }
    let absolute;
    try {
      absolute = new URL(href, baseUrl).toString();
      ensureOfficialUrl(absolute);
    } catch {
      continue;
    }
    if (seen.has(absolute)) {
      continue;
    }
    seen.add(absolute);
    links.push({ title: stripHtml(match[4]) || absolute, url: absolute });
    if (links.length >= 100) {
      break;
    }
  }
  return links;
}

async function extractPage(rawUrl) {
  const { body, contentType, url } = await fetchOfficial(rawUrl);
  const text = body.toString("utf8");
  if (contentType.includes("application/json") || /^[\s\r\n]*[\[{]/.test(text)) {
    const parsed = JSON.parse(text);
    return {
      title: rawUrl,
      url,
      content_type: contentType,
      text: JSON.stringify(parsed, null, 2),
      links: [],
    };
  }
  return {
    title: extractTitle(text) || rawUrl,
    url,
    content_type: contentType,
    text: stripHtml(text),
    links: extractLinks(url, text),
  };
}

function extractXmlTag(input, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = input.match(re);
  return cleanText(match ? match[1] : "");
}

async function fetchPib(limit = 25) {
  const rssUrl = SOURCES[0].url;
  const { body } = await fetchOfficial(rssUrl);
  const raw = body.toString("utf8");
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  const items = [];
  let match;
  while ((match = itemRe.exec(raw)) && items.length < limit) {
    const xml = match[0];
    const title = extractXmlTag(xml, "title");
    const url = extractXmlTag(xml, "link");
    if (!title || !url) {
      continue;
    }
    items.push({
      title,
      url,
      date: extractXmlTag(xml, "pubDate"),
      summary: extractXmlTag(xml, "description"),
      source: "PIB",
    });
  }
  if (!items.length) {
    const fallbackUrl = "https://www.pib.gov.in/allRel.aspx?lang=1&reg=3";
    const page = await extractPage(fallbackUrl);
    const fallbackItems = page.links
      .filter((item) => /PressReleasePage\.aspx|PressReleseDetail\.aspx|PRID=/i.test(item.url))
      .slice(0, limit)
      .map((item) => ({ ...item, source: "PIB", summary: "PIB All Releases fallback" }));
    return { source: "PIB", url: fallbackUrl, items: fallbackItems };
  }
  return { source: "PIB", url: rssUrl, items };
}

async function fetchUpscActive() {
  const url = "https://upsc.gov.in/examinations/active-exams";
  const page = await extractPage(url);
  const items = page.links
    .filter((item) => /civil|services|examination|notification|syllabus|notice/i.test(item.title))
    .slice(0, 60)
    .map((item) => ({ ...item, source: "UPSC" }));
  return {
    source: "UPSC",
    url,
    title: page.title,
    text: page.text.slice(0, 10000),
    items,
  };
}

async function fetchRbiDbie() {
  const url = "https://dbieold.rbi.org.in/DBIE/";
  const page = await extractPage(url);
  const items = page.links
    .filter((item) => /statistics|bulletin|handbook|data|report|publication|time-series|series/i.test(item.title))
    .slice(0, 60)
    .map((item) => ({ ...item, source: "RBI DBIE" }));
  return {
    source: "RBI DBIE",
    url,
    title: page.title,
    text: page.text.slice(0, 14000),
    items,
  };
}

async function fetchMospiPage() {
  const url = "https://www.mospi.gov.in/esankhyiki-python-library";
  const page = await extractPage(url);
  return {
    source: "MoSPI e-Sankhyiki",
    url,
    title: page.title || "MoSPI e-Sankhyiki",
    text: page.text || "MoSPI e-Sankhyiki official page for statistics access.",
    items: page.links.map((item) => ({ ...item, source: "MoSPI" })).slice(0, 60),
  };
}

async function fetchDataGovResource(params) {
  const resourceId = (params.get("resource_id") || "").trim();
  const apiKey = (params.get("api_key") || process.env.DATAGOVIN_API_KEY || "").trim();
  const limit = clampInt(params.get("limit"), 10, 1, 100);
  const offset = clampInt(params.get("offset"), 0, 0, 1000000);
  if (!resourceId) {
    throw new ApiError(400, "A data.gov.in resource_id is required.");
  }
  if (!apiKey) {
    throw new ApiError(400, "A data.gov.in API key is required. You can paste it in the web page or set DATAGOVIN_API_KEY.");
  }
  const url = new URL(`https://api.data.gov.in/resource/${encodeURIComponent(resourceId)}`);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(limit));
  for (const [key, value] of params.entries()) {
    if (key.startsWith("filters[") || key === "fields" || key === "sort") {
      url.searchParams.set(key, value);
    }
  }

  const { body } = await fetchOfficial(url.toString());
  const parsed = JSON.parse(body.toString("utf8"));
  const fields = Array.isArray(parsed.field)
    ? parsed.field.map((field) => field.name || field.id || "").filter(Boolean)
    : [];
  const title =
    parsed.title ||
    (Array.isArray(parsed.org) && parsed.org[0] && (parsed.org[0].org || parsed.org[0].title)) ||
    "data.gov.in resource";
  const publicUrl = url.toString().replace(encodeURIComponent(apiKey), "API_KEY");
  return {
    source: "data.gov.in",
    url: publicUrl,
    title,
    total: parsed.total,
    count: parsed.count,
    fields,
    records: parsed.records || [],
    text: JSON.stringify(
      {
        title,
        total: parsed.total,
        count: parsed.count,
        fields,
        records: parsed.records || [],
      },
      null,
      2
    ),
  };
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

async function handleApiGet(pathname, params) {
  if (pathname === "/api/health") {
    return { ok: true, sources: SOURCES };
  }
  if (pathname === "/api/sources") {
    return { sources: SOURCES, official_domains: [...OFFICIAL_DOMAINS].sort() };
  }
  if (pathname === "/api/pib") {
    return fetchPib(clampInt(params.get("limit"), 25, 1, 50));
  }
  if (pathname === "/api/upsc") {
    return fetchUpscActive();
  }
  if (pathname === "/api/rbi") {
    return fetchRbiDbie();
  }
  if (pathname === "/api/mospi/datasets") {
    return fetchMospiPage();
  }
  if (pathname === "/api/data-gov") {
    return fetchDataGovResource(params);
  }
  if (pathname === "/api/url") {
    const url = params.get("url");
    if (!url) {
      throw new ApiError(400, "url is required.");
    }
    return extractPage(url);
  }
  throw new ApiError(404, "API endpoint not found.");
}

function assertAccess(req, pathname) {
  if (!APP_ACCESS_KEY || pathname === "/api/health") {
    return;
  }
  const provided = req.headers["x-app-access-key"] || "";
  if (provided !== APP_ACCESS_KEY) {
    throw new ApiError(401, "Access key required or incorrect.");
  }
}

function sendJson(res, payload, status = 200) {
  const body = Buffer.from(JSON.stringify(payload, null, 2));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
  });
  res.end(body);
}

async function serveStatic(res, pathname) {
  const filePath =
    pathname === "/" || pathname === ""
      ? path.join(WEB_ROOT, "index.html")
      : path.resolve(WEB_ROOT, `.${pathname}`);
  if (!filePath.startsWith(path.resolve(WEB_ROOT))) {
    throw new ApiError(403, "Forbidden.");
  }
  const data = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
    }[ext] || "application/octet-stream";
  res.writeHead(200, {
    "content-type": contentType,
    "content-length": data.length,
  });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, {}, 204);
      return;
    }
    const currentUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    if (currentUrl.pathname.startsWith("/api/")) {
      assertAccess(req, currentUrl.pathname);
      if (req.method !== "GET") {
        throw new ApiError(405, "Method not allowed.");
      }
      sendJson(res, await handleApiGet(currentUrl.pathname, currentUrl.searchParams));
      return;
    }
    if (req.method !== "GET") {
      throw new ApiError(405, "Method not allowed.");
    }
    await serveStatic(res, currentUrl.pathname);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    sendJson(res, { error: error.message || "Unexpected error" }, status);
  }
});

server.listen(PORT, HOST, () => {
  const shownHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  console.log(`UPSC Official Notes web app running at http://${shownHost}:${PORT}`);
});

module.exports = server;
