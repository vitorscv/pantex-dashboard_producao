import calendar
import datetime
import io
from datetime import timedelta

import pandas as pd
import requests
import streamlit as st

st.set_page_config(
    page_title="Pantex · Produção",
    page_icon="🏭",
    layout="wide",
)

api_url: str = st.secrets["api_url"]
api_key: str = st.secrets["api_key"]

# ── CSS ────────────────────────────────────────────────────────────────────────
st.markdown("""
<style>
html, body, [class*="css"] {
    font-family: system-ui, -apple-system, sans-serif;
    background-color: #0b0c14 !important;
    color: #c2c0b6;
}
.block-container { padding-top: 1.25rem !important; max-width: 100% !important; }

label[data-testid="stWidgetLabel"] p {
    color: #1D9E75 !important;
    font-weight: 600;
    font-size: 0.83rem;
    letter-spacing: 0.03em;
}

input[type="number"], input[type="text"] {
    background-color: #0b0c14 !important;
    color: #e0ddd6 !important;
    border: none !important;
    border-radius: 6px !important;
}

[data-testid="stHorizontalBlock"] > [data-testid="stVerticalBlockBorderWrapper"] > div,
[data-testid="stHorizontalBlock"] > div > [data-testid="stVerticalBlock"] {
    background: transparent !important;
    border: none !important;
    border-radius: 0 !important;
    padding: 0 .5rem !important;
}

div[data-testid="stButton"] button[kind="primary"] {
    background-color: #1D9E75 !important;
    border: none !important;
    color: #ffffff !important;
    font-weight: 700 !important;
    font-size: 1rem !important;
    border-radius: 8px !important;
    letter-spacing: 0.04em;
}
div[data-testid="stButton"] button[kind="primary"]:hover {
    background-color: #178763 !important;
}

[data-testid="stDateInput"] input {
    background-color: #0f1020 !important;
    color: #e0ddd6 !important;
    border: none !important;
    border-radius: 6px !important;
}

[data-testid="stDataFrame"] { border: none; }
hr { border-color: #1e2040 !important; }
</style>
""", unsafe_allow_html=True)

