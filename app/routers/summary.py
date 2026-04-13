from datetime import date
from typing import Any

from fastapi import APIRouter

from app.database import get_db
from app.schemas import DashboardSummary, MachineStatus
from app.services.bonus import calculate_bonus

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
                   mult1, mult2, mult3
            FROM machine_config
            ORDER BY machine_id, shift
            """,
        )
        configs: list[dict[str, Any]] = cursor.fetchall()

        # Totais produzidos no mês agrupados por máquina e turno
        cursor.execute(
            """
            SELECT machine_id, shift, COALESCE(SUM(quantity), 0) AS total_produced
            FROM prod_entries
            WHERE EXTRACT(YEAR  FROM entry_date) = %s
              AND EXTRACT(MONTH FROM entry_date) = %s
            GROUP BY machine_id, shift
            """,
            (year, month),
        )
        totals: dict[tuple[int, int], int] = {
            (r["machine_id"], r["shift"]): r["total_produced"]
            for r in cursor.fetchall()
        }

    machines: list[MachineStatus] = []
    for cfg in configs:
        mid: int = cfg["machine_id"]
        shift: int = cfg["shift"]
        total_produced: int = totals.get((mid, shift), 0)

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
                pct_meta1=pct_meta1,
            )
        )

    return DashboardSummary(
        month=f"{month:02d}/{year}",
        business_days=business_days,
        machines=machines,
        grand_total=sum(m.total_produced for m in machines),
        nsm_pct=None,
    )
