from datetime import date

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.analytics.registry import STATS_REGISTRY, list_stats
from app.analytics.schemas import QualityStat, StatMeta
from app.analytics.stats.qualidade import get_quality_stat

router = APIRouter()


@router.get("/stats", response_model=list[StatMeta])
def get_stats() -> list[StatMeta]:
    return list_stats()


@router.get("/qualidade", response_model=QualityStat)
def get_qualidade(
    year: int | None = Query(default=None),
    month: int | None = Query(default=None),
) -> QualityStat:
    today = date.today()
    year = year if year is not None else today.year
    month = month if month is not None else today.month
    return get_quality_stat(year, month)


@router.get("/{stat_id}", response_model=None)
def get_stat(
    stat_id: str,
    year: int | None = Query(default=None),
    month: int | None = Query(default=None),
) -> BaseModel:
    if stat_id not in STATS_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Estatística '{stat_id}' não encontrada")

    today = date.today()
    year = year if year is not None else today.year
    month = month if month is not None else today.month

    _, stat_fn = STATS_REGISTRY[stat_id]
    return stat_fn(year, month)
