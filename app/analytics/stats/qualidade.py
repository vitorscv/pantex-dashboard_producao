from typing import Any

from app.analytics.schemas import QualityStat
from app.database import get_db


def get_quality_stat(year: int, month: int) -> QualityStat:
    with get_db() as cursor:
        cursor.execute(
            """
            SELECT
                COALESCE(SUM(quantity), 0)           AS total_produced,
                COALESCE(SUM(repair_qty), 0)         AS total_repair,
                COALESCE(SUM(second_quality_qty), 0) AS total_second_quality
            FROM prod_entries
            WHERE EXTRACT(YEAR  FROM entry_date) = %s
              AND EXTRACT(MONTH FROM entry_date) = %s
            """,
            (year, month),
        )
        row: dict[str, Any] | None = cursor.fetchone()

    total_produced: int = int(row["total_produced"]) if row else 0
    total_repair: int = int(row["total_repair"]) if row else 0
    total_second_quality: int = int(row["total_second_quality"]) if row else 0
    total_non_conforme: int = total_repair + total_second_quality

    if total_produced > 0:
        pct_repair: float = round(total_repair / total_produced * 100, 2)
        pct_second_quality: float = round(total_second_quality / total_produced * 100, 2)
        pct_non_conforme: float = round(total_non_conforme / total_produced * 100, 2)
    else:
        pct_repair = 0.0
        pct_second_quality = 0.0
        pct_non_conforme = 0.0

    return QualityStat(
        year=year,
        month=month,
        total_produced=total_produced,
        total_repair=total_repair,
        total_second_quality=total_second_quality,
        total_non_conforme=total_non_conforme,
        pct_repair=pct_repair,
        pct_second_quality=pct_second_quality,
        pct_non_conforme=pct_non_conforme,
    )

