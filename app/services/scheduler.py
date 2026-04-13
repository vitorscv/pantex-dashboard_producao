from datetime import date

from apscheduler.schedulers.background import BackgroundScheduler

from app.database import get_db
from app.services.calendar_svc import get_business_days


def populate_calendar() -> None:
    today = date.today()
    year: int = today.year
    month: int = today.month
    business_days: int = get_business_days(year, month)

    with get_db() as cursor:
        cursor.execute(
            """
            INSERT INTO biz_calendar (year, month, business_days)
            VALUES (%s, %s, %s)
            ON CONFLICT (year, month) DO UPDATE
                SET business_days = EXCLUDED.business_days
            """,
            (year, month, business_days),
        )


def start_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler()

    scheduler.add_job(
        func=populate_calendar,
        trigger="cron",
        day=1,
        hour=0,
        minute=5,
    )

    populate_calendar()
    scheduler.start()

    return scheduler
