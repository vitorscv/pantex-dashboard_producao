from typing import Callable

from pydantic import BaseModel

from analytics.schemas import StatMeta
from analytics.stats.qualidade import get_quality_stat
from analytics.stats.qualidade_por_maquina import get_quality_by_machine
from analytics.stats.qualidade_evolucao import get_quality_trend
from analytics.stats.qualidade_comparativo import get_quality_comparison


STATS_REGISTRY: dict[str, tuple[StatMeta, Callable[[int, int], BaseModel]]] = {
    "qualidade": (
        StatMeta(
            id="qualidade",
            title="Qualidade",
            description="Percentual de reparo, segunda qualidade e não conforme sobre o total produzido.",
        ),
        get_quality_stat,
    ),
    "qualidade_por_maquina": (
        StatMeta(
            id="qualidade_por_maquina",
            title="Qualidade por Máquina",
            description="Não conforme por máquina no mês, do pior para o melhor desempenho.",
        ),
        get_quality_by_machine,
    ),
    "qualidade_evolucao": (
        StatMeta(
            id="qualidade_evolucao",
            title="Evolução da Qualidade",
            description="Percentual de não conforme nos últimos 6 meses.",
        ),
        get_quality_trend,
    ),
    "qualidade_comparativo": (
        StatMeta(
            id="qualidade_comparativo",
            title="Comparativo Mensal",
            description="Comparação do percentual de não conforme com o mês anterior.",
        ),
        get_quality_comparison,
    ),
}


def list_stats() -> list[StatMeta]:
    return [meta for meta, _ in STATS_REGISTRY.values()]
