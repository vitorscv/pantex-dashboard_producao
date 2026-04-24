# Pantex Dashboard Produção

Sistema de acompanhamento de produção industrial da Pantex. Registra entradas diárias por máquina e turno, calcula metas, bonificações e oferece dashboards em tempo real.

---

## Visão Geral

- **6 máquinas** × **2 turnos** por dia
- Registro de quantidade produzida, reparos e segunda qualidade
- Cálculo automático de metas com sistema de bonificação em 3 níveis
- Calendário de dias úteis integrado (feriados Brasil-Bahia)
- Dashboard TV para exibição em chão de fábrica
- Relatório mensal exportável em Excel

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | FastAPI + Uvicorn |
| Banco de dados | PostgreSQL (psycopg2) |
| Agendamento | APScheduler |
| Calendário | Workalendar (Brasil-Bahia) |
| Frontend | Streamlit |
| Validação | Pydantic |

---

## Estrutura do Projeto

```
pantex-dashboard_producao/
├── app/                        # Backend FastAPI
│   ├── main.py                 # Entry point, lifespan, rotas
│   ├── database.py             # Pool de conexões, settings
│   ├── auth.py                 # Verificação de API key
│   ├── schemas.py              # Modelos Pydantic
│   ├── routers/
│   │   ├── entries.py          # CRUD de entradas de produção
│   │   └── summary.py          # Resumo do dashboard
│   ├── services/
│   │   ├── bonus.py            # Cálculo de bonificação
│   │   ├── calendar_svc.py     # Contagem de dias úteis
│   │   └── scheduler.py        # Jobs agendados
│   └── static/
│       └── index.html          # Dashboard TV
├── streamlit_app/
│   ├── app.py                  # Interface Streamlit
│   └── .streamlit/secrets.toml
├── sql/
│   ├── 01_create_tables.sql
│   └── 02_seed_machine_config.sql
├── setup.py                    # Inicialização do banco
├── requirements.txt
└── .env.example
```

---

## Configuração

### Pré-requisitos

- Python 3.10+
- PostgreSQL

### Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha:

```env
DATABASE_URL=postgresql://usuario:senha@localhost:5432/Pantex_Dashboard_Producao
PANTEX_API_KEY=sua_chave_aqui
ENVIRONMENT=development
```

Configure também o Streamlit em `streamlit_app/.streamlit/secrets.toml`:

```toml
api_url = "http://localhost:8000"
api_key = "sua_chave_aqui"
```

### Instalação

```bash
pip install -r requirements.txt
python setup.py          # cria tabelas e seeds no banco
```

---

## Rodando

**Backend:**

```bash
uvicorn app.main:app --reload
# http://localhost:8000
```

**Frontend:**

```bash
cd streamlit_app
streamlit run app.py
# http://localhost:8501
```

---

## API

A autenticação é feita via header `X-API-Key`.

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Status da aplicação |
| `POST` | `/api/entries` | Criar/atualizar entrada de produção |
| `GET` | `/api/entries/{year}/{month}` | Listar entradas do mês |
| `GET` | `/api/summary` | Resumo do dashboard (mês atual) |
| `GET` | `/tv` | Dashboard para TV |

---

## Sistema de Bonificação

A bonificação é calculada por excedente de produção em relação a três níveis de meta:

| Nível | Condição | Resultado |
|---|---|---|
| 0 | Abaixo de meta 1 | Sem bônus |
| 1 | Entre meta 1 e meta 2 | Bônus com multiplicador 1 |
| 2 | Entre meta 2 e meta 3 | Bônus com multiplicador 2 |
| 3 | Acima de meta 3 | Bônus com multiplicador 3 |

As taxas e multiplicadores são configurados por máquina na tabela `machine_config`.

---

## Agendamento

O serviço APScheduler popula automaticamente o calendário de dias úteis no primeiro dia de cada mês às 00h05, levando em conta feriados nacionais e estaduais da Bahia.
