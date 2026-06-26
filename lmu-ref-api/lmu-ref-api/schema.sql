-- LMU Ref API — schema D1 (SQLite)
-- Un best globale per chiave (CLASS_track_DRY|WET) + storico per classifiche.
-- Oltre al tempo/settori salviamo come è stato fatto il giro: wear medio gomme,
-- compound, e carico (VE% se presente, altrimenti fuel%).

CREATE TABLE IF NOT EXISTS refs (
  key            TEXT PRIMARY KEY,   -- es. GT3_Monza_DRY  (classe_pista_condizione)
  lap_ms         INTEGER NOT NULL,
  s1_ms          INTEGER,
  s2_ms          INTEGER,
  s3_ms          INTEGER,
  car            TEXT,
  compound       TEXT,               -- sigla compound se uniforme
  compounds4     TEXT,               -- 4 codici 'FL,FR,RL,RR' (per simbolo o 4-dot)
  tyre_state_pct REAL,               -- stato medio delle 4 gomme (0-100, 100=nuova)
  ve_pct         REAL,               -- carico VE (0-100), null se l'auto non ha VE
  fuel_pct       REAL,               -- carico fuel (0-100), usato se non c'è VE
  fuel_l         REAL,               -- litri benzina a inizio giro (per i kg)
  session_type   TEXT,               -- P / Q / R ...
  team           TEXT,             -- nome team (max 30), dalla config app
  player         TEXT NOT NULL,
  game_ver       TEXT,
  ts             INTEGER NOT NULL    -- epoch secondi
);

CREATE TABLE IF NOT EXISTS submissions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  key            TEXT NOT NULL,
  lap_ms         INTEGER NOT NULL,
  s1_ms          INTEGER,
  s2_ms          INTEGER,
  s3_ms          INTEGER,
  car            TEXT,
  compound       TEXT,
  compounds4     TEXT,
  tyre_state_pct REAL,
  ve_pct         REAL,
  fuel_pct       REAL,
  fuel_l         REAL,
  session_type   TEXT,
  team           TEXT,             -- nome team (max 30), dalla config app
  player         TEXT NOT NULL,
  game_ver       TEXT,
  ts             INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_key ON submissions(key, lap_ms);
CREATE INDEX IF NOT EXISTS idx_sub_player ON submissions(player);
