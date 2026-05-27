from datetime import date
from typing import Any

from fastapi import APIRouter, Query

from app.database import get_db
from app.schemas import DashboardSummary, MachineStatus
from app.services.bonus import build_bonus_display, calculate_bonus
from app.services.calendar_svc import get_business_days

router = APIRouter()


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
                   bonus_ref1, bonus_ref2, bonus_ref3
            FROM machine_config
            ORDER BY machine_id, shift
            """,
        )
        configs: list[dict[str, Any]] = cursor.fetchall()

        
        cursor.execute(
            """
            SELECT
                p.machine_id,
                p.shift,
                COALESCE(SUM(p.quantity), 0)           AS total_produced,
                COALESCE(SUM(p.repair_qty), 0)         AS repair_qty,
                COALESCE(SUM(p.second_quality_qty), 0) AS second_quality_qty,
                COALESCE(SUM(p.downtime_minutes), 0)   AS total_downtime,
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
                 ORDER BY p2.entry_date DESC LIMIT 1) AS last_qty
            FROM prod_entries p
            WHERE EXTRACT(YEAR  FROM p.entry_date) = %s
              AND EXTRACT(MONTH FROM p.entry_date) = %s
            GROUP BY p.machine_id, p.shift
            """,
            (year, month, year, month, year, month, year, month),
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

        # minutos produtivos padrão por turno (já descontado 1h almoço)
        _shift_minutes = {1: 525, 2: 435}
        standard_min: int = _shift_minutes.get(shift, 525)
        effective_days: float = max(0.0, business_days - total_downtime / standard_min)

        meta1: int = int(effective_days * cfg["rate1"])
        meta2: int = int(effective_days * cfg["rate2"])
        meta3: int = int(effective_days * cfg["rate3"])
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
            rate1=cfg["rate1"],
            rate2=cfg["rate2"],
            rate3=cfg["rate3"],
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
                rate1=int(bonus_display["rate1"]),
                rate2=int(bonus_display["rate2"]),
                rate3=int(bonus_display["rate3"]),
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
                mult1=float(cfg["mult1"]),
                mult2=float(cfg["mult2"]),
                mult3=float(cfg["mult3"]),
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
