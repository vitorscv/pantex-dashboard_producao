-- ── biz_calendar ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_calendar (
    year          INTEGER NOT NULL,
    month         INTEGER NOT NULL,
    business_days INTEGER NOT NULL,
    PRIMARY KEY (year, month)
);

-- ── machine_config ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS machine_config (
    machine_id  INTEGER NOT NULL,
    shift       INTEGER NOT NULL,
    label       TEXT    NOT NULL,
    rate1       INTEGER NOT NULL,
    rate2       INTEGER NOT NULL,
    rate3       INTEGER NOT NULL,
    mult1       NUMERIC(10, 4) NOT NULL,
    mult2       NUMERIC(10, 4) NOT NULL,
    mult3       NUMERIC(10, 4) NOT NULL,
    PRIMARY KEY (machine_id, shift)
);

-- ── prod_entries ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prod_entries (
    entry_date          DATE    NOT NULL,
    machine_id          INTEGER NOT NULL,
    shift               INTEGER NOT NULL,
    quantity            INTEGER NOT NULL DEFAULT 0,
    repair_qty          INTEGER NOT NULL DEFAULT 0,
    second_quality_qty  INTEGER NOT NULL DEFAULT 0,
    start_time          TIME    NULL,
    end_time            TIME    NULL,
    PRIMARY KEY (entry_date, machine_id, shift)
);
