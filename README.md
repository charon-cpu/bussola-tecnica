# Bussola Tecnica

Aggregatore di notizie di settore per un geometra libero professionista: edilizia, efficientamento energetico/APE, fiscalità legata all'edilizia, normativa tecnica.

Il sito **non ospita contenuti propri**: raccoglie titolo, data, un breve estratto e il link all'articolo originale dai feed RSS/Atom ufficiali delle testate di settore, poi rimanda alla fonte. Nessun testo integrale viene copiato.

## Come funziona

1. Un job schedulato (GitHub Action, `.github/workflows/fetch-news.yml`) gira ogni 3 ore, scarica i feed elencati in [scripts/sources.json](scripts/sources.json), li normalizza e li categorizza per parole chiave ([scripts/categories.json](scripts/categories.json)), e salva tutto in [data/news.json](data/news.json).
2. Il job fa commit del file dati aggiornato direttamente nel repo.
3. Render ridistribuisce automaticamente ad ogni push (deploy statico, nessun server da mantenere).
4. Il sito ([index.html](index.html) + [js/app.js](js/app.js)) legge `data/news.json` staticamente — nessuna chiamata live ai feed a ogni visita.

## Fonti attive

| Fonte | Feed |
|---|---|
| Biblus (ACCA) | biblus.acca.it/feed |
| Edilportale | edilportale.com/rss.xml |
| Lavori Pubblici | lavoripubblici.it/articoli-tecnici/feed.rss |
| Edil Tecnico | ediltecnico.it/feed |
| Build News (ex Casa&Clima) | buildnews.it/feed |
| Il Sole 24 Ore | sezioni Casa, Norme e Tributi, Sostenibilità (filtrate: tenute solo se rientrano in una categoria del settore, essendo feed generalisti) |

Per aggiungere una fonte: aggiungi una voce a `scripts/sources.json` con `id`, `name`, `url` e `enabled: true`. Se il feed è generalista (non specifico del settore edilizio) imposta anche `"strict_category_filter": true` per scartare gli articoli non categorizzati.

## Categorizzazione

Ogni notizia viene testata su titolo + estratto contro le keyword definite in `scripts/categories.json`, con match a confine di parola (case-insensitive). Categorie: `edilizia`, `energetica`, `fiscale`, `normativa`; se nessuna corrisponde finisce in `altro`. Per affinare basta modificare il file JSON, senza toccare il codice.

## Sviluppo locale

```bash
npm install
npm run fetch-news
```

Poi apri `index.html` con un server statico qualsiasi (serve un server per il `fetch()` del JSON, non basta aprire il file direttamente):

```bash
python -m http.server 8000
```

e vai su `http://localhost:8000`.

## Deploy su Render

1. Crea un nuovo **Static Site** su Render collegato a questo repo GitHub (branch `main`).
2. Render legge automaticamente `render.yaml` (build command vuoto, publish path `./`).
3. Piano Free, deploy automatico ad ogni push.

## Struttura dati di una notizia

```json
{
  "id": "sha1 del link, per deduplicare",
  "title": "Titolo",
  "link": "https://...",
  "source": "Nome testata",
  "source_slug": "slug-fonte",
  "published_at": "2026-09-18T09:30:00.000Z",
  "fetched_at": "2026-09-20T06:00:00.000Z",
  "summary": "Estratto, max 300 caratteri, HTML ripulito",
  "categories": ["fiscale", "normativa"]
}
```

Il file `data/news.json` tiene al massimo le ultime 500 notizie e scarta quelle più vecchie di 90 giorni.
