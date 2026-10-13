-- Ajustes de meta de um mês para uma máquina/turno.
--   meta1/2/3 preenchidas: substituem a meta calculada naquele mês.
--   ignore_ba = true: a boca aberta não altera a meta naquele mês (a parada continua descontando).
CREATE TABLE IF NOT EXISTS machine_month_meta (
    machine_id  INTEGER NOT NULL,
    shift       INTEGER NOT NULL,
    year        INTEGER NOT NULL,
    month       INTEGER NOT NULL,
    meta1       INTEGER NULL,
    meta2       INTEGER NULL,
    meta3       INTEGER NULL,
    PRIMARY KEY (machine_id, shift, year, month)
);

ALTER TABLE machine_month_meta
    ADD COLUMN IF NOT EXISTS ignore_ba BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO machine_month_meta (machine_id, shift, year, month, meta1, meta2, meta3, ignore_ba)
VALUES
    (6, 1, 2026, 10, NULL, NULL, NULL, TRUE)  -- M6 T1: 6.500 / 7.500 / 8.500 pç/dia, sem boca aberta
ON CONFLICT (machine_id, shift, year, month) DO UPDATE
SET meta1     = EXCLUDED.meta1,
    meta2     = EXCLUDED.meta2,
    meta3     = EXCLUDED.meta3,
    ignore_ba = EXCLUDED.ignore_ba;
