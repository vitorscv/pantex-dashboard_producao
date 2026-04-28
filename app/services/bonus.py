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


def build_bonus_display(
    *,
    business_days: int,
    rate1: int,
    rate2: int,
    rate3: int,
    mult1: float,
    mult2: float,
    mult3: float,
    bonus_ref1: str | None = None,
    bonus_ref2: str | None = None,
    bonus_ref3: str | None = None,
) -> dict[str, int | str]:
    if bonus_ref1 and bonus_ref2 and bonus_ref3:
        return {
            "rate1": rate1,
            "rate2": rate2,
            "rate3": rate3,
            "bonus_ref1": bonus_ref1,
            "bonus_ref2": bonus_ref2,
            "bonus_ref3": bonus_ref3,
        }

    meta1 = business_days * rate1
    meta2 = business_days * rate2
    meta3 = business_days * rate3

    b1_max = round((meta2 - meta1) * mult1 + 100, 2)
    b2_min = round((meta2 - meta1) * mult2 + 100, 2)
    b2_max = round((meta3 - meta1) * mult2 + 100, 2)
    b3_min = round((meta3 - meta1) * mult3 + 100, 2)

    return {
        "rate1": rate1,
        "rate2": rate2,
        "rate3": rate3,
        "bonus_ref1": f"R$100,00 a R${b1_max:.2f}".replace(".", ","),
        "bonus_ref2": f"R${b2_min:.2f} a R${b2_max:.2f}".replace(".", ","),
        "bonus_ref3": f"ACIMA R${b3_min:.2f}".replace(".", ","),
    }
