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
            INSERT INTO prod_entries (entry_date, machine_id, shift, quantity)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (entry_date, machine_id, shift) DO UPDATE
                SET quantity = EXCLUDED.quantity
            """,
            (entry.entry_date, entry.machine_id, entry.shift, entry.quantity),
        )
    return {"ok": True}


@router.get("/entries/{year}/{month}")
def list_entries(year: int, month: int) -> list[dict[str, Any]]:
    with get_db() as cursor:
        cursor.execute(
            """
            SELECT entry_date, machine_id, shift, quantity
            FROM prod_entries
            WHERE EXTRACT(YEAR  FROM entry_date) = %s
              AND EXTRACT(MONTH FROM entry_date) = %s
            ORDER BY entry_date, machine_id, shift
            """,
            (year, month),
        )
        return cursor.fetchall()
