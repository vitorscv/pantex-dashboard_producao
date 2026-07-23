from typing import Any

from app.database import get_db
from analytics.schemas import MachineQuality, QualityByMachineStat


def get_quality_by_machine(year: int, month: int) -> QualityByMachineStat:
    with get_db() as cursor:
        cursor.execute(
            """
            SELECT
                mc.machine_id,
                mc.shift,
                mc.label,
                COALESCE(SUM(p.quantity), 0)           AS total_produced,
                COALESCE(SUM(p.repair_qty), 0)         AS total_repair,
                COALESCE(SUM(p.second_quality_qty), 0) AS total_second_quality
            FROM machine_config mc
            LEFT JOIN prod_entries p
                   ON p.machine_id = mc.machine_id
                  AND p.shift      = mc.shift
                  AND EXTRACT(YEAR  FROM p.entry_date) = %s
                  AND EXTRACT(MONTH FROM p.entry_date) = %s
            GROUP BY mc.machine_id, mc.shift, mc.label
            ORDER BY mc.machine_id, mc.shift
            """,
            (year, month),
        )
        rows: list[dict[str, Any]] = cursor.fetchall()

    by_machine: dict[int, dict[str, Any]] = {}
    for row in rows:
        mid: int = row["machine_id"]
        entry = by_machine.setdefault(
            mid,
            {"total_produced": 0, "total_repair": 0, "total_second_quality": 0, "labels": set()},
        )
        entry["total_produced"] += int(row["total_produced"])
        entry["total_repair"] += int(row["total_repair"])
        entry["total_second_quality"] += int(row["total_second_quality"])
        entry["labels"].add(row["label"])

    machines: list[MachineQuality] = []
    for mid, entry in by_machine.items():
        total_produced: int = entry["total_produced"]
        total_repair: int = entry["total_repair"]
        total_second_quality: int = entry["total_second_quality"]
        total_non_conforme: int = total_repair + total_second_quality
        pct_non_conforme: float = (
            round(total_non_conforme / total_produced * 100, 2) if total_produced > 0 else 0.0
        )
        label: str = next(iter(entry["labels"])) if len(entry["labels"]) == 1 else f"MÁQ. {mid}"

        machines.append(
            MachineQuality(
                machine_id=mid,
                label=label,
                total_produced=total_produced,
                total_repair=total_repair,
                total_second_quality=total_second_quality,
                total_non_conforme=total_non_conforme,
                pct_non_conforme=pct_non_conforme,
            )
        )

    machines.sort(key=lambda m: m.pct_non_conforme, reverse=True)

    return QualityByMachineStat(year=year, month=month, machines=machines)
