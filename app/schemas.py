from datetime import date, time
from typing import Optional

from pydantic import BaseModel, Field


class ProductionEntry(BaseModel):
    entry_date: date
    machine_id: int = Field(..., ge=1, le=7)
    shift: int = Field(..., ge=1, le=2)
    quantity: int = Field(..., ge=0)
    repair_qty: int = Field(0, ge=0)
    second_quality_qty: int = Field(0, ge=0)
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    downtime_minutes: int = Field(0, ge=0)
    obs: Optional[str] = None
    boca_aberta: bool = False


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
    rate1: int
    rate2: int
    rate3: int
    bonus_ref1: str
    bonus_ref2: str
    bonus_ref3: str
    pct_meta1: float
    repair_qty: int = 0
    second_quality_qty: int = 0
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    last_qty: int = 0
    total_downtime: int = 0
    mult1: float = 0.0
    mult2: float = 0.0
    mult3: float = 0.0
    ba_days: int = 0
    rate1_ba: int = 0


class DashboardSummary(BaseModel):
    month: str
    business_days: int
    machines: list[MachineStatus]
    grand_total: int
    grand_meta1: int
    grand_meta2: int
    grand_meta3: int
    days_recorded: int = 0
    nsm_pct: Optional[float] = None
