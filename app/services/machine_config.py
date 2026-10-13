from datetime import date
from typing import Any

DEFAULT_SHIFT_MINUTES: dict[int, int] = {1: 525, 2: 435}
SHIFTS: tuple[int, ...] = (1, 2)
MACHINE_IDS: tuple[int, ...] = tuple(range(1, 8))
# Registros em shift_minutes com esta data (ou anterior) são o padrão de fábrica e não aparecem como "alteração"
BASE_VALID_FROM = date(2000, 1, 1)


def build_shift_minutes_view(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Minutos do turno vigentes por turno e máquina.

    `rows` traz, para cada (turno, máquina) de shift_minutes, a linha mais recente com
    valid_from <= data consultada. machine_id = 0 é o padrão do turno; uma linha com a máquina
    informada tem prioridade (mesma regra usada em /api/summary).
    """
    latest = {(r["shift"], r["machine_id"]): r for r in rows}

    def since(row: dict[str, Any] | None) -> str | None:
        return str(row["valid_from"]) if row and row["valid_from"] > BASE_VALID_FROM else None

    view: list[dict[str, Any]] = []
    for shift in SHIFTS:
        default = latest.get((shift, 0))
        default_minutes = int(default["minutes"]) if default else DEFAULT_SHIFT_MINUTES[shift]
        view.append({
            "shift": shift, "machine_id": 0, "minutes": default_minutes,
            "valid_from": since(default), "source": "turno",
        })
        for machine_id in MACHINE_IDS:
            specific = latest.get((shift, machine_id))
            if specific:
                view.append({
                    "shift": shift, "machine_id": machine_id, "minutes": int(specific["minutes"]),
                    "valid_from": since(specific), "source": "maquina",
                })
            else:
                view.append({
                    "shift": shift, "machine_id": machine_id, "minutes": default_minutes,
                    "valid_from": since(default), "source": "turno",
                })
    return view
