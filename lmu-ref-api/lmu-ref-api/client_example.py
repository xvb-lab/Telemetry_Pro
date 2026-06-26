"""
Esempio client per LMU Ref API — da integrare nell'app.
Pattern: scarica TUTTI i best all'apertura (1 GET) e li cache in locale;
fai POST solo quando batti il best locale.
"""
import json
import urllib.request
import urllib.parse

API = "https://lmu-ref-api.<tuo-subdominio>.workers.dev"
WRITE_TOKEN = "il-token-di-scrittura"   # solo per l'upload


def fetch_all_refs(timeout=8):
    """1 sola chiamata all'apertura: dizionario {key: ref}."""
    with urllib.request.urlopen(API + "/refs", timeout=timeout) as r:
        data = json.loads(r.read().decode())
    return {row["key"]: row for row in data.get("refs", [])}


def submit_best(key, lap_ms, s1_ms=None, s2_ms=None, s3_ms=None,
                car=None, compound=None, compounds4=None, tyre_state_pct=None,
                ve_pct=None, fuel_pct=None, session_type=None,
                team=None, player="Jona", game_ver=None, timeout=8):
    """POST di un best. Passa ve_pct OPPURE fuel_pct (l'altro None).
    tyre_wear_pct = media usura delle 4 gomme. Ritorna {ok, is_new_best, ...}."""
    body = json.dumps({
        "key": key, "lap_ms": lap_ms,
        "s1_ms": s1_ms, "s2_ms": s2_ms, "s3_ms": s3_ms,
        "car": car, "compound": compound, "compounds4": compounds4,
        "tyre_state_pct": tyre_state_pct,
        "ve_pct": ve_pct, "fuel_pct": fuel_pct,
        "session_type": session_type,
        "team": team, "player": player, "game_ver": game_ver,
    }).encode()
    req = urllib.request.Request(
        API + "/ref", data=body, method="POST",
        headers={"Content-Type": "application/json",
                 "Authorization": "Bearer " + WRITE_TOKEN})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def top(key, n=10, timeout=8):
    url = "%s/top?key=%s&n=%d" % (API, urllib.parse.quote(key), n)
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode())


if __name__ == "__main__":
    refs = fetch_all_refs()
    print("best scaricati:", len(refs))
    res = submit_best("GT3_Monza_DRY", 105234, 34010, 35100, 36124,
                      car="Porsche 911 GT3 R", compound="M", compounds4="M,M,M,M",
                      tyre_state_pct=95.8, ve_pct=None, fuel_pct=38.0,
                      session_type="Q", team="Motul Racing Team", player="Jona", game_ver="1.0")
    print(res)
