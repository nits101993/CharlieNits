const statusEl = document.querySelector("#status");
const itemsEl = document.querySelector("#items");
const sourceTextEl = document.querySelector("#sourceText");
const noteTitleEl = document.querySelector("#noteTitle");
const noteSourceEl = document.querySelector("#noteSource");
const noteUrlEl = document.querySelector("#noteUrl");
const noteOutputEl = document.querySelector("#noteOutput");
const accessKeyEl = document.querySelector("#accessKey");

let currentItems = [];

const officialDomains = new Set([
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

const syllabusMap = [
  {
    paper: "Prelims GS",
    topic: "Current events of national and international importance",
    keywords: ["current", "summit", "agreement", "report", "index", "mission", "scheme", "policy", "initiative", "launch"],
  },
  {
    paper: "Prelims GS",
    topic: "Indian polity and governance",
    keywords: ["constitution", "parliament", "bill", "act", "governance", "rights", "panchayat", "municipal", "judiciary", "election"],
  },
  {
    paper: "Prelims GS",
    topic: "Economic and social development",
    keywords: ["gdp", "inflation", "employment", "poverty", "inclusive", "budget", "fiscal", "growth", "industry", "trade"],
  },
  {
    paper: "Prelims GS",
    topic: "Environment, ecology, biodiversity, and climate change",
    keywords: ["environment", "climate", "forest", "biodiversity", "wildlife", "species", "pollution", "carbon", "renewable"],
  },
  {
    paper: "GS-I",
    topic: "Indian heritage, culture, history, geography, and society",
    keywords: ["heritage", "culture", "history", "freedom", "geography", "monsoon", "tribe", "women", "urbanization", "society"],
  },
  {
    paper: "GS-II",
    topic: "Governance, Constitution, polity, social justice, and international relations",
    keywords: ["constitution", "governance", "welfare", "health", "education", "vulnerable", "ministry", "international", "bilateral", "multilateral", "diplomacy"],
  },
  {
    paper: "GS-III",
    topic: "Economy, agriculture, science and technology, environment, security, and disaster management",
    keywords: ["economy", "agriculture", "farmer", "infrastructure", "science", "technology", "space", "cyber", "security", "disaster", "energy", "manufacturing"],
  },
  {
    paper: "GS-IV",
    topic: "Ethics, integrity, aptitude, and public service values",
    keywords: ["ethics", "integrity", "transparency", "accountability", "corruption", "probity", "public service", "citizen charter"],
  },
  {
    paper: "Essay",
    topic: "Multi-dimensional analytical themes",
    keywords: ["development", "democracy", "technology", "environment", "inequality", "growth", "justice", "security"],
  },
];

const dimensionKeywords = {
  "Polity and governance": ["constitution", "governance", "bill", "act", "rights", "parliament", "federal"],
  Economy: ["gdp", "inflation", "growth", "trade", "export", "budget", "fiscal", "employment", "industry"],
  "Society and social justice": ["women", "children", "health", "education", "poverty", "vulnerable", "tribal", "social"],
  Environment: ["environment", "climate", "biodiversity", "forest", "carbon", "pollution", "renewable"],
  "Science and technology": ["science", "technology", "digital", "space", "ai", "cyber", "innovation"],
  "International relations": ["international", "bilateral", "multilateral", "summit", "treaty", "global", "united nations"],
  Security: ["security", "border", "defence", "terror", "cyber", "insurgency", "police"],
  Ethics: ["transparency", "accountability", "integrity", "ethics", "corruption", "probity"],
  Federalism: ["state", "states", "centre", "central", "district", "panchayat", "municipal"],
  "Prelims facts": ["species", "index", "report", "mission", "scheme", "committee", "ministry", "year"],
};

function setStatus(message, mode = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${mode}`.trim();
}

async function api(path, options = {}) {
  setStatus("Fetching", "busy");
  const accessKey = accessKeyEl.value.trim();
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessKey ? { "X-App-Access-Key": accessKey } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  setStatus("Ready");
  return data;
}

function renderItems(items) {
  currentItems = items || [];
  itemsEl.innerHTML = "";
  if (!currentItems.length) {
    itemsEl.innerHTML = `<div class="item"><strong>No items</strong><small>Fetch a source or paste an official URL.</small></div>`;
    return;
  }
  currentItems.forEach((item, index) => {
    const button = document.createElement("button");
    button.className = "item";
    button.innerHTML = `
      <strong>${escapeHtml(item.title || item.url || "Untitled")}</strong>
      <small>${escapeHtml(item.source || item.date || "")}</small>
      <p>${escapeHtml(item.summary || item.url || "")}</p>
    `;
    button.addEventListener("click", () => loadItem(index));
    itemsEl.append(button);
  });
}

async function loadItem(index) {
  const item = currentItems[index];
  noteTitleEl.value = item.title || "";
  noteSourceEl.value = item.source || "";
  noteUrlEl.value = item.url || "";
  if (item.text) {
    sourceTextEl.value = item.text;
    setStatus("Loaded");
    return;
  }
  if (!item.url) {
    sourceTextEl.value = item.summary || "";
    setStatus("Loaded");
    return;
  }
  try {
    const page = await api(`/api/url?url=${encodeURIComponent(item.url)}`);
    noteTitleEl.value = page.title || item.title || "";
    noteSourceEl.value = item.source || page.source || "";
    noteUrlEl.value = page.url || item.url || "";
    sourceTextEl.value = page.text || "";
    if (page.links && page.links.length) {
      const extra = page.links.map((link) => ({ ...link, source: item.source || "Official link" }));
      renderItems(extra);
    }
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function fetchPib() {
  try {
    const data = await api("/api/pib?limit=25");
    renderItems(data.items);
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function fetchUpsc() {
  try {
    const data = await api("/api/upsc");
    sourceTextEl.value = data.text || "";
    noteTitleEl.value = data.title || "UPSC active exams";
    noteSourceEl.value = "UPSC";
    noteUrlEl.value = data.url || "";
    renderItems((data.items || []).map((item) => ({ ...item, source: "UPSC" })));
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function fetchRbi() {
  try {
    const data = await api("/api/rbi");
    sourceTextEl.value = data.text || "";
    noteTitleEl.value = data.title || "RBI DBIE";
    noteSourceEl.value = "RBI DBIE";
    noteUrlEl.value = data.url || "";
    renderItems((data.items || []).map((item) => ({ ...item, source: "RBI DBIE" })));
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function fetchMospi() {
  try {
    const data = await api("/api/mospi/datasets");
    sourceTextEl.value = data.text || "";
    noteTitleEl.value = data.title || "MoSPI e-Sankhyiki datasets";
    noteSourceEl.value = "MoSPI e-Sankhyiki";
    noteUrlEl.value = data.url || "";
    const datasets = Array.isArray(data.datasets) ? data.datasets : Object.values(data.datasets || {});
    const datasetItems = datasets.slice(0, 60).map((item) => ({
        title: typeof item === "string" ? item : item.name || item.title || item.dataset || "MoSPI dataset",
        summary: JSON.stringify(item).slice(0, 260),
        text: JSON.stringify(item, null, 2),
        source: "MoSPI e-Sankhyiki",
        url: data.url,
      }));
    renderItems((data.items && data.items.length ? data.items : datasetItems).map((item) => ({ ...item, source: item.source || "MoSPI" })));
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function fetchDataGov(event) {
  event.preventDefault();
  const resourceId = document.querySelector("#resourceId").value.trim();
  const apiKey = document.querySelector("#apiKey").value.trim();
  const limit = document.querySelector("#dataLimit").value.trim() || "10";
  try {
    const data = await api(
      `/api/data-gov?resource_id=${encodeURIComponent(resourceId)}&api_key=${encodeURIComponent(apiKey)}&limit=${encodeURIComponent(limit)}`
    );
    sourceTextEl.value = data.text || "";
    noteTitleEl.value = data.title || "data.gov.in resource";
    noteSourceEl.value = "data.gov.in";
    noteUrlEl.value = data.url || "";
    renderItems(
      (data.records || []).map((record, index) => ({
        title: `Record ${index + 1}`,
        summary: JSON.stringify(record).slice(0, 280),
        text: JSON.stringify(record, null, 2),
        source: "data.gov.in",
        url: data.url,
      }))
    );
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function fetchOfficialUrl(event) {
  event.preventDefault();
  const url = document.querySelector("#officialUrl").value.trim();
  try {
    const data = await api(`/api/url?url=${encodeURIComponent(url)}`);
    sourceTextEl.value = data.text || "";
    noteTitleEl.value = data.title || "";
    noteSourceEl.value = new URL(url).hostname;
    noteUrlEl.value = data.url || url;
    renderItems((data.links || []).map((item) => ({ ...item, source: new URL(url).hostname })));
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function generateNote() {
  try {
    noteOutputEl.textContent = buildNote({
      title: noteTitleEl.value.trim(),
      source: noteSourceEl.value.trim(),
      url: noteUrlEl.value.trim(),
      text: sourceTextEl.value.trim(),
    });
    setStatus("Note generated");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function buildNote(payload) {
  const title = cleanText(payload.title || "Official-source note");
  const source = cleanText(payload.source || "Official source");
  const url = cleanText(payload.url || "");
  const text = cleanText(payload.text || "").slice(0, 45000);
  if (!text) {
    throw new Error("Source text is required");
  }
  if (url) {
    validateOfficialUrl(url);
  }
  const syllabus = detectSyllabus(text, title);
  const dimensions = detectDimensions(text, title);
  const essence = topSentences(text, title, 6);
  const facts = extractFacts(text, 8);
  const schemes = sentencesMatching(text, ["scheme", "mission", "yojana", "programme", "policy", "act", "bill", "portal", "initiative"], 6);
  const challenges = sentencesMatching(text, ["challenge", "concern", "gap", "risk", "constraint", "shortage", "delay", "issue", "vulnerable"], 5);
  const wayForward = sentencesMatching(text, ["target", "roadmap", "future", "need", "should", "recommend", "vision", "strategy", "implementation"], 5);
  const terms = extractNamedTerms(text, 16);
  const generatedAt = new Date().toLocaleString("en-IN", { hour12: false });

  return `# ${title}

Source: ${source}
Official link: ${url || "Not provided"}
Generated: ${generatedAt}

## UPSC Syllabus Mapping
${syllabus.map((item) => `- ${item.paper}: ${item.topic} (signals: ${item.evidence})`).join("\n")}

## Core Note
${bulletize(essence)}

## Prelims Pointers
${bulletize(facts)}

## Mains Dimensions
${dimensions.map((item) => `- ${item.dimension}: ${item.signals}`).join("\n") || "- Multi-dimensional current-affairs relevance should be validated during revision."}

## Schemes, Institutions, Policies, Reports
${bulletize(schemes)}

## Issues And Challenges
${bulletize(challenges)}

## Way Forward / Answer Enrichment
${bulletize(wayForward)}

## Terms To Revise
${bulletize(terms, "No major named terms were extracted.")}

## Mains Answer Frame
- Introduction: Use the official update/data point to define the issue in one line.
- Body: Link facts with the syllabus dimensions above; add institutional context and implementation issues.
- Conclusion: End with a governance-oriented, constitutional, sustainable, or inclusive development angle.

## Verification Reminder
- Re-check sensitive numbers, dates, and legal provisions against the official link before final revision.
`;
}

function validateOfficialUrl(value) {
  const parsed = new URL(value);
  if (!officialDomains.has(parsed.hostname.toLowerCase())) {
    throw new Error(`Domain is not whitelisted as an official source: ${parsed.hostname}`);
  }
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceSplit(text) {
  const compact = cleanText(text);
  if (!compact) {
    return [];
  }
  return compact
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((item) => item.trim().replace(/^[- ]+/, ""))
    .filter((item) => item.length > 25);
}

function scoreSentence(sentence, title) {
  const lower = sentence.toLowerCase();
  let score = 0;
  for (const token of title.toLowerCase().match(/[a-zA-Z]{4,}/g) || []) {
    if (lower.includes(token)) {
      score += 2;
    }
  }
  if (/\b\d{4}\b|\b\d+(?:\.\d+)?\s?(?:%|crore|lakh|million|billion|trillion|mt|gw|mw|km)\b/i.test(lower)) {
    score += 4;
  }
  for (const term of ["scheme", "mission", "policy", "ministry", "committee", "report", "index", "target", "launched", "approved", "signed", "amended", "objective", "benefit", "challenge", "governance", "implementation", "data"]) {
    if (lower.includes(term)) {
      score += 1;
    }
  }
  if (sentence.length > 230) {
    score -= 1;
  }
  return score;
}

function topSentences(text, title, limit = 6) {
  return sentenceSplit(text)
    .map((sentence, index) => ({ sentence, index, score: scoreSentence(sentence, title) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);
}

function detectSyllabus(text, title) {
  const haystack = `${title} ${text}`.toLowerCase();
  const matches = [];
  for (const row of syllabusMap) {
    const hits = row.keywords.filter((keyword) => haystack.includes(keyword));
    if (hits.length) {
      matches.push({
        paper: row.paper,
        topic: row.topic,
        evidence: hits.slice(0, 5).join(", "),
      });
    }
  }
  return matches.length
    ? matches.slice(0, 7)
    : [{ paper: "Prelims GS / Mains GS", topic: "Current events linked to the static syllabus", evidence: "General official-source relevance" }];
}

function detectDimensions(text, title) {
  const haystack = `${title} ${text}`.toLowerCase();
  const dimensions = [];
  for (const [dimension, keywords] of Object.entries(dimensionKeywords)) {
    const hits = keywords.filter((keyword) => haystack.includes(keyword));
    if (hits.length) {
      dimensions.push({ dimension, signals: hits.slice(0, 6).join(", ") });
    }
  }
  return dimensions.slice(0, 10);
}

function extractFacts(text, limit = 8) {
  const re = /\b\d{4}\b|\b\d+(?:\.\d+)?\s?%|\b\d+(?:\.\d+)?\s?(?:crore|lakh|million|billion|trillion|km|gw|mw|mt|tonnes?)\b|\b(?:rank|index|report|survey|census|committee|mission|scheme|portal)\b/i;
  return dedupe(sentenceSplit(text).filter((sentence) => re.test(sentence))).slice(0, limit);
}

function sentencesMatching(text, terms, limit = 5) {
  const re = new RegExp(terms.map((term) => escapeRegExp(term)).join("|"), "i");
  return dedupe(sentenceSplit(text).filter((sentence) => re.test(sentence))).slice(0, limit);
}

function extractNamedTerms(text, limit = 16) {
  const counts = new Map();
  const matches = text.match(/\b(?:[A-Z][a-zA-Z&.-]+(?:\s+|$)){2,6}/g) || [];
  const stop = new Set(["Government Of", "Press Information", "Union Public", "Ministry Of", "Page Not"]);
  for (const match of matches) {
    const item = cleanText(match).replace(/[ ,.-]+$/g, "");
    if (item.length < 5 || stop.has(item) || !/[a-z]/.test(item)) {
      continue;
    }
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([item]) => item);
}

function dedupe(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = item.toLowerCase().replace(/\W+/g, "").slice(0, 180);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bulletize(items, fallback = "Not clearly stated in the extracted official text.") {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${fallback}`;
}

async function copyNote() {
  const text = noteOutputEl.textContent || "";
  if (!text) {
    setStatus("No note to copy", "error");
    return;
  }
  await navigator.clipboard.writeText(text);
  setStatus("Copied");
}

function downloadNote() {
  const text = noteOutputEl.textContent || "";
  if (!text) {
    setStatus("No note to export", "error");
    return;
  }
  const title = (noteTitleEl.value || "upsc-note").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${title || "upsc-note"}.md`;
  document.body.append(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
  setStatus("Exported");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.querySelector("#fetchPib").addEventListener("click", fetchPib);
document.querySelector("#fetchUpsc").addEventListener("click", fetchUpsc);
document.querySelector("#fetchRbi").addEventListener("click", fetchRbi);
document.querySelector("#fetchMospi").addEventListener("click", fetchMospi);
document.querySelector("#dataGovForm").addEventListener("submit", fetchDataGov);
document.querySelector("#officialUrlForm").addEventListener("submit", fetchOfficialUrl);
document.querySelector("#useSelection").addEventListener("click", generateNote);
document.querySelector("#copyNote").addEventListener("click", copyNote);
document.querySelector("#downloadNote").addEventListener("click", downloadNote);
document.querySelector("#clearItems").addEventListener("click", () => renderItems([]));
accessKeyEl.value = sessionStorage.getItem("upsc_access_key") || "";
accessKeyEl.addEventListener("input", () => {
  sessionStorage.setItem("upsc_access_key", accessKeyEl.value.trim());
});

renderItems([]);
