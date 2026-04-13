import datetime

import pandas as pd
import requests
import streamlit as st

st.set_page_config(
    page_title="Pantex · Produção",
    page_icon="🏭",
    layout="centered",
)

api_url: str = st.secrets["api_url"]
api_key: str = st.secrets["api_key"]

# --- Data formatada em português ---
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

# --- Header ---
st.title("🏭 Lançamento de Produção")
st.caption(data_extenso)
st.divider()

# --- Turno ---
if "turno" not in st.session_state:
    st.session_state.turno = 1

st.subheader("Turno")
col_t1, col_t2 = st.columns(2)

with col_t1:
    if st.button(
        "1º Turno",
        use_container_width=True,
        type="primary" if st.session_state.turno == 1 else "secondary",
    ):
        st.session_state.turno = 1
        st.rerun()

with col_t2:
    if st.button(
        "2º Turno",
        use_container_width=True,
        type="primary" if st.session_state.turno == 2 else "secondary",
    ):
        st.session_state.turno = 2
        st.rerun()

st.caption(f"Turno selecionado: **{st.session_state.turno}º Turno**")
st.divider()

# --- Data do lançamento ---
entry_date = st.date_input("Data do lançamento", value=today)
st.divider()

# --- Produção por máquina ---
st.subheader("Produção por máquina")

_default = pd.DataFrame({
    "Máquina": [f"Máquina {i}" for i in range(1, 7)],
    "Quantidade": [0] * 6,
})

edited = st.data_editor(
    _default,
    column_config={
        "Máquina": st.column_config.TextColumn(disabled=True, width="medium"),
        "Quantidade": st.column_config.NumberColumn(
            min_value=0,
            step=1,
            format="%d",
            width="medium",
        ),
    },
    hide_index=True,
    use_container_width=True,
    key="tabela_producao",
)

quantities: dict[int, int] = {
    i + 1: int(row["Quantidade"])
    for i, row in edited.iterrows()
}

st.divider()

# --- Botão de lançamento ---
if st.button("Lançar Produção", type="primary", use_container_width=True):
    entries_to_send = {mid: qty for mid, qty in quantities.items() if qty > 0}

    if not entries_to_send:
        st.warning("Informe a produção de ao menos uma máquina.")
    else:
        headers = {"X-API-Key": api_key}
        errors: list[str] = []
        successes: list[str] = []

        for machine_id, quantity in entries_to_send.items():
            payload = {
                "entry_date": entry_date.isoformat(),
                "machine_id": machine_id,
                "shift": st.session_state.turno,
                "quantity": quantity,
            }
            try:
                resp = requests.post(
                    f"{api_url}/api/entries",
                    json=payload,
                    headers=headers,
                    timeout=10,
                )
                if resp.ok:
                    successes.append(f"Máquina {machine_id}: {quantity} unid.")
                else:
                    errors.append(f"Máquina {machine_id}: HTTP {resp.status_code}")
            except requests.RequestException as exc:
                errors.append(f"Máquina {machine_id}: {exc}")

        if successes and not errors:
            resumo = " | ".join(successes)
            st.success(
                f"✅ Lançamento registrado — {st.session_state.turno}º Turno · "
                f"{entry_date.strftime('%d/%m/%Y')}\n\n{resumo}"
            )
        elif errors:
            if successes:
                st.warning("Lançamento parcial. Sucessos: " + " | ".join(successes))
            for err in errors:
                st.error(f"❌ Falha ao lançar {err}")
