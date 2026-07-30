from calendar import monthrange
from typing import Any

from app.analytics.schemas import QualityDailyStat, QualityDayPoint
from app.database import get_db


def get_quality_daily(year: int, month: int) -> QualityDailyStat:
    with get_db() as cursor:
        cursor.execute(
            """
            SELECT
                EXTRACT(DAY FROM entry_date)::int       AS day,
                COALESCE(SUM(quantity), 0)             AS total_produced,
                COALESCE(SUM(repair_qty), 0)           AS total_repair,
                COALESCE(SUM(second_quality_qty), 0)   AS total_second_quality
            FROM prod_entries
            WHERE EXTRACT(YEAR  FROM entry_date) = %s
              AND EXTRACT(MONTH FROM entry_date) = %s
            GROUP BY day
            ORDER BY day
            """,
            (year, month),
        )
        rows: list[dict[str, Any]] = cursor.fetchall()

    by_day: dict[int, dict[str, Any]] = {int(row["day"]): row for row in rows}
    total_days = monthrange(year, month)[1]

    days: list[QualityDayPoint] = []
    for day in range(1, total_days + 1):
        row = by_day.get(day)
        total_produced = int(row["total_produced"]) if row else 0
        total_repair = int(row["total_repair"]) if row else 0
        total_second_quality = int(row["total_second_quality"]) if row else 0
        total_non_conforme = total_repair + total_second_quality
        pct_non_conforme = (
            round(total_non_conforme / total_produced * 100, 2) if total_produced > 0 else 0.0
        )
        pct_conforme = (
            round((total_produced - total_non_conforme) / total_produced * 100, 2)
            if total_produced > 0
            else 0.0
        )
        days.append(
            QualityDayPoint(
                day=day,
                total_produced=total_produced,
                total_repair=total_repair,
                total_second_quality=total_second_quality,
                total_non_conforme=total_non_conforme,
                pct_non_conforme=pct_non_conforme,
                pct_conforme=pct_conforme,
            )
        )

    return QualityDailyStat(year=year, month=month, days=days)

