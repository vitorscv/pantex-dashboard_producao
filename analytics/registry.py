from typing import Callable

from pydantic import BaseModel

from analytics.schemas import StatMeta
from analytics.stats.qualidade import get_quality_stat

# Como registrar uma nova estatística:
#   1. Criar analytics/stats/<nome>.py com uma função get_<nome>_stat(year, month) -> <Schema>
#   2. Adicionar o schema correspondente (<Schema>) em analytics/schemas.py
#   3. Registrar a entrada abaixo em STATS_REGISTRY, com um StatMeta e a função

STATS_REGISTRY: dict[str, tuple[StatMeta, Callable[[int, int], BaseModel]]] = {
    "qualidade": (
        StatMeta(
            id="qualidade",
            title="Qualidade",
            description="Percentual de reparo, segunda qualidade e não conforme sobre o total produzido.",
        ),
        get_quality_stat,
    ),
}


def list_stats() -> list[StatMeta]:
    return [meta for meta, _ in STATS_REGISTRY.values()]
