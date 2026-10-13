-- Atualiza as metas (rate1/rate2/rate3) do Turno 2 das Máquinas 1 a 5
BEGIN;

UPDATE machine_config SET rate1 = 4570,  rate2 = 5061,  rate3 = 5553  WHERE machine_id = 1 AND shift = 2;
UPDATE machine_config SET rate1 = 4570,  rate2 = 5061,  rate3 = 5553  WHERE machine_id = 2 AND shift = 2;
UPDATE machine_config SET rate1 = 3577,  rate2 = 4003,  rate3 = 4429  WHERE machine_id = 3 AND shift = 2;
UPDATE machine_config SET rate1 = 9200,  rate2 = 10139, rate3 = 11078 WHERE machine_id = 4 AND shift = 2;
UPDATE machine_config SET rate1 = 4570,  rate2 = 5061,  rate3 = 5553  WHERE machine_id = 5 AND shift = 2;

COMMIT;
