from datetime import date
from typing import Any

from fastapi import APIRouter

from app.database import get_db
from app.schemas import DashboardSummary, MachineStatus
from app.services.bonus import build_bonus_display, calculate_bonus

router = APIRouter()


@router.get("/summary", response_model=DashboardSummary)
def get_summary() -> DashboardSummary:
    today = date.today()
    year: int = today.year
    month: int = today.month

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
        business_days: int = row["business_days"] if row else 0

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
                 ORDER BY p2.entry_date DESC LIMIT 1) AS end_time
            FROM prod_entries p
            WHERE EXTRACT(YEAR  FROM p.entry_date) = %s
              AND EXTRACT(MONTH FROM p.entry_date) = %s
            GROUP BY p.machine_id, p.shift
            """,
            (year, month, year, month, year, month),
        )
        totals: dict[tuple[int, int], dict] = {
            (r["machine_id"], r["shift"]): r
            for r in cursor.fetchall()
        }

    machines: list[MachineStatus] = []
    for cfg in configs:
        mid: int = cfg["machine_id"]
        shift: int = cfg["shift"]
        row: dict = totals.get((mid, shift), {})
        total_produced: int = int(row.get("total_produced", 0))

        meta1: int = business_days * cfg["rate1"]
        meta2: int = business_days * cfg["rate2"]
        meta3: int = business_days * cfg["rate3"]
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
        nsm_pct=None,
    )
