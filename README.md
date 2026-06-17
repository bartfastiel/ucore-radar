# Marktradar

Ein **multi-tenant**-Werkzeug, das für mehrere Unternehmen laufend bewertet, wie sich **Chancen und Risiken
durch aktuelle Ereignisse** verändern. Die Unternehmen werden bewusst nur **umschrieben** (Branche/Profil),
nicht namentlich genannt.

Stündlich werden Nachrichtenquellen gescannt; jedes relevante Ereignis bekommt einen Einfluss-Faktor von
**−1 (Risiko)** bis **+1 (Chance)**, eine **Gewissheit** und eine kurze Begründung, **inwiefern es das
Geschäftsmodell betrifft**.

👉 **Live:** <https://bartfastiel.github.io/ucore-radar/>

## So funktioniert es

```
            ┌── GitHub Actions (stündlicher Cron, kostenlos) ──────────────┐
            │  Pro Unternehmen (Tab):                                      │
            │  1. Google-News-RSS zu den Profil-Themen abrufen (dpa …)     │
            │  2. Claude Haiku  → schneller, günstiger Relevanz-Vorfilter  │
            │  3. Claude Opus   → genaue Analyse: Faktor −1…+1 + Begründung│
            │  4. Ergebnis in data/<tenant>.json schreiben & committen     │
            └───────────────────────────┬─────────────────────────────────┘
                                         ▼
         GitHub Pages serviert das Dashboard (Tabs lesen data/<tenant>.json)
```

- **Multi-tenant:** mehrere Unternehmen als Tabs; jedes mit eigenem Profil, eigenen Suchanfragen und
  eigenem Datenspeicher. Die Unternehmen sind nur umschrieben, nicht namentlich genannt.
- **Zweistufig & kostenbewusst:** Das günstige Modell (Haiku) filtert die Masse vor; nur die wenigen
  relevanten Treffer gehen an das starke Modell (Opus). So bleiben die Kosten pro Stunde minimal.
- **Persistenz:** Die Bewertungen liegen versioniert in `data/<tenant>.json` — jede Stunde ein
  nachvollziehbarer Commit (die „Datenbank“ ist Teil des Repos, kein Server nötig).
- **Datensatz je Ereignis:** Link, Titel, Quelle, Datum, **Faktor (−1…+1)**, Kategorie, **Begründung** und
  Konfidenz.
- **Schwache Signale sichtbar:** Auch scheinbar nebensächliche Meldungen landen mit Faktor nahe 0 im Radar,
  statt nur Gut/Schlecht zu zeigen.

## Hosting & Kosten

Komplett **kostenlos** und ohne eigene Infrastruktur — dieselbe Idee wie bei
`vocabulary-learning-app`: **GitHub Pages** (statisches Frontend) plus **GitHub Actions** (Cron). Kein AWS,
kein Server, keine Datenbank-Instanz. Der API-Key liegt ausschließlich als **GitHub-Actions-Secret** vor und
wird nie an den Browser ausgeliefert.

> Eine AWS-Variante (Terraform: Lambda + EventBridge-Schedule + DynamoDB + S3/CloudFront) wäre möglich, ist
> hier aber bewusst nicht gewählt: sie verursacht laufende Kosten und Betrieb, ohne für diesen Anwendungsfall
> einen Vorteil gegenüber dem kostenlosen GitHub-Setup zu bieten.

## Einrichtung (einmalig)

1. **Anthropic-API-Key als Repo-Secret hinterlegen:**
   ```bash
   gh secret set ANTHROPIC_API_KEY --repo bartfastiel/ucore-radar
   # Wert (sk-ant-…) eingeben — bleibt geheim, nur in Actions verfügbar.
   ```
2. **Ersten Scan auslösen** (statt auf die volle Stunde zu warten):
   ```bash
   gh workflow run hourly-news-scan --repo bartfastiel/ucore-radar
   ```
   Danach läuft der Scan automatisch stündlich. Manuell jederzeit über den **Actions**-Tab → *Run workflow*.

Ohne Key tut der Cron nichts; das Dashboard zeigt dann die mitgelieferten Bewertungen, bis die ersten
neuen Live-Treffer eintreffen.

## Unternehmen anpassen / ergänzen

Alle Unternehmen (Tenants) stehen zentral in [`config/tenants.json`](config/tenants.json): je Tenant
`id`, Anzeigename (umschrieben), `subtitle`, `businessModel` (für die KI-Bewertung) und die **Suchanfragen**
(`queries`); dazu global die Modelle (`triage` = Haiku, `analysis` = Opus) und Limits. Ein neues Unternehmen
= ein weiterer Eintrag im Array (der Scan legt dann `data/<id>.json` an).

## Struktur

```
config/tenants.json          Unternehmen (umschrieben) + Suchanfragen + Modelle/Limits
scripts/sources.mjs          Google-News-RSS abrufen & parsen (zero-dependency)
scripts/scan.mjs             Pipeline pro Tenant: Triage (Haiku) → Analyse (Opus) → data/<id>.json
.github/workflows/scan.yml   stündlicher Cron + manueller Trigger
data/<id>.json               versionierter Datenspeicher je Unternehmen
index.html · css · js/app.js Dashboard mit Tabs (liest data/<id>.json, kein API-Key im Browser)
```

## Modelle

`claude-haiku-4-5` (Vorfilter) und `claude-opus-4-8` (Analyse, mit Structured Outputs für robustes JSON).
Anpassbar in `config/tenants.json`.
