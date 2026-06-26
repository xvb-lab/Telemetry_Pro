// LMU Ref API — Cloudflare Worker (D1)
// Endpoints:
//   GET  /refs                 -> tutti i best (1 chiamata all'apertura)
//   GET  /ref?key=...          -> best singolo
//   GET  /top?key=...&n=10     -> classifica (dallo storico submissions)
//   POST /ref                  -> invia un best (Authorization: Bearer <WRITE_TOKEN>)
//   GET  /health               -> ok
//
// Modello: tempo + settori (per il gap, calcolato dall'app) + come è stato fatto
// il giro: wear medio gomme, compound, carico (VE% o fuel%), tipo sessione.
// Storage: D1 binding "DB". Secret: WRITE_TOKEN (per le scritture).

const LAP_MIN_MS = 35000;    // 35s
const LAP_MAX_MS = 600000;   // 10m
const SECTOR_TOL_MS = 700;
const KEY_RE = /^[A-Za-z0-9]+_.+_(DRY|WET)$/;
const STR_MAX = 64;

const COLS = "key,lap_ms,s1_ms,s2_ms,s3_ms,car,compound,compounds4,tyre_state_pct," +
             "ve_pct,fuel_pct,fuel_l,session_type,team,player,game_ver,ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function clampStr(v, max = STR_MAX) {
  if (v == null) return null;
  v = String(v).trim();
  return v.length ? v.slice(0, max) : null;
}

function asInt(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// percentuale 0-100 (1 decimale), null se assente/non valida
function asPct(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
}

// numero generico (1 decimale), null se assente/non valido
function asNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

// Validazione + normalizzazione del payload POST.
function validate(b) {
  if (typeof b !== "object" || b == null) return { ok: false, err: "body" };
  const key = clampStr(b.key);
  if (!key || !KEY_RE.test(key)) return { ok: false, err: "key" };

  const lap = asInt(b.lap_ms);
  if (lap == null || lap < LAP_MIN_MS || lap > LAP_MAX_MS)
    return { ok: false, err: "lap_ms" };

  const s1 = asInt(b.s1_ms), s2 = asInt(b.s2_ms), s3 = asInt(b.s3_ms);
  if (s1 != null && s2 != null && s3 != null) {
    if (s1 <= 0 || s2 <= 0 || s3 <= 0) return { ok: false, err: "sector_neg" };
    if (Math.abs(s1 + s2 + s3 - lap) > SECTOR_TOL_MS)
      return { ok: false, err: "sector_sum" };
  }

  const team = clampStr(b.team, 30);
  const player = clampStr(b.player);
  if (!player) return { ok: false, err: "player" };

  return {
    ok: true,
    rec: {
      key, lap_ms: lap, s1_ms: s1, s2_ms: s2, s3_ms: s3,
      car: clampStr(b.car), compound: clampStr(b.compound),
      compounds4: clampStr(b.compounds4),
      tyre_state_pct: asPct(b.tyre_state_pct),
      ve_pct: asPct(b.ve_pct), fuel_pct: asPct(b.fuel_pct), fuel_l: asNum(b.fuel_l),
      session_type: clampStr(b.session_type),
      team, player, game_ver: clampStr(b.game_ver),
      ts: Math.floor(Date.now() / 1000),
    },
  };
}

function bindRec(stmt, r) {
  return stmt.bind(
    r.key, r.lap_ms, r.s1_ms, r.s2_ms, r.s3_ms, r.car, r.compound, r.compounds4,
    r.tyre_state_pct, r.ve_pct, r.fuel_pct, r.fuel_l, r.session_type, r.team,
    r.player, r.game_ver, r.ts
  );
}

async function getRefs(env) {
  const { results } = await env.DB.prepare(`SELECT ${COLS} FROM refs`).all();
  return json({ refs: results || [], count: (results || []).length });
}

async function getRef(env, key) {
  if (!key) return json({ error: "key required" }, 400);
  const row = await env.DB.prepare(`SELECT ${COLS} FROM refs WHERE key=?`)
    .bind(key).first();
  return row ? json(row) : json({ error: "not found" }, 404);
}

async function getTop(env, key, n) {
  if (!key) return json({ error: "key required" }, 400);
  n = Math.min(Math.max(parseInt(n || "10", 10) || 10, 1), 50);
  const { results } = await env.DB.prepare(
    `SELECT ${COLS} FROM submissions s
     WHERE s.key=? AND s.lap_ms = (
       SELECT MIN(lap_ms) FROM submissions WHERE key=s.key AND player=s.player)
     GROUP BY s.player
     ORDER BY s.lap_ms ASC LIMIT ?`
  ).bind(key, n).all();
  return json({ key, top: results || [] });
}

async function postRef(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const tok = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!env.WRITE_TOKEN || tok !== env.WRITE_TOKEN)
    return json({ error: "unauthorized" }, 401);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: "invalid json" }, 400); }

  const v = validate(body);
  if (!v.ok) return json({ error: "validation", field: v.err }, 422);
  const r = v.rec;

  // storico sempre
  await bindRec(env.DB.prepare(
    `INSERT INTO submissions (${COLS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ), r).run();

  // best globale: aggiorna solo se più veloce
  const res = await bindRec(env.DB.prepare(
    `INSERT INTO refs (${COLS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET
       lap_ms=excluded.lap_ms, s1_ms=excluded.s1_ms, s2_ms=excluded.s2_ms, s3_ms=excluded.s3_ms,
       car=excluded.car, compound=excluded.compound, compounds4=excluded.compounds4,
       tyre_state_pct=excluded.tyre_state_pct,
       ve_pct=excluded.ve_pct, fuel_pct=excluded.fuel_pct, fuel_l=excluded.fuel_l, session_type=excluded.session_type, team=excluded.team,
       player=excluded.player, game_ver=excluded.game_ver, ts=excluded.ts
     WHERE excluded.lap_ms < refs.lap_ms`
  ), r).run();

  const isBest = (res.meta && res.meta.changes) ? true : false;
  return json({ ok: true, is_new_best: isBest, key: r.key, lap_ms: r.lap_ms });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (request.method === "GET" && p === "/health") return json({ ok: true });
      if (request.method === "GET" && p === "/refs") return await getRefs(env);
      if (request.method === "GET" && p === "/ref")
        return await getRef(env, url.searchParams.get("key"));
      if (request.method === "GET" && p === "/top")
        return await getTop(env, url.searchParams.get("key"), url.searchParams.get("n"));
      if (request.method === "POST" && p === "/ref") return await postRef(request, env);
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: "server", detail: String(e) }, 500);
    }
  },
};
