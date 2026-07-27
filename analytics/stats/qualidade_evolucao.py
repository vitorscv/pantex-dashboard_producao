from typing import Any

from app.database import get_db
from analytics.schemas import QualityMonthPoint, QualityTrendStat


def _last_months(year: int, month: int, months_back: int) -> list[tuple[int, int]]:
    months: list[tuple[int, int]] = []
    y, m = year, month
    for _ in range(months_back):
        months.append((y, m))
        m -= 1
        if m < 1:
            m = 12
            y -= 1
    months.reverse()
    return months


def get_quality_trend(year: int, month: int, months_back: int = 6) -> QualityTrendStat:
    months: list[tuple[int, int]] = _last_months(year, month, months_back)

    conditions: str = " OR ".join(
        "(EXTRACT(YEAR FROM entry_date) = %s AND EXTRACT(MONTH FROM entry_date) = %s)"
        for _ in months
    )
    params: list[int] = [value for pair in months for value in pair]

    with get_db() as cursor:
        cursor.execute(
            f"""
            SELECT
                EXTRACT(YEAR  FROM entry_date)::int AS yr,
                EXTRACT(MONTH FROM entry_date)::int AS mo,
                COALESCE(SUM(quantity), 0)           AS total_produced,
                COALESCE(SUM(repair_qty), 0)         AS total_repair,
                COALESCE(SUM(second_quality_qty), 0) AS total_second_quality
            FROM prod_entries
            WHERE {conditions}
            GROUP BY yr, mo
            """,
            params,
        )
        rows: list[dict[str, Any]] = cursor.fetchall()

    by_month: dict[tuple[int, int], dict[str, Any]] = {(r["yr"], r["mo"]): r for r in rows}

    points: list[QualityMonthPoint] = []
    for y, m in months:
        row = by_month.get((y, m))
        total_produced: int = int(row["total_produced"]) if row else 0
        total_repair: int = int(row["total_repair"]) if row else 0
        total_second_quality: int = int(row["total_second_quality"]) if row else 0
        total_non_conforme: int = total_repair + total_second_quality
        pct_repair: float = round(total_repair / total_produced * 100, 2) if total_produced > 0 else 0.0
        pct_second_quality: float = (
            round(total_second_quality / total_produced * 100, 2) if total_produced > 0 else 0.0
        )
        pct_non_conforme: float = (
            round(total_non_conforme / total_produced * 100, 2) if total_produced > 0 else 0.0
        )
        points.append(
            QualityMonthPoint(
                year=y,
                month=m,
                total_produced=total_produced,
                total_repair=total_repair,
                total_second_quality=total_second_quality,
                total_non_conforme=total_non_conforme,
                pct_repair=pct_repair,
                pct_second_quality=pct_second_quality,
                pct_non_conforme=pct_non_conforme,
            )
        )

    return QualityTrendStat(months=points)
