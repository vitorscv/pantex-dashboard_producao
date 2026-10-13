from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import verify_api_key
from app.database import get_db
from app.schemas import RatesUpdate, ShiftMinutesUpdate
from app.services.machine_config import BASE_VALID_FROM, build_shift_minutes_view

router = APIRouter()


def _first_of_month(year: int | None, month: int | None) -> date:
    today = date.today()
    return date(year if year is not None else today.year, month if month is not None else today.month, 1)


@router.get("/config/rates")
def get_rates(
    year: int | None = Query(default=None),
    month: int | None = Query(default=None),
) -> list[dict[str, Any]]:
    """Metas por dia vigentes no mês: machine_rates sobrepõe machine_config a partir de valid_from."""
    with get_db() as cursor:
        cursor.execute(
            """
            SELECT c.machine_id, c.shift, c.label,
                   COALESCE(r.rate1, c.rate1) AS rate1,
                   COALESCE(r.rate2, c.rate2) AS rate2,
                   COALESCE(r.rate3, c.rate3) AS rate3,
                   r.valid_from AS valid_from
            FROM machine_config c
            LEFT JOIN LATERAL (
                SELECT rate1, rate2, rate3, valid_from
                FROM machine_rates
                WHERE machine_id = c.machine_id
                  AND shift      = c.shift
                  AND valid_from <= %s
                ORDER BY valid_from DESC
                LIMIT 1
            ) r ON TRUE
            ORDER BY c.machine_id, c.shift
            """,
            (_first_of_month(year, month),),
        )
        rows = cursor.fetchall()
    return [
        {
            **row,
            "rate1": float(row["rate1"]), "rate2": float(row["rate2"]), "rate3": float(row["rate3"]),
            "valid_from": str(row["valid_from"]) if row["valid_from"] else None,
        }
        for row in rows
    ]


@router.put("/config/rates")
def put_rates(update: RatesUpdate, _: str = Depends(verify_api_key)) -> dict[str, bool]:
    with get_db() as cursor:
        cursor.execute(
            "SELECT 1 FROM machine_config WHERE machine_id = %s AND shift = %s",
            (update.machine_id, update.shift),
        )
        if cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail="Máquina/turno não cadastrado")
        cursor.execute(
            """
            INSERT INTO machine_rates (machine_id, shift, valid_from, rate1, rate2, rate3)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (machine_id, shift, valid_from) DO UPDATE
                SET rate1 = EXCLUDED.rate1, rate2 = EXCLUDED.rate2, rate3 = EXCLUDED.rate3
            """,
            (
                update.machine_id, update.shift, date(update.year, update.month, 1),
                update.rate1, update.rate2, update.rate3,
            ),
        )
    return {"ok": True}


@router.delete("/config/rates/{machine_id}/{shift}/{year}/{month}")
def delete_rates(
    machine_id: int, shift: int, year: int, month: int,
    _: str = Depends(verify_api_key),
) -> dict[str, bool]:
    with get_db() as cursor:
        cursor.execute(
            "DELETE FROM machine_rates WHERE machine_id = %s AND shift = %s AND valid_from = %s",
            (machine_id, shift, date(year, month, 1)),
        )
        deleted = cursor.rowcount
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Vigência de meta não encontrada")
    return {"ok": True}


@router.get("/config/shift-minutes")
def get_shift_minutes(on: date | None = Query(default=None)) -> list[dict[str, Any]]:
    """Minutos produtivos do turno vigentes na data (padrão: hoje). machine_id 0 = padrão do turno."""
    with get_db() as cursor:
        cursor.execute(
            """
            SELECT DISTINCT ON (shift, machine_id) shift, machine_id, minutes, valid_from
            FROM shift_minutes
            WHERE valid_from <= %s
            ORDER BY shift, machine_id, valid_from DESC
            """,
            (on or date.today(),),
        )
        rows = cursor.fetchall()
    return build_shift_minutes_view(rows)


@router.put("/config/shift-minutes")
def put_shift_minutes(update: ShiftMinutesUpdate, _: str = Depends(verify_api_key)) -> dict[str, bool]:
    with get_db() as cursor:
        cursor.execute(
            """
            INSERT INTO shift_minutes (shift, machine_id, valid_from, minutes)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (shift, machine_id, valid_from) DO UPDATE SET minutes = EXCLUDED.minutes
            """,
            (update.shift, update.machine_id, update.valid_from, update.minutes),
        )
    return {"ok": True}


@router.delete("/config/shift-minutes/{shift}/{machine_id}/{valid_from}")
def delete_shift_minutes(
    shift: int, machine_id: int, valid_from: date,
    _: str = Depends(verify_api_key),
) -> dict[str, bool]:
    if valid_from <= BASE_VALID_FROM:
        raise HTTPException(status_code=400, detail="O padrão de fábrica do turno não pode ser removido")
    with get_db() as cursor:
        cursor.execute(
            "DELETE FROM shift_minutes WHERE shift = %s AND machine_id = %s AND valid_from = %s",
            (shift, machine_id, valid_from),
        )
        deleted = cursor.rowcount
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Vigência de turno não encontrada")
    return {"ok": True}


@router.get("/config/history")
def get_history() -> dict[str, list[dict[str, Any]]]:
    """Alterações cadastradas (o padrão de fábrica não aparece)."""
    with get_db() as cursor:
        cursor.execute(
            """
            SELECT machine_id, shift, valid_from, rate1, rate2, rate3
            FROM machine_rates
            ORDER BY valid_from DESC, machine_id, shift
            """
        )
        rates = cursor.fetchall()
        cursor.execute(
            """
            SELECT shift, machine_id, valid_from, minutes
            FROM shift_minutes
            WHERE valid_from > %s
            ORDER BY valid_from DESC, shift, machine_id
            """,
            (BASE_VALID_FROM,),
        )
        minutes = cursor.fetchall()
    return {
        "rates": [
            {**r, "valid_from": str(r["valid_from"]), "rate1": float(r["rate1"]), "rate2": float(r["rate2"]), "rate3": float(r["rate3"])}
            for r in rates
        ],
        "shift_minutes": [{**m, "valid_from": str(m["valid_from"])} for m in minutes],
    }
