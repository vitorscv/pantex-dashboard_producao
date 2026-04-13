from fastapi import Header, HTTPException

from app.database import settings


def verify_api_key(x_api_key: str = Header(...)) -> str:
    if x_api_key != settings.PANTEX_API_KEY:
        raise HTTPException(status_code=401, detail="Chave inválida")
    return x_api_key
