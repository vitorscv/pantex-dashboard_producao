BEGIN;

-- Troca M3 <-> M4 (T1 e T2)
-- M3 recebe config da M4
UPDATE machine_config SET
    rate1 = 9000, rate2 = 10000, rate3 = 11000,
    mult1 = 0.0012, mult2 = 0.0025, mult3 = 0.0038,
    bonus_ref1 = 'R$100,00 a R$144,16',
    bonus_ref2 = 'R$184,00 a R$284,00',
    bonus_ref3 = 'ACIMA R$355,36'
WHERE machine_id = 3 AND shift = 1;

UPDATE machine_config SET
    rate1 = 8400, rate2 = 9400, rate3 = 10400,
    mult1 = 0.0012, mult2 = 0.0025, mult3 = 0.0038,
    bonus_ref1 = 'R$100,00 a R$144,16',
    bonus_ref2 = 'R$184,00 a R$284,00',
    bonus_ref3 = 'ACIMA R$355,36'
WHERE machine_id = 3 AND shift = 2;

-- M4 recebe config da M3
UPDATE machine_config SET
    rate1 = 11500, rate2 = 13500, rate3 = 15000,
    mult1 = 0.0010, mult2 = 0.0020, mult3 = 0.0030,
    bonus_ref1 = 'R$100,00 a R$146,00',
    bonus_ref2 = 'R$184,00 a R$284,00',
    bonus_ref3 = 'ACIMA R$352,00'
WHERE machine_id = 4 AND shift = 1;

UPDATE machine_config SET
    rate1 = 9800, rate2 = 10800, rate3 = 11800,
    mult1 = 0.0011, mult2 = 0.0025, mult3 = 0.0038,
    bonus_ref1 = 'R$100,00 a R$140,48',
    bonus_ref2 = 'R$155,00 a R$284,00',
    bonus_ref3 = 'ACIMA R$223,2'
WHERE machine_id = 4 AND shift = 2;

-- M6 e M7: reduz 1000 pecas em todas as metas (treinamento)
UPDATE machine_config SET
    rate1 = rate1 - 1000,
    rate2 = rate2 - 1000,
    rate3 = rate3 - 1000
WHERE machine_id IN (6, 7);

-- Corrige bonus_ref da M7 (encoding estava corrompido)
UPDATE machine_config SET
    bonus_ref1 = 'R$100,00 a R$131,50',
    bonus_ref2 = 'R$142,00 a R$184,00',
    bonus_ref3 = 'ACIMA R$226,00'
WHERE machine_id = 7;

COMMIT;
