from collections import defaultdict
from datetime import date
from typing import Any

from app.analytics.schemas import (
    DowntimeBucket,
    DowntimeCauseMinutes,
    DowntimeCauseTotal,
    DowntimeStat,
)
from app.database import get_db
from app.routers.summary import BONUS_DOWNTIME_CODES

# Mesmos códigos do lançamento (streamlit_app/app.py) e da tabela downtime_causes (sql/06_downtime_code.sql).
DOWNTIME_CAUSES: dict[int, str] = {
    1: "Manutenção",
    2: "Falta de MP",
    3: "Reuniões",
    4: "Falta de energia",
    5: "Falta de OP",
    6: "Troca de bobina",
    7: "Setup",
}
# Lançamentos antigos têm minutos de parada, mas nenhuma causa detalhada.
UNCLASSIFIED_CODE = 0
UNCLASSIFIED_NAME = "Sem causa informada"


def cause_name(code: int) -> str:
    return UNCLASSIFIED_NAME if code == UNCLASSIFIED_CODE else DOWNTIME_CAUSES.get(code, f"Causa {code}")


def affects_bonus(code: int) -> bool:
    # O resumo da TV só exclui da bonificação as causas classificadas fora de 1 a 4;
    # a parada sem causa informada continua contando por inteiro.
    return code == UNCLASSIFIED_CODE or code in BONUS_DOWNTIME_CODES


