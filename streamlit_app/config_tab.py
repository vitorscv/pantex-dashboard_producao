import datetime

import pandas as pd
import requests
import streamlit as st

MESES_PT = [
    "", "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

COL_MACHINE = "Máquina"
COL_SINCE = "Vigente desde"
COL_R1, COL_R2, COL_R3 = "Meta 1 (pç/dia)", "Meta 2 (pç/dia)", "Meta 3 (pç/dia)"
RATE_COLS = [COL_R1, COL_R2, COL_R3]
COL_SHIFT = "Turno"
COL_ORIGIN = "Origem"
COL_HOURS = "Horas do turno"


def _fmt_date(iso: str | None) -> str:
    if not iso:
        return "padrão"
    year, month, day = iso.split("-")
    return f"{day}/{month}/{year}"


def _fmt_month(iso: str | None) -> str:
    if not iso:
        return "padrão"
    year, month, _ = iso.split("-")
    return f"{month}/{year}"


def _machine_name(machine_id: int) -> str:
    return "Todas" if machine_id == 0 else f"M{machine_id}"


def _bump_version() -> None:
    st.session_state["cfg_version"] = st.session_state.get("cfg_version", 0) + 1


def _get(api_url: str, path: str, **params):
    resp = requests.get(f"{api_url}{path}", params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()


def _send(method: str, url: str, api_key: str, payload: dict | None = None) -> str | None:
    """Devolve None em caso de sucesso ou a mensagem de erro."""
    try:
        resp = requests.request(method, url, json=payload, headers={"X-API-Key": api_key}, timeout=10)
    except requests.RequestException as exc:
        return str(exc)
    if resp.ok:
        return None
    try:
        detail = resp.json().get("detail")
    except ValueError:
        detail = None
    if isinstance(detail, list):
        detail = "; ".join(str(d.get("msg", d)) for d in detail)
    return f"HTTP {resp.status_code}" + (f" — {detail}" if detail else "")


def _same(a, b) -> bool:
    return abs(float(a) - float(b)) < 1e-6


def _flash(message: str) -> None:
    st.session_state["cfg_flash"] = message


# ── Metas por dia ──────────────────────────────────────────────────────────────
def _render_rates(api_url: str, api_key: str, version: int) -> None:
    today = datetime.date.today()
    st.caption(
        "Metas de peças por dia de cada máquina e turno. A alteração vale **a partir do mês escolhido** e "
        "segue valendo nos meses seguintes; meses anteriores não mudam."
    )
    col_year, col_month = st.columns(2)
    year = col_year.selectbox("Ano", [today.year - 1, today.year, today.year + 1], index=1, key="cfg_rates_year")
    month = col_month.selectbox(
        "Vigente a partir de", list(range(1, 13)), index=today.month - 1,
        format_func=lambda m: MESES_PT[m].capitalize(), key="cfg_rates_month",
    )

    try:
        rows = _get(api_url, "/api/config/rates", year=year, month=month)
    except requests.RequestException as exc:
        st.error(f"Não foi possível carregar as metas ({exc}).")
        return

    original = pd.DataFrame([
        {
            COL_MACHINE: f"M{r['machine_id']} · T{r['shift']}",
            COL_SINCE: _fmt_month(r["valid_from"]),
            COL_R1: r["rate1"], COL_R2: r["rate2"], COL_R3: r["rate3"],
        }
        for r in rows
    ])
    edited = st.data_editor(
        original,
        hide_index=True,
        use_container_width=True,
        num_rows="fixed",
        key=f"cfg_rates_editor_{year}_{month}_{version}",
        disabled=[COL_MACHINE, COL_SINCE],
        column_config={c: st.column_config.NumberColumn(min_value=1.0, step=100.0, format="%.2f") for c in RATE_COLS},
    )

    changed = [i for i in range(len(original)) if not all(_same(original.at[i, c], edited.at[i, c]) for c in RATE_COLS)]

    errors: list[str] = []
    for i in changed:
        row = edited.loc[i]
        if row[RATE_COLS].isna().any():
            errors.append(f"{row[COL_MACHINE]}: preencha as três metas.")
        elif not row[COL_R1] <= row[COL_R2] <= row[COL_R3]:
            errors.append(f"{row[COL_MACHINE]}: as metas devem seguir meta 1 ≤ meta 2 ≤ meta 3.")
    for err in errors:
        st.error(f"❌ {err}")

    if changed:
        st.info(
            f"{len(changed)} linha(s) alterada(s): " + ", ".join(edited.at[i, COL_MACHINE] for i in changed)
            + f". Passam a valer a partir de {MESES_PT[month]} de {year}."
        )

    if st.button("💾 Salvar metas", type="primary", use_container_width=True,
                 disabled=not changed or bool(errors), key="cfg_rates_save"):
        saved, failed = [], []
        for i in changed:
            payload = {
                "machine_id": rows[i]["machine_id"], "shift": rows[i]["shift"], "year": year, "month": month,
                "rate1": float(edited.at[i, COL_R1]), "rate2": float(edited.at[i, COL_R2]), "rate3": float(edited.at[i, COL_R3]),
            }
            error = _send("PUT", f"{api_url}/api/config/rates", api_key, payload)
            (failed if error else saved).append(f"{edited.at[i, COL_MACHINE]}" + (f" ({error})" if error else ""))
        for item in failed:
            st.error(f"❌ {item}")
        if saved:
            _bump_version()
            _flash(f"✅ Metas salvas: {', '.join(saved)} — a partir de {MESES_PT[month]} de {year}.")
            if not failed:
                st.rerun()


# ── Horas do turno ─────────────────────────────────────────────────────────────
def _render_hours(api_url: str, api_key: str, version: int) -> None:
    today = datetime.date.today()
    st.caption(
        "Horas produtivas de cada turno (já descontado o almoço). Usadas para converter as paradas em dias. "
        "A alteração vale **a partir da data escolhida**, então uma mudança no meio do mês só afeta os "
        "lançamentos dessa data em diante. **Todas** muda o turno inteiro; uma máquina com valor próprio "
        "mantém o dela."
    )
    on = st.date_input("Vigente a partir de", value=today, key="cfg_hours_date", format="DD/MM/YYYY")

    try:
        rows = _get(api_url, "/api/config/shift-minutes", on=str(on))
    except requests.RequestException as exc:
        st.error(f"Não foi possível carregar as horas dos turnos ({exc}).")
        return

    original = pd.DataFrame([
        {
            COL_SHIFT: f"T{r['shift']}",
            COL_MACHINE: _machine_name(r["machine_id"]),
            COL_ORIGIN: ("próprio" if r["source"] == "maquina" else "do turno") + (f" · desde {_fmt_date(r['valid_from'])}" if r["valid_from"] else " · padrão"),
            COL_HOURS: round(r["minutes"] / 60, 2),
        }
        for r in rows
    ])
    edited = st.data_editor(
        original,
        hide_index=True,
        use_container_width=True,
        num_rows="fixed",
        key=f"cfg_hours_editor_{on}_{version}",
        disabled=[COL_SHIFT, COL_MACHINE, COL_ORIGIN],
        column_config={COL_HOURS: st.column_config.NumberColumn(min_value=0.5, max_value=24.0, step=0.25, format="%.2f h",
                                                                 help="Ex.: 8,75 h = 525 min; 3,25 h = 195 min")},
    )

    changed = [
        i for i in range(len(original))
        if pd.isna(edited.at[i, COL_HOURS]) or round(edited.at[i, COL_HOURS] * 60) != round(original.at[i, COL_HOURS] * 60)
    ]
    errors = [
        f"T{rows[i]['shift']} {_machine_name(rows[i]['machine_id'])}: informe as horas do turno."
        for i in changed if pd.isna(edited.at[i, COL_HOURS])
    ]
    for err in errors:
        st.error(f"❌ {err}")

    if changed and not errors:
        st.info(
            f"{len(changed)} linha(s) alterada(s): "
            + ", ".join(f"T{rows[i]['shift']} {_machine_name(rows[i]['machine_id'])}" for i in changed)
            + f". Passam a valer a partir de {on.strftime('%d/%m/%Y')}."
        )

    if st.button("💾 Salvar horas", type="primary", use_container_width=True,
                 disabled=not changed or bool(errors), key="cfg_hours_save"):
        saved, failed = [], []
        for i in changed:
            label = f"T{rows[i]['shift']} {_machine_name(rows[i]['machine_id'])}"
            payload = {
                "shift": rows[i]["shift"], "machine_id": rows[i]["machine_id"],
                "valid_from": str(on), "minutes": int(round(edited.at[i, COL_HOURS] * 60)),
            }
            error = _send("PUT", f"{api_url}/api/config/shift-minutes", api_key, payload)
            (failed if error else saved).append(label + (f" ({error})" if error else ""))
        for item in failed:
            st.error(f"❌ {item}")
        if saved:
            _bump_version()
            _flash(f"✅ Horas salvas: {', '.join(saved)} — a partir de {on.strftime('%d/%m/%Y')}.")
            if not failed:
                st.rerun()


# ── Histórico ──────────────────────────────────────────────────────────────────
def _render_history(api_url: str, api_key: str) -> None:
    with st.expander("Alterações cadastradas"):
        try:
            history = _get(api_url, "/api/config/history")
        except requests.RequestException as exc:
            st.caption(f"Não foi possível carregar o histórico ({exc}).")
            return

        options: dict[str, tuple[str, str]] = {}
        for h in history["rates"]:
            options[f"Meta · M{h['machine_id']} T{h['shift']} · desde {_fmt_month(h['valid_from'])} "
                    f"({h['rate1']:.0f} / {h['rate2']:.0f} / {h['rate3']:.0f})"] = (
                "DELETE", f"/api/config/rates/{h['machine_id']}/{h['shift']}/{int(h['valid_from'][:4])}/{int(h['valid_from'][5:7])}")
        for h in history["shift_minutes"]:
            options[f"Horas · T{h['shift']} {_machine_name(h['machine_id'])} · desde {_fmt_date(h['valid_from'])} "
                    f"({h['minutes'] / 60:.2f} h)"] = (
                "DELETE", f"/api/config/shift-minutes/{h['shift']}/{h['machine_id']}/{h['valid_from']}")

        if not options:
            st.caption("Nenhuma alteração cadastrada: todas as máquinas usam o padrão.")
            return

        st.dataframe(pd.DataFrame({"Alteração": list(options)}), use_container_width=True, hide_index=True)
        choice = st.selectbox("Remover uma alteração", list(options), index=None, placeholder="Escolha...", key="cfg_del_choice")
        if choice and st.button("Remover alteração", key="cfg_del_btn"):
            method, path = options[choice]
            error = _send(method, f"{api_url}{path}", api_key)
            if error:
                st.error(f"❌ Não foi possível remover ({error}).")
            else:
                _bump_version()
                _flash(f"✅ Removido: {choice}")
                st.rerun()


def render(api_url: str, api_key: str) -> None:
    version = st.session_state.get("cfg_version", 0)

    st.markdown("#### Metas e horas do turno")
    flash = st.session_state.pop("cfg_flash", None)
    if flash:
        st.success(flash)

    tab_rates, tab_hours = st.tabs(["Metas (pç/dia)", "Horas do turno"])
    with tab_rates:
        _render_rates(api_url, api_key, version)
    with tab_hours:
        _render_hours(api_url, api_key, version)

    _render_history(api_url, api_key)
