def calculate_bonus(
    total: int,
    meta1: int,
    meta2: int,
    meta3: int,
    mult1: float,
    mult2: float,
    mult3: float,
) -> tuple[int, float]:
    if total < meta1:
        return 0, 0.0

    excedente: int = total - meta1

    if total < meta2:
        return 1, round(excedente * mult1 + 100, 2)

    if total < meta3:
        return 2, round(excedente * mult2 + 100, 2)

    return 3, round(excedente * mult3 + 100, 2)
