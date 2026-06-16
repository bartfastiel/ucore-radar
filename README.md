# Strategist–AI Cockpit

**Strategische Frühaufklärung mit Claude** — eine browserbasierte Web-App, die die Prozesse aus der
Dissertation von **Dr. Franziskus Perkhofer**, *„AI and the Strategizing Process: Strategist-AI
Collaboration in Strategic Issue Scanning and Interpretation Activities“* (TUM, 2026), in ein
benutzbares Werkzeug übersetzt.

Gebaut als Demonstrator für einen Pitch zu Anthropic/Claude — und um zu zeigen, was im Juni 2026
möglich ist: Claude liest und interpretiert **live** das Marktumfeld, sieht kreative Wechselwirkungen
mit dem Geschäftsmodell und macht dabei **Unsicherheit sichtbar**, statt sie zu kaschieren.

👉 **Live:** <https://bartfastiel.github.io/strategist-ai-cockpit/>

## Die sechs Bereiche (Tabs)

| Bereich | Rolle in der Dissertation | Was es tut |
|---|---|---|
| 🛰️ **Lagebild** | *Scanning* | Sucht live im Web nach Entwicklungen und sortiert sie in **drei Spalten**: neue Risiken · vermeintlich irrelevant · Chancen. |
| 🧭 **Interpretation** | *Sensemaking / Interpretation* | Deutet ein Signal: Pro/Contra, Effekte zweiter Ordnung, „Was wir noch **nicht** wissen“. |
| ⚔️ **Sparringspartner** | *Sensegiver-Rolle: Sparring* | Fordert Annahmen heraus, deckt Biases auf (Advocatus Diaboli). |
| 💡 **Ideengeber** | *Sensegiver-Rolle: Ideator* | Kreative, laterale Wechselwirkungen zwischen Trend und Geschäftsmodell. Kreativitäts-/Temperatur-Regler. |
| ⚙️ **Automator** | *Sensegiver-Rolle: Automator* | Verdichtet Lagebild + Interpretationen zu einer vorstandstauglichen Management-Vorlage. |
| 📖 **Methodik** | *Theorierahmen* | Erklärt das Vertrauens-Unsicherheits-Dilemma, das Fit-Misfit-Paradox und die vier Sensegiver-Rollen. |

## Der Clou: gegen die „trügerische Sicherheit“

Die mittlere Spalte **„vermeintlich irrelevant“** ist bewusst gewollt. Perkhofers Kernbefund:
*wahrgenommene Unsicherheit ≠ tatsächliche Unsicherheit.* Wer nur Gut/Schlecht anzeigt, erzeugt
trügerische Sicherheit und übersieht **schwache Signale**. Zusätzlich trägt jede KI-Ausgabe eine
**Konfidenz-Angabe** und einen „Was wir noch nicht wissen“-Block — KI ist hier **Sensegiver, nicht
Orakel**.

## Nutzung

1. `index.html` öffnen (lokal **oder** über die GitHub-Pages-URL).
2. Oben rechts unter **⚙︎ Einstellungen** einen **Anthropic-API-Key** eintragen — er bleibt
   ausschließlich lokal im Browser (`localStorage`) und wird nur direkt an `api.anthropic.com`
   gesendet (CORS via `anthropic-dangerous-direct-browser-access`).
3. Oder ohne Key direkt im **Demo-Modus** loslegen (vorab berechnete Beispieldaten, keine Kosten).
4. Unter **🏢 Profil** das Unternehmen anpassen (Standard: **uCORE Systems GmbH**, recherchiert).

> ⚠️ **Hinweis zum API-Key:** Der direkte Browser-Aufruf ist ideal für einen Demo/Einzelplatz.
> Für eine Mehrnutzer-Produktion gehört der Key hinter einen Proxy (z. B. AWS Lambda / Cloudflare
> Worker), nie ins ausgelieferte Frontend.

## Technik

- **Kein Build, kein Framework.** Reines HTML/CSS/JS — läuft von `file://` wie von GitHub Pages.
- **Modell:** Standard `claude-opus-4-8`. Wählbar: Sonnet 4.6 / Opus 4.6.
- **Live-Websuche:** Server-Tool `web_search_20260209` (mit dynamischem Filtern) für das Lagebild.
- **Temperatur:** Opus 4.8/4.7 akzeptieren keinen `temperature`-Parameter — der Kreativitätsregler
  steuert dort den **Prompt-Stil**; bei Sonnet 4.6 / Opus 4.6 zusätzlich den Parameter.
- **Caching & Kosten:** Antworten werden lokal mit TTL gecached; nach jedem Aufruf erscheint eine
  grobe **Kostenabschätzung** (Tokens, Websuchen, € via Listenpreis).

```
index.html
css/styles.css
js/ config.js · demo-data.js · store.js · api.js · ui.js · prompts.js · tabs.js · app.js
```

## Datenschutz

Kein Backend, kein Tracking. API-Key, Einstellungen, Profil und Cache liegen nur im Browser.
Im Live-Modus gehen Profil + Anfrage an Anthropic; im Demo-Modus verlässt nichts den Browser.

---

*Gebaut mit Claude Code. „AI as a sensegiver, not an oracle.“*
