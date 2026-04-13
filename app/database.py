from contextlib import contextmanager
from typing import Generator

import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    PANTEX_API_KEY: str
    ENVIRONMENT: str = "development"

    class Config:
        env_file = ".env"


settings = Settings()

_pool: SimpleConnectionPool = SimpleConnectionPool(
    minconn=1,
    maxconn=5,
    dsn=settings.DATABASE_URL,
    options="-c lc_messages=C",
)


@contextmanager
def get_db() -> Generator[RealDictCursor, None, None]:
    conn = _pool.getconn()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        yield cursor
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        _pool.putconn(conn)
