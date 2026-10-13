-- Metas por dia com data de início. Sobrepõem rate1/2/3 de machine_config
-- a partir do mês de valid_from; meses anteriores seguem machine_config.
-- Aceitam decimais para fechar uma meta mensal exata (meta do mês ÷ dias úteis).
CREATE TABLE IF NOT EXISTS machine_rates (
    machine_id  INTEGER        NOT NULL,
    shift       INTEGER        NOT NULL,
    valid_from  DATE           NOT NULL,
    rate1       NUMERIC(12, 4) NOT NULL,
    rate2       NUMERIC(12, 4) NOT NULL,
    rate3       NUMERIC(12, 4) NOT NULL,
    PRIMARY KEY (machine_id, shift, valid_from)
);

ALTER TABLE machine_rates
    ALTER COLUMN rate1 TYPE NUMERIC(12, 4),
    ALTER COLUMN rate2 TYPE NUMERIC(12, 4),
    ALTER COLUMN rate3 TYPE NUMERIC(12, 4);

INSERT INTO machine_rates (machine_id, shift, valid_from, rate1, rate2, rate3)
VALUES
    -- M4 T2, turno de 3h15: meta 1 de 76.783 em outubro (21 dias úteis)
    (4, 2, DATE '2026-10-01', 3656.3333, 4029.5178, 4402.7022),
    -- M6 T2, turno de 4h15: 3.157 pç/dia, faixas na proporção anterior (5.300/6.300/7.300)
    (6, 2, DATE '2026-10-01', 3157.0000, 3752.6604, 4348.3208),
    -- M7 T1: 6.500 pç/dia, faixas na proporção anterior (6.000/7.000/8.000)
    (7, 1, DATE '2026-10-01', 6500.0000, 7583.3333, 8666.6667),
    -- M4 T1: meta geral 193.200 em outubro (9.200 × 21), faixas na proporção anterior (11.500/13.500/15.000)
    (4, 1, DATE '2026-10-01', 9200.0000, 10800.0000, 12000.0000)
ON CONFLICT (machine_id, shift, valid_from) DO UPDATE
SET rate1 = EXCLUDED.rate1,
    rate2 = EXCLUDED.rate2,
    rate3 = EXCLUDED.rate3;
