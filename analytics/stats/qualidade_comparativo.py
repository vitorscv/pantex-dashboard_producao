from analytics.schemas import QualityComparisonStat
from analytics.stats.qualidade import get_quality_stat


def _previous_month(year: int, month: int) -> tuple[int, int]:
    if month == 1:
        return year - 1, 12
    return year, month - 1


def get_quality_comparison(year: int, month: int) -> QualityComparisonStat:
    prev_year, prev_month = _previous_month(year, month)

    current = get_quality_stat(year, month)
    previous = get_quality_stat(prev_year, prev_month)

    delta_pct_non_conforme: float = round(
        current.pct_non_conforme - previous.pct_non_conforme, 2
    )

    return QualityComparisonStat(
        current=current,
        previous=previous,
        delta_pct_non_conforme=delta_pct_non_conforme,
    )
