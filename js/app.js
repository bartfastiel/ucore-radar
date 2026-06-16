/* uCORE Marktradar — frontend. Reads config/profile.json and the data/news.json datastore
   (produced hourly by the GitHub Actions scan). Renders KPIs, a Chance/Risk × Certainty
   scatter matrix, and three columns (Risiken | Neutral | Chancen). Hovering a point in the
   matrix isolates that single event in the columns below. No API key in the browser. */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let DATA = { items: [] }, SORT = "impact", focusId = null, pinnedId = null;

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

  async function load() {
    const bust = "?t=" + Date.now();
    try {
      const [profile, data] = await Promise.all([
        fetch("config/profile.json" + bust).then((r) => r.json()).catch(() => null),
        fetch("data/news.json" + bust).then((r) => r.json()).catch(() => null)
      ]);
      if (profile) {
        $("#company").textContent = profile.company || "Marktradar";
        $("#subtitle").textContent = profile.subtitle || profile.tagline || "";
        document.title = (profile.company || "Marktradar") + " · " + (profile.tagline || "Marktradar");
      }
      DATA = data && Array.isArray(data.items) ? data : { items: [] };
    } catch (e) { DATA = { items: [] }; }
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
    const items = DATA.items;
    const opp = items.filter((i) => isOpp(i.factor)).length;
    const risk = items.filter((i) => isRisk(i.factor)).length;
    const avg = avgFactor();
    const tend = avg > 0.12 ? "Tendenz: eher Chancen" : avg < -0.12 ? "Tendenz: eher Risiken" : "Tendenz: ausgewogen";
    const pct = ((avg + 1) / 2) * 100;
    $("#kpis").innerHTML = `
      <div class="kpi kpi-tend">
        <div class="kpi-label">${esc(tend)}</div>
        <div class="needle-track"><div class="needle" style="left:${pct}%"></div></div>
        <div class="needle-scale"><span>Risiko</span><span>${fmtFactor(avg)}</span><span>Chance</span></div>
      </div>
      <div class="kpi"><div class="kpi-num opp">${opp}</div><div class="kpi-label">Chancen</div></div>
      <div class="kpi"><div class="kpi-num risk">${risk}</div><div class="kpi-label">Risiken</div></div>
      <div class="kpi"><div class="kpi-num">${items.length}</div><div class="kpi-label">beobachtet</div></div>`;
  }

  /* --- Scatter matrix: x = factor (-1..+1), y = confidence (0..1) --- */
  function renderChart() {
    const host = $("#chart");
    if (!DATA.items.length) { host.innerHTML = `<p class="empty">Noch keine Ereignisse — der stündliche Scan füllt das Radar.</p>`; return; }
    const dots = DATA.items.map((it) => {
      const x = ((it.factor + 1) / 2) * 100;
      const y = Math.max(0, Math.min(1, it.confidence || 0.5)) * 100;
      return `<button class="pt" role="listitem" data-id="${esc(it.id)}"
        style="left:${x}%;bottom:${y}%;background:${factorColor(it.factor)}"
        title="${esc(fmtFactor(it.factor) + " · Gewissheit " + Math.round((it.confidence || 0) * 100) + "% · " + it.title)}"></button>`;
    }).join("");
    host.innerHTML = `
      <div class="scatter">
        <div class="y-axis"><span>Gewissheit</span></div>
        <div class="plot-wrap">
          <div class="y-ticks"><span>hoch</span><span>mittel</span><span>gering</span></div>
          <div class="plot" role="list">
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
    return arr.sort((a, b) => Math.abs(b.factor) - Math.abs(a.factor)); // impact
  }

  function renderColumns() {
    const host = $("#columns");
    const act = activeId();
    // highlight active point
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
    const seed = it.seed ? `<span class="seed" title="Startwert – wird durch den Live-Scan ergänzt">Startwert</span>` : "";
    const when = relTime(it.publishedAt || it.scannedAt);
    return `<article class="card" data-id="${esc(it.id)}" style="--col:${col}">
      <div class="card-top">
        <span class="factor-pill" style="background:${col}">${fmtFactor(it.factor)}</span>
        ${conf}${seed}<span class="grow"></span>
        <span class="src">${esc(it.source || "")} · ${esc(when)}</span>
      </div>
      <h4 class="card-title"><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a></h4>
      <p class="reason">${esc(it.reasoning || "")}</p>
      <a class="read" href="${esc(it.url)}" target="_blank" rel="noopener">Zur Quelle ↗</a>
    </article>`;
  }

  if (document.readyState !== "loading") load();
  else document.addEventListener("DOMContentLoaded", load);
})();
