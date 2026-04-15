from typing import Any

from fastapi import APIRouter, Depends

from app.auth import verify_api_key
from app.database import get_db
from app.schemas import ProductionEntry

router = APIRouter()


@router.post("/entries")
def create_entry(
    entry: ProductionEntry,
    _: str = Depends(verify_api_key),
) -> dict[str, bool]:
    with get_db() as cursor:
        cursor.execute(
            """
            INSERT INTO prod_entries
                (entry_date, machine_id, shift, quantity,
                 repair_qty, second_quality_qty, start_time, end_time)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (entry_date, machine_id, shift) DO UPDATE
                SET quantity            = EXCLUDED.quantity,
                    repair_qty          = EXCLUDED.repair_qty,
                    second_quality_qty  = EXCLUDED.second_quality_qty,
                    start_time          = EXCLUDED.start_time,
                    end_time            = EXCLUDED.end_time
            """,
            (
                entry.entry_date, entry.machine_id, entry.shift, entry.quantity,
                entry.repair_qty, entry.second_quality_qty,
                entry.start_time, entry.end_time,
            ),
        )
    return {"ok": True}


@router.get("/entries/{year}/{month}")
def list_entries(year: int, month: int) -> list[dict[str, Any]]:
    with get_db() as cursor:
        cursor.execute(
            """
            SELECT entry_date, machine_id, shift, quantity,
                   repair_qty, second_quality_qty, start_time, end_time
            FROM prod_entries
            WHERE EXTRACT(YEAR  FROM entry_date) = %s
              AND EXTRACT(MONTH FROM entry_date) = %s
            ORDER BY entry_date, machine_id, shift
            """,
            (year, month),
        )
        return cursor.fetchall()
