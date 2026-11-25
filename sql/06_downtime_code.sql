-- Causas da parada de um lançamento (várias por lançamento, com os minutos de cada uma):
--   1 manutenção, 2 falta de MP, 3 reuniões, 4 falta de energia, 5 falta de OP, 6 troca de bobina, 7 setup.
-- A soma dos minutos das causas é o downtime_minutes do lançamento em prod_entries.
CREATE TABLE IF NOT EXISTS downtime_causes (
    entry_date  DATE     NOT NULL,
    machine_id  INTEGER  NOT NULL,
    shift       INTEGER  NOT NULL,
    code        SMALLINT NOT NULL,
    minutes     INTEGER  NOT NULL CHECK (minutes > 0),
    PRIMARY KEY (entry_date, machine_id, shift, code)
);

ALTER TABLE downtime_causes DROP CONSTRAINT IF EXISTS downtime_causes_code_check;
ALTER TABLE downtime_causes
    ADD CONSTRAINT downtime_causes_code_check CHECK (code BETWEEN 1 AND 7);
