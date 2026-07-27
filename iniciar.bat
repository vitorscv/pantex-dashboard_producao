@echo off
cd /d "%~dp0"
echo Iniciando Pantex Dashboard (API)...
start "Pantex API" python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

echo Aguardando API iniciar...
timeout /t 3 /nobreak >nul

echo Iniciando Pantex Lancamento (Streamlit)...
start "Pantex Streamlit" python -m streamlit run streamlit_app/app.py --server.port 8501

echo Abrindo navegadores...
timeout /t 4 /nobreak >nul
start "" "http://localhost:8000/tv"
start "" "http://localhost:8000/analytics-view"
start "" "http://localhost:8501"
