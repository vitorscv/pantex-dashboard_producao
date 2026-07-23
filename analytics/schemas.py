from pydantic import BaseModel


class StatMeta(BaseModel):
    id: str
    title: str
    description: str


class QualityStat(BaseModel):
    year: int
    month: int
    total_produced: int
    total_repair: int
    total_second_quality: int
    total_non_conforme: int
    pct_repair: float
    pct_second_quality: float
    pct_non_conforme: float


class MachineQuality(BaseModel):
    machine_id: int
    label: str
    total_produced: int
    total_repair: int
    total_second_quality: int
    total_non_conforme: int
    pct_non_conforme: float


class QualityByMachineStat(BaseModel):
    year: int
    month: int
    machines: list[MachineQuality]


class QualityMonthPoint(BaseModel):
    year: int
    month: int
    total_produced: int
    pct_non_conforme: float


class QualityTrendStat(BaseModel):
    months: list[QualityMonthPoint]


class QualityComparisonStat(BaseModel):
    current: QualityStat
    previous: QualityStat
    delta_pct_non_conforme: float
