from datetime import date, time
from typing import Optional

from pydantic import BaseModel, Field


class ProductionEntry(BaseModel):
    entry_date: date
    machine_id: int = Field(..., ge=1, le=6)
    shift: int = Field(..., ge=1, le=2)
    quantity: int = Field(..., ge=0)
    repair_qty: int = Field(0, ge=0)
    second_quality_qty: int = Field(0, ge=0)
    start_time: Optional[time] = None
    end_time: Optional[time] = None


class MachineStatus(BaseModel):
    machine_id: int
    shift: int
    label: str
    total_produced: int
    meta1: int
    meta2: int
    meta3: int
    saldo: int
    bonus_tier: int = Field(..., ge=0, le=3)
    bonus_value: float
    pct_meta1: float
    repair_qty: int = 0
    second_quality_qty: int = 0
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class DashboardSummary(BaseModel):
    month: str
    business_days: int
    machines: list[MachineStatus]
    grand_total: int
    nsm_pct: Optional[float] = None
