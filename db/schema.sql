-- Run this once in the Neon SQL editor to create the table and sample data.

CREATE TABLE IF NOT EXISTS accidents (
  id           SERIAL PRIMARY KEY,
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  severity     TEXT NOT NULL CHECK (severity IN ('fatal', 'injury', 'damage')),
  date         DATE,
  municipality TEXT,
  street       TEXT,
  source       TEXT NOT NULL DEFAULT 'official'  -- 'official' or 'user'
);

INSERT INTO accidents (lat, lng, severity, date, municipality, street) VALUES
  (54.6872, 25.2797, 'injury', '2025-03-14', 'Vilniaus m.',   'Gedimino pr.'),
  (54.8985, 23.9036, 'fatal',  '2025-05-02', 'Kauno m.',      'Savanorių pr.'),
  (55.7033, 21.1443, 'damage', '2025-07-21', 'Klaipėdos m.',  'Taikos pr.'),
  (55.9349, 23.3137, 'injury', '2025-08-09', 'Šiaulių m.',    'Tilžės g.'),
  (55.7348, 24.3575, 'damage', '2025-09-30', 'Panevėžio m.',  'Respublikos g.');
