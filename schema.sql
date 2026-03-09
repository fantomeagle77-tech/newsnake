-- Таблица результатов
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,     -- unix ms
  name TEXT NOT NULL,
  seed INTEGER NOT NULL,           -- "день" или конкретный сид
  mode TEXT NOT NULL,              -- например "score"
  score INTEGER NOT NULL,
  time_ms INTEGER NOT NULL,
  coins INTEGER NOT NULL,
  version TEXT
);

CREATE INDEX IF NOT EXISTS idx_scores_seed_mode_score ON scores(seed, mode, score);
CREATE INDEX IF NOT EXISTS idx_scores_seed_mode_time  ON scores(seed, mode, time_ms);

-- Лучшая траектория "призрака" на seed+mode
CREATE TABLE IF NOT EXISTS ghosts (
  seed INTEGER NOT NULL,
  mode TEXT NOT NULL,
  best_score INTEGER NOT NULL,
  best_time_ms INTEGER NOT NULL,
  name TEXT NOT NULL,
  ghost TEXT NOT NULL,             -- JSON строка
  updated_at INTEGER NOT NULL,      -- unix ms
  PRIMARY KEY (seed, mode)
);