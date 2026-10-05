-- Eismo Pulsas database (Neon / any Postgres).
--
-- Official accident data is NOT stored here: it ships as static files in
-- public/data/ (built by `npm run data`). The database only holds what users
-- create: reported danger spots and their votes.
--
-- The app creates these tables automatically on first use (lib/reports-store.ts);
-- this file is for reference or manual setup in the Neon SQL editor.

CREATE TABLE IF NOT EXISTS reports (
  id         SERIAL PRIMARY KEY,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  category   TEXT NOT NULL,   -- speeding | intersection | crossing | bike | visibility | road | other
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per person per report; vote count = number of rows.
CREATE TABLE IF NOT EXISTS report_votes (
  report_id  INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  voter      TEXT NOT NULL,   -- anonymous per-browser id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, voter)
);

CREATE INDEX IF NOT EXISTS reports_category_lat_lng ON reports (category, lat, lng);