# ── Helpers ────────────────────────────────────────────────────────────────────
DIAS_PT = [
    "Segunda-feira", "Terça-feira", "Quarta-feira",
    "Quinta-feira", "Sexta-feira", "Sábado", "Domingo",
]
MESES_PT = [
    "", "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

today = datetime.date.today()
data_extenso = (
    f"{DIAS_PT[today.weekday()]}, "
    f"{today.day} de {MESES_PT[today.month]} de {today.year}"
)


def parse_qty(raw: str, label: str) -> tuple[int, str | None]:
    v = raw.strip()
    if not v:
        return 0, None
    if not v.isdigit():
        return 0, f"{label}: valor inválido '{v}'"
    return int(v), None


def fmt_horas(start_t, end_t) -> str:
    if start_t is None or end_t is None:
        return "–"
    dummy = datetime.date(2000, 1, 1)
    dt_start = datetime.datetime.combine(dummy, start_t)
    dt_end   = datetime.datetime.combine(dummy, end_t)
    if dt_end < dt_start:
        dt_end += timedelta(days=1)
    total_min = int((dt_end - dt_start).total_seconds() // 60)
    h, m = divmod(total_min, 60)
    if h and m:
        return f"{h}h {m}min"
    return f"{h}h" if h else f"{m}min"


def time_from_str(s: str | None):
    if not s:
        return None
    try:
        parts = s.split(":")
        return datetime.time(int(parts[0]), int(parts[1]))
    except Exception:
        return None


# ── Header ─────────────────────────────────────────────────────────────────────
st.markdown(f"""
<div style="margin-bottom:1.25rem;">
  <span style="background:rgba(29,158,117,.15);color:#1D9E75;font-size:.62rem;font-weight:700;
               letter-spacing:.18em;padding:.22rem .65rem;border-radius:4px;
               border:1px solid rgba(29,158,117,.3);">PANTEX</span>
  <h1 style="color:#ffffff;font-size:1.7rem;font-weight:700;margin:.45rem 0 .1rem;line-height:1.2;">
    Lançamento de Produção
  </h1>
  <p style="color:#6b6a72;font-size:.88rem;margin:0;">{data_extenso}</p>
</div>
""", unsafe_allow_html=True)

# ── Data do lançamento ─────────────────────────────────────────────────────────
entry_date = st.date_input(
    "Data do lançamento",
    value=today - timedelta(days=1),
)
st.divider()

# ── Dados por (machine_id, shift) ──────────────────────────────────────────────
# raw_values[(mid, shift)]    → str (quantidade)
# raw_quality[(mid, shift)]   → (reparo_str, segunda_str)
# time_values[(mid, shift)]   → (start_time | None, end_time | None)
raw_values:      dict[tuple[int, int], str]                                           = {}
raw_quality:     dict[tuple[int, int], tuple[str, str]]                              = {}
time_values:     dict[tuple[int, int], tuple[datetime.time | None, datetime.time | None]] = {}
downtime_values: dict[tuple[int, int], tuple[str, str]]                              = {}
ba_values:       dict[tuple[int, int], bool]                                         = {}

BA_MACHINES = {6, 7}

COL_HDR = (
    "font-size:.72rem;font-weight:700;letter-spacing:.06em;"
    "padding-bottom:.1rem;display:block;"
)

col_t1, col_t2 = st.columns(2)

for col, shift, label in [(col_t1, 1, "1º TURNO"), (col_t2, 2, "2º TURNO")]:
    with col:
        st.markdown(
            f"<p style='color:#ffffff;font-size:1rem;font-weight:700;"
            f"letter-spacing:.06em;margin-bottom:.5rem;'>{label}</p>",
            unsafe_allow_html=True,
        )

        # ── Cabeçalho das colunas ───────────────────────────────────────────
        hc = st.columns([0.6, 1.2, 0.8, 0.8, 1.2, 1.2, 0.7, 2.0, 0.5])
        hc[0].markdown(f"<span style='{COL_HDR}color:transparent;'>—</span>", unsafe_allow_html=True)
        hc[1].markdown(f"<span style='{COL_HDR}color:#1D9E75;'>QTD</span>", unsafe_allow_html=True)
        for txt, col in [("REP", hc[2]), ("2ªQ", hc[3]), ("INÍCIO", hc[4]), ("FIM", hc[5])]:
            col.markdown(
                f"<span style='{COL_HDR}color:#EF9F27;'>{txt}</span>",
                unsafe_allow_html=True,
            )
        hc[6].markdown(f"<span style='{COL_HDR}color:#e05252;'>PARADA</span>", unsafe_allow_html=True)
        hc[7].markdown(f"<span style='{COL_HDR}color:#e05252;'>OBSERVAÇÃO</span>", unsafe_allow_html=True)
        hc[8].markdown(f"<span style='{COL_HDR}color:#a78bfa;'>BA</span>", unsafe_allow_html=True)

        # ── Linha por máquina ───────────────────────────────────────────────
        for i in range(1, 8):
            c_lbl, c0, c1, c2, c3, c4, c5, c6, c7 = st.columns([0.6, 1.2, 0.8, 0.8, 1.2, 1.2, 0.7, 2.0, 0.5])

            c_lbl.markdown(
                f"<p style='color:#6b6a72;font-size:.75rem;font-weight:600;"
                f"margin:0;padding-top:.45rem;'>M{i}</p>",
                unsafe_allow_html=True,
            )

            with c0:
                raw_values[(i, shift)] = st.text_input(
                    f"qty_{shift}_{i}",
                    value="",
                    placeholder="0",
                    key=f"t{shift}_m{i}",
                    label_visibility="collapsed",
                )
            with c1:
                rep = st.text_input(
                    f"rep_{shift}_{i}",
                    value="",
                    placeholder="0",
                    key=f"t{shift}_m{i}_rep",
                    label_visibility="collapsed",
                )
            with c2:
                seg = st.text_input(
                    f"seg_{shift}_{i}",
                    value="",
                    placeholder="0",
                    key=f"t{shift}_m{i}_seg",
                    label_visibility="collapsed",
                )
            with c3:
                ini = st.time_input(
                    f"ini_{shift}_{i}",
                    value=None,
                    key=f"t{shift}_m{i}_ini",
                    label_visibility="collapsed",
                )
            with c4:
                fim = st.time_input(
                    f"fim_{shift}_{i}",
                    value=None,
                    key=f"t{shift}_m{i}_fim",
                    label_visibility="collapsed",
                )

            with c5:
                parada = st.text_input(
                    f"par_{shift}_{i}",
                    value="",
                    placeholder="min",
                    key=f"t{shift}_m{i}_par",
                    label_visibility="collapsed",
                )
            with c6:
                obs_txt = st.text_input(
                    f"obs_{shift}_{i}",
                    value="",
                    placeholder="Motivo da parada",
                    key=f"t{shift}_m{i}_obs",
                    label_visibility="collapsed",
                )

            with c7:
                if i in BA_MACHINES:
                    ba_values[(i, shift)] = st.checkbox(
                        f"ba_{shift}_{i}",
                        value=False,
                        key=f"t{shift}_m{i}_ba",
                        label_visibility="collapsed",
                    )
                else:
                    ba_values[(i, shift)] = False

            raw_quality[(i, shift)] = (rep, seg)
            time_values[(i, shift)] = (ini, fim)
            downtime_values[(i, shift)] = (parada, obs_txt)

        # ── Total do turno ──────────────────────────────────────────────────
        total: int = sum(
            parse_qty(raw_values[(i, shift)], f"M{i}")[0] for i in range(1, 8)
        )
        st.markdown(
            f"<div style='margin-top:.75rem;padding:.55rem 1rem;"
            f"background:rgba(29,158,117,.1);border:1px solid #1D9E75;"
            f"border-radius:8px;color:#1D9E75;font-weight:700;font-size:.95rem;'>"
            f"Total T{shift}: {total:,}</div>",
            unsafe_allow_html=True,
        )

# ── Validação ──────────────────────────────────────────────────────────────────
validation_errors: list[str] = []
quantities: dict[tuple[int, int], int] = {}

for (mid, shift), raw in raw_values.items():
    val, err = parse_qty(raw, f"Máquina {mid} T{shift}")
    quantities[(mid, shift)] = val
    if err:
        validation_errors.append(err)

for (mid, shift), (r_raw, s_raw) in raw_quality.items():
    _, err_r = parse_qty(r_raw, f"Reparo M{mid} T{shift}")
    _, err_s = parse_qty(s_raw, f"2ªQ M{mid} T{shift}")
    if err_r:
        validation_errors.append(err_r)
    if err_s:
        validation_errors.append(err_s)

for err in validation_errors:
    st.error(f"❌ {err}")

st.divider()

# ── Botão de lançamento ────────────────────────────────────────────────────────
if st.button("⚡ Lançar Produção", type="primary", use_container_width=True):
    if validation_errors:
        st.error("Corrija os campos inválidos antes de lançar.")
    else:
        entries_to_send = {
            (mid, shift): qty
            for (mid, shift), qty in quantities.items()
            if qty > 0 or bool(downtime_values.get((mid, shift), ("", ""))[1].strip())
        }

        if not entries_to_send:
            st.warning("Informe a produção de ao menos uma máquina e turno.")
        else:
            headers = {"X-API-Key": api_key}
            errors:    list[str] = []
            successes: list[str] = []

            for (machine_id, shift), quantity in entries_to_send.items():
                r_raw, s_raw = raw_quality[(machine_id, shift)]
                repair_qty = int(r_raw.strip()) if r_raw.strip().isdigit() else 0
                second_qty = int(s_raw.strip()) if s_raw.strip().isdigit() else 0
                h_ini, h_fim = time_values[(machine_id, shift)]

                par_raw, obs_raw = downtime_values.get((machine_id, shift), ("", ""))
                par_min = int(par_raw.strip()) if par_raw.strip().isdigit() else 0

                payload = {
                    "entry_date":          str(entry_date),
                    "machine_id":          machine_id,
                    "shift":               shift,
                    "quantity":            quantity,
                    "repair_qty":          repair_qty,
                    "second_quality_qty":  second_qty,
                    "start_time":          str(h_ini) if h_ini else None,
                    "end_time":            str(h_fim) if h_fim else None,
                    "downtime_minutes":    par_min,
                    "obs":                 obs_raw.strip() or None,
                    "boca_aberta":         ba_values.get((machine_id, shift), False),
                }
                try:
                    resp = requests.post(
                        f"{api_url}/api/entries",
                        json=payload,
                        headers=headers,
                        timeout=10,
                    )
                    if resp.ok:
                        successes.append(f"Maq.{machine_id} T{shift}: {quantity:,}")
                    else:
                        errors.append(f"Maq.{machine_id} T{shift}: HTTP {resp.status_code}")
                except requests.RequestException as exc:
                    errors.append(f"Maq.{machine_id} T{shift}: {exc}")

            if successes and not errors:
                st.success(
                    f"✅ {len(successes)} lançamento(s) — {entry_date.strftime('%d/%m/%Y')}\n\n"
                    + "  |  ".join(successes)
                )
            else:
                if successes:
                    st.warning("Parcial: " + "  |  ".join(successes))
                for err in errors:
                    st.error(f"❌ {err}")

st.divider()

# ── Tabela do mês ──────────────────────────────────────────────────────────────
if "view_year" not in st.session_state:
    st.session_state.view_year = today.year
if "view_month" not in st.session_state:
    st.session_state.view_month = today.month

def _prev_month() -> None:
    if st.session_state.view_month == 1:
        st.session_state.view_month = 12
        st.session_state.view_year -= 1
    else:
        st.session_state.view_month -= 1

def _next_month() -> None:
    if st.session_state.view_month == 12:
        st.session_state.view_month = 1
        st.session_state.view_year += 1
    else:
        st.session_state.view_month += 1

year, month = st.session_state.view_year, st.session_state.view_month
is_current = (year == today.year and month == today.month)

nav_left, nav_title, nav_right, nav_reset = st.columns([1, 6, 1, 2])
with nav_left:
    st.button("◀", on_click=_prev_month, use_container_width=True, key="btn_prev")
with nav_title:
    st.markdown(
        f"<p style='color:#ffffff;font-size:1rem;font-weight:700;"
        f"letter-spacing:.06em;margin-bottom:.5rem;text-align:center;'>"
        f"LANÇAMENTOS — {MESES_PT[month].upper()} {year}</p>",
        unsafe_allow_html=True,
    )
with nav_right:
    st.button("▶", on_click=_next_month, use_container_width=True, key="btn_next",
              disabled=is_current)
with nav_reset:
    if not is_current:
        if st.button("Mês atual", use_container_width=True, key="btn_reset"):
            st.session_state.view_year = today.year
            st.session_state.view_month = today.month
            st.rerun()

_, last_day = calendar.monthrange(year, month)

try:
    resp_m = requests.get(f"{api_url}/api/entries/{year}/{month}", timeout=10)
    entries = resp_m.json() if resp_m.ok else []
except Exception:
    entries = []
    st.caption("Não foi possível carregar os lançamentos do mês.")

# Monta mapa {(dia, machine_id, shift): entry_dict}
data_map: dict[tuple[int, int, int], dict] = {}
for e in entries:
    day = int(str(e["entry_date"]).split("-")[2])
    data_map[(day, int(e["machine_id"]), int(e["shift"]))] = e

# Constrói DataFrame
rows = []
for day in range(1, last_day + 1):
    row: dict[str, object] = {"DATA": f"{day:02d}/{month:02d}"}
    tot_t1 = tot_t2 = rep_t1 = rep_t2 = seg_t1 = seg_t2 = 0

    for m in range(1, 8):
        e1 = data_map.get((day, m, 1)) or {}
        e2 = data_map.get((day, m, 2)) or {}
        v1 = int(e1.get("quantity") or 0)
        v2 = int(e2.get("quantity") or 0)
        row[f"M{m} T1"] = v1
        row[f"M{m} T2"] = v2
        tot_t1 += v1
        tot_t2 += v2
        rep_t1 += int(e1.get("repair_qty") or 0)
        rep_t2 += int(e2.get("repair_qty") or 0)
        seg_t1 += int(e1.get("second_quality_qty") or 0)
        seg_t2 += int(e2.get("second_quality_qty") or 0)

    row["TOT T1"]  = tot_t1
    row["TOT T2"]  = tot_t2
    row["REP T1"]  = rep_t1
    row["2ªQ T1"]  = seg_t1
    row["REP T2"]  = rep_t2
    row["2ªQ T2"]  = seg_t2
    rows.append(row)

df = pd.DataFrame(rows)

totals: dict[str, object] = {"DATA": "TOTAL"}
for c in df.columns[1:]:
    totals[c] = int(df[c].sum())  # type: ignore[arg-type]
df_final = pd.concat([df, pd.DataFrame([totals])], ignore_index=True)

_buf = io.BytesIO()
df_final.to_excel(_buf, index=False, engine="openpyxl")
_buf.seek(0)
st.download_button(
    label="Exportar Excel",
    icon="📥",
    data=_buf,
    file_name=f"producao_{month:02d}_{year}.xlsx",
    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
)

st.dataframe(df_final, use_container_width=True, hide_index=True)