def _aggregate(entries: list[dict[str, Any]], causes: list[dict[str, Any]]) -> dict[str, Any]:
    """Distribui os minutos de parada por causa, turno, máquina e dia.

    `entries`: uma linha por lançamento com parada (entry_date, machine_id, shift, downtime_minutes).
    `causes`:  uma linha por causa do lançamento (entry_date, machine_id, shift, code, minutes).
    O total vem sempre dos lançamentos; o que não foi detalhado vira "sem causa informada".
    """
    downtime_by_key: dict[tuple, int] = {}
    entry_info: dict[tuple, dict[str, Any]] = {}
    for e in entries:
        key = (e["entry_date"], e["machine_id"], e["shift"])
        downtime_by_key[key] = downtime_by_key.get(key, 0) + int(e["downtime_minutes"])
        entry_info[key] = e

    per_cause: dict[int, int] = defaultdict(int)
    by_shift: dict[int, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    by_machine: dict[int, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    by_day: dict[int, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    classified_by_key: dict[tuple, int] = defaultdict(int)

    def add(key: tuple, code: int, minutes: int) -> None:
        info = entry_info[key]
        per_cause[code] += minutes
        by_shift[code][info["shift"]] += minutes
        by_machine[info["machine_id"]][code] += minutes
        by_day[info["entry_date"].day][code] += minutes

    for c in causes:
        key = (c["entry_date"], c["machine_id"], c["shift"])
        if key not in downtime_by_key:
            continue  # causa de um lançamento sem parada: ignorada para não passar do total
        minutes = int(c["minutes"])
        add(key, int(c["code"]), minutes)
        classified_by_key[key] += minutes

    for key, total in downtime_by_key.items():
        rest = total - classified_by_key.get(key, 0)
        if rest > 0:
            add(key, UNCLASSIFIED_CODE, rest)

    return {
        "total": sum(downtime_by_key.values()),
        "per_cause": dict(per_cause),
        "by_shift": {code: dict(v) for code, v in by_shift.items()},
        "by_machine": {m: dict(v) for m, v in by_machine.items()},
        "by_day": {d: dict(v) for d, v in by_day.items()},
    }


def _buckets(grouped: dict[int, dict[int, int]]) -> list[DowntimeBucket]:
    return [
        DowntimeBucket(
            key=key,
            total_minutes=sum(by_cause.values()),
            causes=[
                DowntimeCauseMinutes(code=code, minutes=minutes)
                for code, minutes in sorted(by_cause.items())
                if minutes > 0
            ],
        )
        for key, by_cause in grouped.items()
    ]


def build_downtime_stat(
    year: int,
    month: int,
    entries: list[dict[str, Any]],
    causes: list[dict[str, Any]],
    prev_entries: list[dict[str, Any]],
    prev_causes: list[dict[str, Any]],
) -> DowntimeStat:
    cur = _aggregate(entries, causes)
    prev = _aggregate(prev_entries, prev_causes)

    total: int = cur["total"]
    unclassified: int = cur["per_cause"].get(UNCLASSIFIED_CODE, 0)
    classified = total - unclassified
    non_bonus_classified = sum(
        minutes for code, minutes in cur["per_cause"].items() if code != UNCLASSIFIED_CODE and not affects_bonus(code)
    )

    codes = {code for code, minutes in cur["per_cause"].items() if minutes > 0}
    codes |= {code for code, minutes in prev["per_cause"].items() if minutes > 0}
    cause_rows: list[DowntimeCauseTotal] = []
    for code in codes:
        minutes = cur["per_cause"].get(code, 0)
        prev_minutes = prev["per_cause"].get(code, 0)
        shifts = cur["by_shift"].get(code, {})
        cause_rows.append(
            DowntimeCauseTotal(
                code=code,
                name=cause_name(code),
                minutes=minutes,
                pct=round(minutes / total * 100, 2) if total > 0 else 0.0,
                affects_bonus=affects_bonus(code),
                shift1_minutes=shifts.get(1, 0),
                shift2_minutes=shifts.get(2, 0),
                prev_minutes=prev_minutes,
                delta_minutes=minutes - prev_minutes,
            )
        )
    cause_rows.sort(key=lambda r: (-r.minutes, r.code))

    machines = sorted(_buckets(cur["by_machine"]), key=lambda b: (-b.total_minutes, b.key))
    days = sorted(_buckets(cur["by_day"]), key=lambda b: b.key)

    return DowntimeStat(
        year=year,
        month=month,
        has_causes=classified > 0,
        total_minutes=total,
        classified_minutes=classified,
        unclassified_minutes=unclassified,
        bonus_minutes=total - non_bonus_classified,
        prev_total_minutes=prev["total"],
        causes=cause_rows,
        machines=machines,
        days=days,
    )


def _previous_month(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def _load_month(cursor: Any, year: int, month: int, causes_table_ready: bool) -> tuple[list[dict], list[dict]]:
    # Somente leitura. O ano/mês filtra por EXTRACT, igual às demais estatísticas do painel.
    cursor.execute(
        """
        SELECT entry_date, machine_id, shift, downtime_minutes
        FROM prod_entries
        WHERE EXTRACT(YEAR  FROM entry_date) = %s
          AND EXTRACT(MONTH FROM entry_date) = %s
          AND downtime_minutes > 0
        """,
        (year, month),
    )
    entries: list[dict] = cursor.fetchall()

    causes: list[dict] = []
    if causes_table_ready:
        cursor.execute(
            """
            SELECT entry_date, machine_id, shift, code, minutes
            FROM downtime_causes
            WHERE EXTRACT(YEAR  FROM entry_date) = %s
              AND EXTRACT(MONTH FROM entry_date) = %s
            """,
            (year, month),
        )
        causes = cursor.fetchall()
    return entries, causes


def get_downtime_stat(year: int, month: int) -> DowntimeStat:
    prev_year, prev_month = _previous_month(year, month)
    with get_db() as cursor:
        # Se a migração 06 ainda não foi aplicada, tudo vira "sem causa informada" em vez de dar erro.
        cursor.execute("SELECT to_regclass('public.downtime_causes') IS NOT NULL AS ready")
        ready = bool(cursor.fetchone()["ready"])
        entries, causes = _load_month(cursor, year, month, ready)
        prev_entries, prev_causes = _load_month(cursor, prev_year, prev_month, ready)

    return build_downtime_stat(year, month, entries, causes, prev_entries, prev_causes)



def _load_day(cursor: Any, day: date, causes_table_ready: bool) -> tuple[list[dict], list[dict]]:
    # Somente leitura, filtrando pela data exata (usado pelo relatório impresso do dia anterior).
    cursor.execute(
        """
        SELECT entry_date, machine_id, shift, downtime_minutes
        FROM prod_entries
        WHERE entry_date = %s AND downtime_minutes > 0
        """,
        (day,),
    )
    entries: list[dict] = cursor.fetchall()

    causes: list[dict] = []
    if causes_table_ready:
        cursor.execute(
            "SELECT entry_date, machine_id, shift, code, minutes FROM downtime_causes WHERE entry_date = %s",
            (day,),
        )
        causes = cursor.fetchall()
    return entries, causes


def get_downtime_day(day: date) -> DowntimeStat:
    """Paradas de um dia. Mesmo formato do mensal; as comparações com o mês anterior ficam zeradas."""
    with get_db() as cursor:
        cursor.execute("SELECT to_regclass('public.downtime_causes') IS NOT NULL AS ready")
        ready = bool(cursor.fetchone()["ready"])
        entries, causes = _load_day(cursor, day, ready)

    return build_downtime_stat(day.year, day.month, entries, causes, [], [])
