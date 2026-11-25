import calendar
from datetime import date, timedelta

from workalendar.america.brazil import BrazilBahia


_cal = BrazilBahia()


def _is_working_day(d: date) -> bool:
    # Consciência Negra: feriado nacional desde 2024, ausente nesta versão do workalendar
    if d.month == 11 and d.day == 20 and d.year >= 2024:
        return False
    return _cal.is_working_day(d)


def count_business_days(start: date, end: date) -> int:
    """Dias úteis em [start, end), sem o ajuste do recesso junino."""
    return sum(
        1 for n in range((end - start).days) if _is_working_day(start + timedelta(days=n))
    )


def get_business_days(year: int, month: int) -> int:
    if month == 6:
        return 17  # Recesso junino (São João)
    _, last_day = calendar.monthrange(year, month)
    count: int = 0
    for day in range(1, last_day + 1):
        d = date(year, month, day)
        if _is_working_day(d):
            count += 1
    return count
