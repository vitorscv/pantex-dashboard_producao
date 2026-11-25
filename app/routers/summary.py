from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Query

from app.database import get_db
from app.schemas import DashboardSummary, MachineStatus
from app.services.bonus import build_bonus_display, calculate_bonus
from app.services.calendar_svc import count_business_days, get_business_days

router = APIRouter()

# Causas de parada que afetam meta e bonificação: manutenção, falta de MP, reuniões e falta de energia.
# As demais (falta de OP, troca de bobina, setup...) só aparecem na análise de dados.
BONUS_DOWNTIME_CODES = (1, 2, 3, 4)


@router.get("/summary", response_model=DashboardSummary)
def get_summary(
    year: int | None = Query(default=None),
    month: int | None = Query(default=None),
) -> DashboardSummary:
    today = date.today()
    year = year if year is not None else today.year
    month = month if month is not None else today.month

    with get_db() as cursor:
        # Dias úteis do mês atual
        cursor.execute(
            """
            SELECT business_days FROM biz_calendar
            WHERE year = %s AND month = %s
            """,
            (year, month),
        )
        row: dict[str, Any] | None = cursor.fetchone()
        business_days: int = row["business_days"] if row else get_business_days(year, month)

        # Configurações de máquina
        cursor.execute(
            """
            SELECT machine_id, shift, label,
                   rate1, rate2, rate3,
                   mult1, mult2, mult3,
                   bonus_ref1, bonus_ref2, bonus_ref3,
                   rate1_ba, rate2_ba, rate3_ba
            FROM machine_config
            ORDER BY machine_id, shift
            """,
        )
        configs: list[dict[str, Any]] = cursor.fetchall()

        # Metas por dia vigentes no mês (sobrepõem as de machine_config).
        # Uma vigência com valid_from no meio do mês vale só dali em diante: a meta usa a média
        # das metas por dia ponderada pelos dias úteis de cada trecho; a tela mostra a meta nova.
        month_start = date(year, month, 1)
        month_end = date(year + (month == 12), month % 12 + 1, 1)
        cursor.execute(
            """
            SELECT machine_id, shift, valid_from, rate1, rate2, rate3
            FROM machine_rates
            WHERE valid_from < %s
            ORDER BY machine_id, shift, valid_from
            """,
            (month_end,),
        )
        rate_rows: dict[tuple[int, int], list[dict[str, Any]]] = {}
        for r in cursor.fetchall():
            rate_rows.setdefault((r["machine_id"], r["shift"]), []).append(r)
        for cfg in configs:
            cfg["disp_rates"] = (cfg["rate1"], cfg["rate2"], cfg["rate3"])
            rows = rate_rows.get((cfg["machine_id"], cfg["shift"]), [])
            if not rows:
                continue
            before = [r for r in rows if r["valid_from"] <= month_start]
            within = [r for r in rows if r["valid_from"] > month_start]
            # trechos (início, metas) do mês; sem vigência anterior, vale a de machine_config
            segments = [(month_start, (before[-1]["rate1"], before[-1]["rate2"], before[-1]["rate3"]))] \
                if before else [(month_start, (cfg["rate1"], cfg["rate2"], cfg["rate3"]))]
            segments += [(r["valid_from"], (r["rate1"], r["rate2"], r["rate3"])) for r in within]
            weights = [
                count_business_days(start, segments[i + 1][0] if i + 1 < len(segments) else month_end)
                for i, (start, _) in enumerate(segments)
            ]
            total_w = sum(weights)
            if total_w == 0:
                weights, total_w = [0] * len(segments), 1
                weights[-1] = 1
            blended = tuple(
                sum(float(seg[1][k]) * w for seg, w in zip(segments, weights)) / total_w
                for k in range(3)
            )
            cfg.update(
                rate1=blended[0], rate2=blended[1], rate3=blended[2], rate_override=True,
                disp_rates=tuple(float(v) for v in segments[-1][1]),
            )

        # Metas do mês fixadas manualmente (substituem as calculadas)
        cursor.execute(
            """
            SELECT machine_id, shift, meta1, meta2, meta3, ignore_ba
            FROM machine_month_meta
            WHERE year = %s AND month = %s
            """,
            (year, month),
        )
        fixed_metas: dict[tuple[int, int], dict] = {
            (r["machine_id"], r["shift"]): r for r in cursor.fetchall()
        }

        # Minutos produtivos por turno vigentes hoje (ou no fim do mês, se já passou; já descontado
        # 1h almoço); usado só como referência na tela — a meta usa o turno vigente em cada lançamento
        ref_date = max(month_start, min(today, month_end - timedelta(days=1)))
        cursor.execute(
            """
            SELECT DISTINCT ON (shift, machine_id) shift, machine_id, minutes
            FROM shift_minutes
            WHERE valid_from <= %s
            ORDER BY shift, machine_id, valid_from DESC
            """,
            (ref_date,),
        )
        # chave (turno, máquina); máquina 0 = padrão do turno
        shift_minutes: dict[tuple[int, int], int] = {(1, 0): 525, (2, 0): 435}
        shift_minutes.update(
            {(r["shift"], r["machine_id"]): r["minutes"] for r in cursor.fetchall()}
        )

        # Histórico completo de vigências: o pç/h usa os minutos vigentes na data do último lançamento
        cursor.execute(
            "SELECT shift, machine_id, valid_from, minutes FROM shift_minutes"
        )
        shift_history: list[dict[str, Any]] = cursor.fetchall()

        cursor.execute(
            """
            SELECT
                p.machine_id,
                p.shift,
                COALESCE(SUM(p.quantity), 0)           AS total_produced,
                COALESCE(SUM(p.repair_qty), 0)         AS repair_qty,
                COALESCE(SUM(p.second_quality_qty), 0) AS second_quality_qty,
                -- total de paradas (todas as causas): usado na análise de dados
                COALESCE(SUM(p.downtime_minutes), 0)   AS total_downtime,
                -- só as causas que afetam a bonificação (lançamentos sem causas contam inteiros)
                COALESCE(SUM(GREATEST(p.downtime_minutes - ex.minutes, 0)), 0) AS bonus_downtime,
                -- parada da bonificação convertida em dias pelo turno vigente na data do lançamento
                COALESCE(SUM(GREATEST(p.downtime_minutes - ex.minutes, 0)::numeric / COALESCE(
                    (SELECT sm.minutes
                     FROM shift_minutes sm
                     WHERE sm.shift = p.shift
                       AND sm.machine_id IN (0, p.machine_id)
                       AND sm.valid_from <= p.entry_date
                     ORDER BY (sm.machine_id = p.machine_id) DESC, sm.valid_from DESC
                     LIMIT 1),
                    CASE WHEN p.shift = 2 THEN 435 ELSE 525 END
                )), 0)                                 AS lost_days,
                COALESCE(SUM(CASE WHEN p.boca_aberta THEN 1 ELSE 0 END), 0) AS ba_days,
                (SELECT p2.start_time
                 FROM prod_entries p2
                 WHERE p2.machine_id = p.machine_id
                   AND p2.shift      = p.shift
                   AND EXTRACT(YEAR  FROM p2.entry_date) = %s
                   AND EXTRACT(MONTH FROM p2.entry_date) = %s
                   AND p2.start_time IS NOT NULL
                 ORDER BY p2.entry_date DESC LIMIT 1) AS start_time,
                (SELECT p2.end_time
                 FROM prod_entries p2
                 WHERE p2.machine_id = p.machine_id
                   AND p2.shift      = p.shift
                   AND EXTRACT(YEAR  FROM p2.entry_date) = %s
                   AND EXTRACT(MONTH FROM p2.entry_date) = %s
                   AND p2.end_time IS NOT NULL
                 ORDER BY p2.entry_date DESC LIMIT 1) AS end_time,
                (SELECT p2.quantity
                 FROM prod_entries p2
                 WHERE p2.machine_id = p.machine_id
                   AND p2.shift      = p.shift
                   AND EXTRACT(YEAR  FROM p2.entry_date) = %s
                   AND EXTRACT(MONTH FROM p2.entry_date) = %s
                 ORDER BY p2.entry_date DESC LIMIT 1) AS last_qty,
                (SELECT p2.entry_date
                 FROM prod_entries p2
                 WHERE p2.machine_id = p.machine_id
                   AND p2.shift      = p.shift
                   AND EXTRACT(YEAR  FROM p2.entry_date) = %s
                   AND EXTRACT(MONTH FROM p2.entry_date) = %s
                 ORDER BY p2.entry_date DESC LIMIT 1) AS last_date
            FROM prod_entries p
            LEFT JOIN LATERAL (
                -- minutos das causas que não afetam a bonificação (fora de 1 a 4)
                SELECT COALESCE(SUM(dc.minutes), 0) AS minutes
                FROM downtime_causes dc
                WHERE dc.entry_date = p.entry_date
                  AND dc.machine_id = p.machine_id
                  AND dc.shift      = p.shift
                  AND dc.code NOT IN %s
            ) ex ON TRUE
            WHERE EXTRACT(YEAR  FROM p.entry_date) = %s
              AND EXTRACT(MONTH FROM p.entry_date) = %s
            GROUP BY p.machine_id, p.shift
            """,
            (year, month, year, month, year, month, year, month, BONUS_DOWNTIME_CODES, year, month),
        )
        totals: dict[tuple[int, int], dict] = {
            (r["machine_id"], r["shift"]): r
            for r in cursor.fetchall()
        }

        cursor.execute(
            """
            SELECT COUNT(DISTINCT entry_date) AS days_recorded
            FROM prod_entries
            WHERE EXTRACT(YEAR  FROM entry_date) = %s
              AND EXTRACT(MONTH FROM entry_date) = %s
            """,
            (year, month),
        )
        dr = cursor.fetchone()
        days_recorded: int = int(dr["days_recorded"]) if dr else 0

    machines: list[MachineStatus] = []
    for cfg in configs:
        mid: int = cfg["machine_id"]
        shift: int = cfg["shift"]
        row: dict = totals.get((mid, shift), {})
        total_produced: int = int(row.get("total_produced", 0))
        total_downtime: int = int(row.get("total_downtime", 0))
        ba_days: int = int(row.get("ba_days", 0))

        standard_min: int = shift_minutes.get(
            (shift, mid), shift_minutes.get((shift, 0), 525)
        )
        last_date = row.get("last_date")
        last_minutes: int = standard_min
        if last_date:
            # registro mais recente vigente na data; máquina específica tem prioridade sobre o padrão (0)
            valid = [
                h for h in shift_history
                if h["shift"] == shift and h["machine_id"] in (0, mid) and h["valid_from"] <= last_date
            ]
            if valid:
                last_minutes = max(
                    valid, key=lambda h: (h["machine_id"] == mid, h["valid_from"])
                )["minutes"]
        lost_days: float = float(row.get("lost_days", 0))
        effective_days: float = max(0.0, business_days - lost_days)

        # metas de machine_rates têm decimais: arredonda ao inteiro mais próximo;
        # as de machine_config mantêm o truncamento original (não altera meses passados)
        to_meta = (lambda v: int(round(v))) if cfg.get("rate_override") else int

        fixed = fixed_metas.get((mid, shift), {})

        if cfg.get("rate1_ba") and not fixed.get("ignore_ba"):
            normal_days: float = max(0.0, effective_days - ba_days)
            meta1 = to_meta(normal_days * cfg["rate1"] + ba_days * cfg["rate1_ba"])
            meta2 = to_meta(normal_days * cfg["rate2"] + ba_days * cfg["rate2_ba"])
            meta3 = to_meta(normal_days * cfg["rate3"] + ba_days * cfg["rate3_ba"])
        else:
            meta1 = to_meta(effective_days * cfg["rate1"])
            meta2 = to_meta(effective_days * cfg["rate2"])
            meta3 = to_meta(effective_days * cfg["rate3"])

        meta1 = fixed.get("meta1") or meta1
        meta2 = fixed.get("meta2") or meta2
        meta3 = fixed.get("meta3") or meta3
        saldo: int = total_produced - meta1
        pct_meta1: float = round(total_produced / meta1 * 100, 1) if meta1 > 0 else 0.0

        bonus_tier, bonus_value = calculate_bonus(
            total=total_produced,
            meta1=meta1,
            meta2=meta2,
            meta3=meta3,
            mult1=cfg["mult1"],
            mult2=cfg["mult2"],
            mult3=cfg["mult3"],
        )

        bonus_display = build_bonus_display(
            business_days=business_days,
            rate1=cfg["disp_rates"][0],
            rate2=cfg["disp_rates"][1],
            rate3=cfg["disp_rates"][2],
            mult1=cfg["mult1"],
            mult2=cfg["mult2"],
            mult3=cfg["mult3"],
            bonus_ref1=cfg.get("bonus_ref1"),
            bonus_ref2=cfg.get("bonus_ref2"),
            bonus_ref3=cfg.get("bonus_ref3"),
        )

        start_t = row.get("start_time")
        end_t   = row.get("end_time")

        machines.append(
            MachineStatus(
                machine_id=mid,
                shift=shift,
                label=cfg["label"],
                total_produced=total_produced,
                meta1=meta1,
                meta2=meta2,
                meta3=meta3,
                saldo=saldo,
                bonus_tier=bonus_tier,
                bonus_value=bonus_value,
                rate1=int(round(bonus_display["rate1"])),
                rate2=int(round(bonus_display["rate2"])),
                rate3=int(round(bonus_display["rate3"])),
                bonus_ref1=str(bonus_display["bonus_ref1"]),
                bonus_ref2=str(bonus_display["bonus_ref2"]),
                bonus_ref3=str(bonus_display["bonus_ref3"]),
                pct_meta1=pct_meta1,
                repair_qty=int(row.get("repair_qty", 0)),
                second_quality_qty=int(row.get("second_quality_qty", 0)),
                start_time=str(start_t) if start_t else None,
                end_time=str(end_t) if end_t else None,
                last_qty=int(row.get("last_qty") or 0),
                total_downtime=total_downtime,
                bonus_downtime=int(row.get("bonus_downtime", 0)),
                mult1=float(cfg["mult1"]),
                mult2=float(cfg["mult2"]),
                mult3=float(cfg["mult3"]),
                ba_days=ba_days,
                rate1_ba=int(cfg["rate1_ba"] or 0),
                shift_minutes=standard_min,
                last_shift_minutes=last_minutes,
            )
        )

    return DashboardSummary(
        month=f"{month:02d}/{year}",
        business_days=business_days,
        machines=machines,
        grand_total=sum(m.total_produced for m in machines),
        grand_meta1=sum(m.meta1 for m in machines),
        grand_meta2=sum(m.meta2 for m in machines),
        grand_meta3=sum(m.meta3 for m in machines),
        days_recorded=days_recorded,
        nsm_pct=None,
    )
