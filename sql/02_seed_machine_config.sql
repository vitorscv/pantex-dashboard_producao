ALTER TABLE machine_config
    ADD COLUMN IF NOT EXISTS bonus_ref1 TEXT,
    ADD COLUMN IF NOT EXISTS bonus_ref2 TEXT,
    ADD COLUMN IF NOT EXISTS bonus_ref3 TEXT;

INSERT INTO machine_config (
    machine_id,
    shift,
    label,
    rate1,
    rate2,
    rate3,
    mult1,
    mult2,
    mult3,
    bonus_ref1,
    bonus_ref2,
    bonus_ref3
)
VALUES
    (1, 1, 'MÁQ. 1 · T1', 11500, 13500, 15000, 0.0010, 0.0020, 0.0030, 'R$100,00 a R$146,00', 'R$184,00 a R$284,00', 'ACIMA R$352,00'),
    (1, 2, 'MÁQ. 1 · T2',  9300, 10300, 11300, 0.0012, 0.0025, 0.0038, 'R$100,00 a R$140,48', 'R$184,00 a R$284,00', 'ACIMA R$355,36'),
    (2, 1, 'MÁQ. 2 · T1', 11500, 13500, 15000, 0.0010, 0.0022, 0.0033, 'R$100,00 a R$141,00', 'R$192,40 a R$277,10', 'ACIMA R$342,55'),
    (2, 2, 'MÁQ. 2 · T2',  9300, 10300, 11300, 0.0011, 0.0025, 0.0038, 'R$100,00 a R$140,48', 'R$184,00 a R$284,00', 'ACIMA R$355,36'),
    (3, 1, 'MÁQ. 3 · T1',  7500,  8500,  9500, 0.0015, 0.0020, 0.0030, 'R$100,00 a R$131,50', 'R$142,00 a R$184,00', 'ACIMA R$226,00'),
    (3, 2, 'MÁQ. 3 · T2',  6300,  7300,  8300, 0.0015, 0.0020, 0.0030, 'R$100,00 a R$131,50', 'R$142,00 a R$184,00', 'ACIMA R$226,00'),
    (4, 1, 'MÁQ. 4 · T1',  9000, 10000, 11000, 0.0012, 0.0025, 0.0038, 'R$100,00 a R$144,16', 'R$184,00 a R$284,00', 'ACIMA R$355,36'),
    (4, 2, 'MÁQ. 4 · T2',  8400,  9400, 10400, 0.0012, 0.0025, 0.0038, 'R$100,00 a R$144,16', 'R$184,00 a R$284,00', 'ACIMA R$355,36'),
    (5, 1, 'MÁQ. 5 · T1', 11500, 13500, 15000, 0.0010, 0.0020, 0.0030, 'R$100,00 a R$146,00', 'R$184,00 a R$284,00', 'ACIMA R$352,00'),
    (5, 2, 'MÁQ. 5 · T2',  9300, 10300, 11300, 0.0011, 0.0025, 0.0038, 'R$100,00 a R$140,48', 'R$155,00 a R$284,00', 'ACIMA R$355,36'),
    (6, 1, 'MÁQ. 6 · T1', 11500, 13500, 15000, 0.0010, 0.0020, 0.0030, 'R$100,00 a R$146,00', 'R$184,00 a R$284,00', 'ACIMA R$352,00'),
    (6, 2, 'MÁQ. 6 · T2',  9800, 10800, 11800, 0.0011, 0.0025, 0.0038, 'R$100,00 a R$140,48', 'R$155,00 a R$284,00', 'ACIMA R$223,2')
ON CONFLICT (machine_id, shift) DO UPDATE
SET
    label = EXCLUDED.label,
    rate1 = EXCLUDED.rate1,
    rate2 = EXCLUDED.rate2,
    rate3 = EXCLUDED.rate3,
    mult1 = EXCLUDED.mult1,
    mult2 = EXCLUDED.mult2,
    mult3 = EXCLUDED.mult3,
    bonus_ref1 = EXCLUDED.bonus_ref1,
    bonus_ref2 = EXCLUDED.bonus_ref2,
    bonus_ref3 = EXCLUDED.bonus_ref3;

ALTER TABLE machine_config
    ALTER COLUMN bonus_ref1 SET NOT NULL,
    ALTER COLUMN bonus_ref2 SET NOT NULL,
    ALTER COLUMN bonus_ref3 SET NOT NULL;
