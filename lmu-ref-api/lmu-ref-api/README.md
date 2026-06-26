# LMU Ref API

Database condiviso dei best lap (tempo + settori) su **Cloudflare Worker + D1**.
Modello leggero: un best globale per chiave `CLASS_track_DRY|WET`, più storico per le classifiche.

## Deploy (una volta)

```bash
npm i -g wrangler
wrangler login

# 1) crea il DB e copia il database_id stampato dentro wrangler.toml
wrangler d1 create lmu-ref

# 2) applica lo schema
wrangler d1 execute lmu-ref --remote --file=schema.sql

# 3) imposta il token di scrittura (lo userà l'app per il POST)
wrangler secret put WRITE_TOKEN

# 4) pubblica
wrangler deploy
```

L'URL sarà tipo `https://lmu-ref-api.<subdominio>.workers.dev`.

## Endpoints

| Metodo | Path                    | Auth   | Uso |
|-------:|-------------------------|--------|-----|
| GET    | `/refs`                 | no     | tutti i best (1 chiamata all'apertura) |
| GET    | `/ref?key=GT3_Monza_DRY`| no     | best singolo |
| GET    | `/top?key=...&n=10`     | no     | classifica (miglior giro per giocatore) |
| POST   | `/ref`                  | Bearer | invia un best |
| GET    | `/health`               | no     | check |

### POST /ref (body)

```json
{
  "key": "GT3_Monza_DRY",
  "lap_ms": 105234,
  "s1_ms": 34010, "s2_ms": 35100, "s3_ms": 36124,
  "car": "Porsche 911 GT3 R", "compound": "M", "compounds4": "M,M,M,M",
  "tyre_state_pct": 95.8,
  "ve_pct": null, "fuel_pct": 38.0,
  "session_type": "Q",
  "team": "Motul Racing Team", "player": "Jona", "game_ver": "1.0"
}
```

Campi: `key` (classe_pista_condizione) e `lap_ms`/settori sono il riferimento.
`tyre_state_pct` = stato medio delle 4 gomme a fine giro (100=nuova). `compounds4` = i 4 codici (se uniformi → simbolo; se mix → 4 dot). `compound` = sigla per il simbolo in card.
Carico (residuo a fine giro): **`ve_pct`** se l'auto ha VE, altrimenti **`fuel_pct`** (l'altro `null`).
Il **gap NON si salva**: lo calcola l'app dal tempo scaricato.

Header: `Authorization: Bearer <WRITE_TOKEN>`
Risposta: `{ "ok": true, "is_new_best": true|false, ... }`

## Validazione lato server

- `key` deve matchare `CLASS_track_DRY|WET`
- `lap_ms` tra 35s e 10m
- se ci sono i 3 settori, `s1+s2+s3 ≈ lap` (tolleranza 700ms)
- `player` obbligatorio
- scrittura solo con token valido

## Test rapido

```bash
URL=https://lmu-ref-api.<subdominio>.workers.dev
curl $URL/health
curl -X POST $URL/ref -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"key":"GT3_Monza_DRY","lap_ms":105234,"s1_ms":34010,"s2_ms":35100,"s3_ms":36124,"player":"Jona"}'
curl "$URL/refs"
curl "$URL/top?key=GT3_Monza_DRY"
```

## Consumo

Con scarico **solo all'apertura** + upload occasionale: ~poche centinaia di richieste/giorno
per 100 giocatori → ben sotto il free tier (Workers ~100k req/giorno, D1 milioni di righe lette).

## Integrazione app

Vedi `client_example.py`: `fetch_all_refs()` all'avvio (cache locale), `submit_best()` quando
batti il best locale. La card ONLINE REF punta a `/refs` invece del CSV.

## Note / prossimi passi

- Token unico condiviso (gruppo ristretto). Per pubblico: tabella token per-giocatore + rate-limit.
- Telemetria piena (traiettoria): aggiungere campo R2 on-demand, scaricata solo se serve l'overlay.
