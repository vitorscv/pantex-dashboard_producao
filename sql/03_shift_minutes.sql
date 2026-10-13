-- Minutos produtivos por turno (já descontado o almoço), com data de início.
-- machine_id = 0 vale para todas as máquinas do turno; um machine_id específico tem prioridade.
-- Cada parada é convertida em dias pelo registro vigente na data do lançamento.
CREATE TABLE IF NOT EXISTS shift_minutes (
    shift       INTEGER NOT NULL,
    valid_from  DATE    NOT NULL,
    minutes     INTEGER NOT NULL CHECK (minutes > 0),
    PRIMARY KEY (shift, valid_from)
);

ALTER TABLE shift_minutes
    ADD COLUMN IF NOT EXISTS machine_id INTEGER NOT NULL DEFAULT 0;

ALTER TABLE shift_minutes DROP CONSTRAINT IF EXISTS shift_minutes_pkey;
ALTER TABLE shift_minutes ADD PRIMARY KEY (shift, machine_id, valid_from);

INSERT INTO shift_minutes (shift, machine_id, valid_from, minutes)
VALUES
    (1, 0, DATE '2000-01-01', 525),  -- T1: 8h45
    (2, 0, DATE '2000-01-01', 435),  -- T2: 7h15
    (2, 0, DATE '2026-10-01', 195),  -- T2: 3h15 a partir de outubro/2026
    (2, 6, DATE '2026-10-01', 255)   -- M6 T2: 4h15 a partir de outubro/2026
ON CONFLICT (shift, machine_id, valid_from) DO UPDATE
SET minutes = EXCLUDED.minutes;
