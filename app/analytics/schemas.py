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
    total_repair: int
    total_second_quality: int
    total_non_conforme: int
    pct_repair: float
    pct_second_quality: float
    pct_non_conforme: float


class QualityTrendStat(BaseModel):
    months: list[QualityMonthPoint]


class QualityComparisonStat(BaseModel):
    current: QualityStat
    previous: QualityStat
    delta_pct_non_conforme: float


class QualityDayPoint(BaseModel):
    day: int
    total_produced: int
    total_repair: int
    total_second_quality: int
    total_non_conforme: int
    pct_non_conforme: float
    pct_conforme: float


class QualityDailyStat(BaseModel):
    year: int
    month: int
    days: list[QualityDayPoint]



class DowntimeCauseMinutes(BaseModel):
    code: int
    minutes: int


class DowntimeCauseTotal(BaseModel):
    code: int  # 0 = sem causa informada (lançamentos antigos)
    name: str
    minutes: int
    pct: float
    affects_bonus: bool  # causas 1 a 4 (e o legado sem causa) descontam meta/bonificação
    shift1_minutes: int
    shift2_minutes: int
    prev_minutes: int  # mesmo código no mês anterior
    delta_minutes: int


class DowntimeBucket(BaseModel):
    key: int  # machine_id (em machines) ou dia do mês (em days)
    total_minutes: int
    causes: list[DowntimeCauseMinutes]


class DowntimeStat(BaseModel):
    year: int
    month: int
    has_causes: bool  # há ao menos uma parada com causa informada
    total_minutes: int
    classified_minutes: int
    unclassified_minutes: int
    bonus_minutes: int  # paradas que descontam meta/bonificação (mesma regra do resumo da TV)
    prev_total_minutes: int
    causes: list[DowntimeCauseTotal]
    machines: list[DowntimeBucket]
    days: list[DowntimeBucket]
