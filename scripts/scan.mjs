/* Hourly multi-tenant scan pipeline (runs in GitHub Actions).
   For each tenant in config/tenants.json:
     1. Collect fresh headlines from Google News RSS (tenant queries).
     2. Dedupe against that tenant's datastore.
     3. Haiku triage — cheap relevance filter (per tenant business model).
     4. Opus analysis — impact factor (-1 risk … +1 chance) + reasoning + confidence.
     5. Append to data/<tenantId>.json (the workflow commits it).

   ANTHROPIC_API_KEY comes from the GitHub Actions secret; never shipped to the browser. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectHeadlines, keyOf } from "./sources.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CFG = JSON.parse(await fs.readFile(path.join(ROOT, "config/tenants.json"), "utf8"));
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error("ANTHROPIC_API_KEY is not set."); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const textOf = (d) => (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");

async function anthropic(body, attempt = 0) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body)
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt < 4) { await sleep(1500 * (attempt + 1)); return anthropic(body, attempt + 1); }
  }
  const data = await res.json();
  if (!res.ok) throw new Error(`${res.status}: ${data?.error?.message || "API error"}`);
  return data;
}

function extractJSON(t) {
  if (!t) return null;
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = fence ? fence[1] : t;
  const start = src.search(/[[{]/); if (start < 0) return null;
  const open = src[start], close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; }
    else if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) { try { return JSON.parse(src.slice(start, i + 1)); } catch { return null; } }
  }
  return null;
}

async function triage(model, businessModel, cands) {
  const list = cands.map((c, i) => `${i}. ${c.title}${c.snippet ? " — " + c.snippet : ""}`).join("\n");
  const data = await anthropic({
    model, max_tokens: 1024,
    system:
      "Du bist ein schneller Vorfilter für ein strategisches Marktradar. UNTERNEHMEN:\n" + businessModel +
      "\n\nAUFGABE: Wähle aus der Liste NUR die Schlagzeilen, die plausibel die Chancen oder Risiken dieses " +
      "Unternehmens berühren (Markt, Regulierung, Technologie, Lieferkette, Wettbewerb, Förderung, Nachfrage). " +
      "Sei selektiv. Antworte ausschließlich als JSON: {\"relevant\":[indizes]}.",
    messages: [{ role: "user", content: "Schlagzeilen:\n" + list }]
  });
  const j = extractJSON(textOf(data)) || {};
  const idx = Array.isArray(j.relevant) ? j.relevant : [];
  return idx.filter((i) => Number.isInteger(i) && i >= 0 && i < cands.length).map((i) => cands[i]);
}

const ANALYSIS_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    factor: { type: "number", description: "-1 (reines Risiko) bis +1 (reine Chance), 0 = neutral/ambivalent" },
    category: { type: "string", enum: ["risk", "neutral", "opportunity"] },
    reasoning: { type: "string", description: "1-3 Sätze: inwiefern betrifft das konkret das Geschäftsmodell? Keinen Firmennamen nennen, mit 'das Unternehmen'/'der Anbieter' formulieren." },
    confidence: { type: "number", description: "0..1 Belastbarkeit der Einschätzung, UNABHÄNGIG vom Betrag des Faktors" }
  },
  required: ["factor", "category", "reasoning", "confidence"]
};

async function analyze(model, businessModel, item) {
  const data = await anthropic({
    model, max_tokens: 1200,
    output_config: { effort: "medium", format: { type: "json_schema", schema: ANALYSIS_SCHEMA } },
    system:
      "Du bewertest ein einzelnes Nachrichtenereignis für das strategische Marktradar eines Unternehmens. " +
      "UNTERNEHMEN:\n" + businessModel +
      "\n\nGib einen Einfluss-Faktor von -1 (Risiko) bis +1 (Chance) und eine kurze, konkrete Begründung, " +
      "inwiefern das Ereignis das Geschäftsmodell betrifft. Nenne KEINEN Firmennamen; formuliere mit " +
      "'das Unternehmen'/'der Anbieter'. Die Gewissheit (confidence) ist UNABHÄNGIG vom Betrag des Faktors. " +
      "Vermeide trügerische Sicherheit: ist die Relevanz nur mittelbar, wähle einen Faktor nahe 0. Antworte als JSON.",
    messages: [{ role: "user", content:
      `Titel: ${item.title}\nQuelle: ${item.source}\nDatum: ${item.publishedAt || "?"}\n` +
      (item.snippet ? `Auszug: ${item.snippet}\n` : "") + `Link: ${item.url}` }]
  });
  const j = extractJSON(textOf(data));
  if (!j) return null;
  let factor = Math.max(-1, Math.min(1, Number(j.factor)));
  if (!Number.isFinite(factor)) factor = 0;
  const category = factor >= 0.2 ? "opportunity" : factor <= -0.2 ? "risk" : "neutral";
  return {
    factor: Math.round(factor * 100) / 100, category,
    reasoning: String(j.reasoning || "").trim(),
    confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0.5))
  };
}

async function scanTenant(t) {
  const dbPath = path.join(ROOT, "data", t.id + ".json");
  const db = JSON.parse(await fs.readFile(dbPath, "utf8").catch(() => '{"items":[]}'));
  db.items = Array.isArray(db.items) ? db.items : [];
  const seen = new Set(db.items.map((it) => it.key));

  const headlines = await collectHeadlines(t.queries);
  const fresh = [], batch = new Set();
  for (const h of headlines) {
    const k = keyOf(h.title);
    if (!k || seen.has(k) || batch.has(k)) continue;
    batch.add(k); fresh.push({ ...h, key: k });
  }
  console.log(`[${t.id}] ${headlines.length} headlines, ${fresh.length} new.`);
  if (!fresh.length) return;

  const cands = fresh.slice(0, CFG.limits.maxTriage);
  const relevant = await triage(CFG.models.triage, t.businessModel, cands);
  console.log(`[${t.id}] Haiku flagged ${relevant.length} relevant.`);
  if (!relevant.length) return;

  const toAnalyze = relevant.slice(0, CFG.limits.maxAnalyze);
  const nowIso = new Date().toISOString();
  let added = 0;
  for (const item of toAnalyze) {
    try {
      const a = await analyze(CFG.models.analysis, t.businessModel, item);
      if (!a) continue;
      db.items.unshift({
        id: item.key.slice(0, 12).replace(/\s/g, "-") + "-" + Date.now().toString(36),
        key: item.key, title: item.title, url: item.url, source: item.source,
        publishedAt: item.publishedAt, scannedAt: nowIso,
        factor: a.factor, category: a.category, reasoning: a.reasoning,
        confidence: a.confidence, model: CFG.models.analysis
      });
      added++;
      console.log(`  [${t.id}] + [${a.factor >= 0 ? "+" : ""}${a.factor}] ${item.title}`);
    } catch (e) { console.warn(`  [${t.id}] ! ${item.title} — ${e.message}`); }
  }
  if (!added) return;
  db.items.sort((a, b) => new Date(b.scannedAt) - new Date(a.scannedAt));
  if (db.items.length > CFG.limits.keep) db.items = db.items.slice(0, CFG.limits.keep);
  db.updatedAt = nowIso;
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2) + "\n");
  console.log(`[${t.id}] wrote ${added} new item(s); ${db.items.length} total.`);
}

async function main() {
  for (const t of CFG.tenants) {
    try { await scanTenant(t); } catch (e) { console.error(`[${t.id}] failed: ${e.message}`); }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
