from typing import Callable

from pydantic import BaseModel

from app.analytics.schemas import StatMeta
from app.analytics.stats.qualidade import get_quality_stat
from app.analytics.stats.qualidade_comparativo import get_quality_comparison
from app.analytics.stats.qualidade_diaria import get_quality_daily
from app.analytics.stats.qualidade_evolucao import get_quality_trend
from app.analytics.stats.qualidade_por_maquina import get_quality_by_machine


STATS_REGISTRY: dict[str, tuple[StatMeta, Callable[[int, int], BaseModel]]] = {
    "qualidade": (
        StatMeta(
            id="qualidade",
            title="Qualidade",
            description="Percentual de reparo, segunda qualidade e nao conforme sobre o total produzido.",
        ),
        get_quality_stat,
    ),
    "qualidade_por_maquina": (
        StatMeta(
            id="qualidade_por_maquina",
            title="Qualidade por Maquina",
            description="Nao conforme por maquina no mes, do pior para o melhor desempenho.",
        ),
        get_quality_by_machine,
    ),
    "qualidade_evolucao": (
        StatMeta(
            id="qualidade_evolucao",
            title="Evolucao da Producao",
            description="Volume produzido e composicao de qualidade nos ultimos 6 meses.",
        ),
        get_quality_trend,
    ),
    "qualidade_comparativo": (
        StatMeta(
            id="qualidade_comparativo",
            title="Comparativo Mensal",
            description="Comparacao do percentual de nao conforme com o mes anterior.",
        ),
        get_quality_comparison,
    ),
    "qualidade_diaria": (
        StatMeta(
            id="qualidade_diaria",
            title="Qualidade Diaria",
            description="Ritmo diario de producao e nao conforme dentro do mes selecionado.",
        ),
        get_quality_daily,
    ),
}


def list_stats() -> list[StatMeta]:
    return [meta for meta, _ in STATS_REGISTRY.values()]

