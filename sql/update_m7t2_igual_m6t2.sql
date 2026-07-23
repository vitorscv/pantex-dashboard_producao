-- Copia todas as metas da Máq. 6 Turno 2 para a Máq. 7 Turno 2
UPDATE machine_config m7
SET
    rate1      = m6.rate1,
    rate2      = m6.rate2,
    rate3      = m6.rate3,
    mult1      = m6.mult1,
    mult2      = m6.mult2,
    mult3      = m6.mult3,
    bonus_ref1 = m6.bonus_ref1,
    bonus_ref2 = m6.bonus_ref2,
    bonus_ref3 = m6.bonus_ref3
FROM machine_config m6
WHERE m6.machine_id = 6 AND m6.shift = 2
  AND m7.machine_id = 7 AND m7.shift = 2;
