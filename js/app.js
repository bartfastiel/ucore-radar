/* Marktradar — multi-tenant frontend. Loads config/tenants.json, renders a tenant tab bar,
   and per tenant reads data/<id>.json. Per tenant: KPIs, a Chance/Risk × Certainty scatter
   matrix (hover a point isolates that event below), and three columns (Risiken|Neutral|Chancen).
   No API key in the browser — the dashboard is purely a reader. */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let TENANTS = [], TENANT = null, DATA = { items: [] }, SORT = "impact", focusId = null, pinnedId = null;

  const isOpp = (f) => f >= 0.2, isRisk = (f) => f <= -0.2, isNeutral = (f) => f > -0.2 && f < 0.2;
  const catOf = (it) => isOpp(it.factor) ? "opportunity" : isRisk(it.factor) ? "risk" : "neutral";
  function factorColor(f) {
    if (f >= 0.2) { const t = Math.min(1, (f - 0.2) / 0.8); return `hsl(140, ${45 + t * 25}%, ${44 - t * 6}%)`; }
    if (f <= -0.2) { const t = Math.min(1, (-f - 0.2) / 0.8); return `hsl(6, ${50 + t * 25}%, ${54 - t * 8}%)`; }
    return "hsl(215, 12%, 55%)";
  }
  const catLabel = (c) => ({ risk: "Risiko", neutral: "Neutral", opportunity: "Chance" }[c]);
  const fmtFactor = (f) => (f > 0 ? "+" : "") + f.toFixed(2);
  function relTime(iso) {
    if (!iso) return "";
    const d = new Date(iso), s = (Date.now() - d) / 1000;
    if (s < 90) return "gerade eben";
    if (s < 3600) return Math.round(s / 60) + " Min.";
    if (s < 86400) return Math.round(s / 3600) + " Std.";
    if (s < 7 * 86400) return Math.round(s / 86400) + " Tg.";
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
  }

  async function init() {
    let cfg = null;
    try { cfg = await fetch("config/tenants.json?t=" + Date.now()).then((r) => r.json()); } catch (e) {}
    TENANTS = (cfg && Array.isArray(cfg.tenants)) ? cfg.tenants : [];
    renderTenantTabs();
    const start = (location.hash || "").replace("#", "");
    const chosen = TENANTS.find((t) => t.id === start) || TENANTS[0];
    if (chosen) await selectTenant(chosen.id);
  }

  function renderTenantTabs() {
    const nav = $("#tenants");
    nav.innerHTML = TENANTS.map((t) =>
      `<button class="t-tab" data-id="${esc(t.id)}">${esc(t.tab || t.name)}</button>`).join("");
    nav.querySelectorAll(".t-tab").forEach((b) => b.onclick = () => selectTenant(b.dataset.id));
  }

  async function selectTenant(id) {
    TENANT = TENANTS.find((t) => t.id === id) || TENANTS[0];
    if (!TENANT) return;
    focusId = null; pinnedId = null;
    document.querySelectorAll(".t-tab").forEach((b) => b.classList.toggle("active", b.dataset.id === TENANT.id));
    $("#company").textContent = TENANT.name;
    $("#subtitle").textContent = TENANT.subtitle || "Marktradar";
    document.title = TENANT.name + " · Marktradar";
    history.replaceState(null, "", "#" + TENANT.id);
    try { DATA = await fetch("data/" + TENANT.id + ".json?t=" + Date.now()).then((r) => r.json()); }
    catch (e) { DATA = { items: [] }; }
    if (!DATA || !Array.isArray(DATA.items)) DATA = { items: [] };
    render();
  }

  function render() {
    $("#updated").textContent = DATA.updatedAt ? "aktualisiert " + relTime(DATA.updatedAt) : "noch keine Daten";
    renderKpis();
    renderChart();
    renderColumns();
    $("#sort").value = SORT;
    $("#sort").onchange = (e) => { SORT = e.target.value; renderColumns(); };
    const n = DATA.items.length;
    $("#ft-count").textContent = n ? n + " bewertete Ereignisse im Radar" : "";
  }

  function avgFactor() {
    if (!DATA.items.length) return 0;
    let sw = 0, s = 0;
    DATA.items.forEach((it) => {
      const ageD = it.scannedAt ? (Date.now() - new Date(it.scannedAt)) / 864e5 : 30;
      const w = (it.confidence || 0.5) * Math.exp(-ageD / 21);
      s += (it.factor || 0) * w; sw += w;
    });
    return sw ? s / sw : 0;
  }

  function renderKpis() {
    const avg = avgFactor();
    const tend = avg > 0.12 ? "Tendenz: eher Chancen" : avg < -0.12 ? "Tendenz: eher Risiken" : "Tendenz: ausgewogen";
    const pct = ((avg + 1) / 2) * 100;
    $("#kpis").innerHTML = `
      <div class="kpi kpi-tend">
        <div class="kpi-label">${esc(tend)}</div>
        <div class="needle-track"><div class="needle" style="left:${pct}%"></div></div>
        <div class="needle-scale"><span>Risiko</span><span>${fmtFactor(avg)}</span><span>Chance</span></div>
      </div>`;
  }

  function renderChart() {
    const host = $("#chart");
    if (!DATA.items.length) { host.innerHTML = `<p class="empty">Noch keine Ereignisse — der stündliche Scan füllt das Radar.</p>`; return; }
    const dots = DATA.items.map((it) => {
      const x = ((it.factor + 1) / 2) * 100;
      const y = Math.max(0, Math.min(1, it.confidence || 0.5)) * 100;
      return `<button class="pt" data-id="${esc(it.id)}"
        style="left:${x}%;bottom:${y}%;background:${factorColor(it.factor)}"
        title="${esc(fmtFactor(it.factor) + " · Gewissheit " + Math.round((it.confidence || 0) * 100) + "% · " + it.title)}"></button>`;
    }).join("");
    host.innerHTML = `
      <div class="scatter">
        <div class="y-axis"><span>Gewissheit</span></div>
        <div class="plot-wrap">
          <div class="y-ticks"><span>hoch</span><span>mittel</span><span>gering</span></div>
          <div class="plot">
            <div class="grid-v"></div><div class="grid-h"></div>
            <div class="q q-tl">unsicher · Risiko</div><div class="q q-tr">sicher · Chance</div>
            ${dots}
          </div>
        </div>
        <div class="x-axis"><span>Risiko −1</span><span>neutral 0</span><span>+1 Chance</span></div>
      </div>`;
    host.querySelectorAll(".pt").forEach((p) => {
      const id = p.dataset.id;
      p.addEventListener("mouseenter", () => setFocus(id));
      p.addEventListener("mouseleave", () => setFocus(null));
      p.addEventListener("click", () => { pinnedId = pinnedId === id ? null : id; setFocus(null); });
    });
  }

  function setFocus(id) { focusId = id; renderColumns(); }
  function activeId() { return pinnedId || focusId; }

  function sortItems(arr) {
    const t = (x) => new Date(x.scannedAt || x.publishedAt || 0).getTime();
    if (SORT === "recent") return arr.sort((a, b) => t(b) - t(a));
    if (SORT === "certainty") return arr.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    return arr.sort((a, b) => Math.abs(b.factor) - Math.abs(a.factor));
  }

  function renderColumns() {
    const host = $("#columns");
    const act = activeId();
    document.querySelectorAll(".pt").forEach((p) => p.classList.toggle("active", p.dataset.id === act));
    const defs = [
      { k: "risk", t: "Risiken", cls: "col-risk" },
      { k: "neutral", t: "Neutral", cls: "col-neutral" },
      { k: "opportunity", t: "Chancen", cls: "col-opp" }
    ];
    const visible = act ? DATA.items.filter((i) => i.id === act) : DATA.items;
    const banner = act
      ? `<div class="focus-bar">Fokus auf 1 Ereignis — ${pinnedId ? "klick auf den Punkt löst die Auswahl" : "Maus vom Punkt nehmen blendet wieder alle ein"}.</div>`
      : "";
    host.innerHTML = banner + `<div class="cols">` + defs.map((d) => {
      const all = DATA.items.filter((i) => catOf(i) === d.k);
      const shown = sortItems(visible.filter((i) => catOf(i) === d.k));
      return `<section class="col ${d.cls}">
        <header><h3>${d.t}</h3><span class="cnt">${all.length}</span></header>
        <div class="cards">${shown.length ? shown.map(card).join("") : `<div class="col-empty">${act ? "" : "—"}</div>`}</div>
      </section>`;
    }).join("") + `</div>`;
  }

  function card(it) {
    const col = factorColor(it.factor);
    const conf = it.confidence != null ? `<span class="conf" title="Gewissheit der Einschätzung">◑ ${Math.round(it.confidence * 100)}%</span>` : "";
    const when = relTime(it.publishedAt || it.scannedAt);
    return `<article class="card" data-id="${esc(it.id)}" style="--col:${col}">
      <div class="card-top">
        <span class="factor-pill" style="background:${col}">${fmtFactor(it.factor)}</span>
        ${conf}<span class="grow"></span>
        <span class="src">${esc(it.source || "")} · ${esc(when)}</span>
      </div>
      <h4 class="card-title"><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a></h4>
      <p class="reason">${esc(it.reasoning || "")}</p>
      <a class="read" href="${esc(it.url)}" target="_blank" rel="noopener">Zur Quelle ↗</a>
    </article>`;
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
