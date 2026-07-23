import calendar
from datetime import date

from workalendar.america.brazil import BrazilBahia


_cal = BrazilBahia()


def get_business_days(year: int, month: int) -> int:
    if month == 6:
        return 17  # Recesso junino (São João)
    _, last_day = calendar.monthrange(year, month)
    count: int = 0
    for day in range(1, last_day + 1):
        d = date(year, month, day)
        if _cal.is_working_day(d):
            count += 1
    return count
