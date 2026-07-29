"""
Configuração inicial do banco de dados Pantex.

Uso:
    py setup.py

Requer:
    - .env com DATABASE_URL=postgresql://...
    - psycopg2-binary e python-dotenv instalados
"""

import os
import sys
from pathlib import Path

#Dependências
try:
    import psycopg2
except ImportError:
    print("[ERRO] psycopg2-binary não encontrado. Execute: pip install psycopg2-binary")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    print("[ERRO] python-dotenv não encontrado. Execute: pip install python-dotenv")
    sys.exit(1)

#Configuração
BASE_DIR = Path(__file__).parent
SQL_DIR  = BASE_DIR / "sql"

SQL_FILES = [
    SQL_DIR / "01_create_tables.sql",
    SQL_DIR / "02_seed_machine_config.sql",
]

#Helpers
def ok(msg: str)  -> None: print(f"  [OK]  {msg}")
def err(msg: str) -> None: print(f"  [ERRO] {msg}")
def sep()         -> None: print("-" * 60)


def run_sql_file(cur, path: Path) -> bool:
    """Executa um arquivo SQL. Retorna True se bem-sucedido."""
    if not path.exists():
        err(f"Arquivo não encontrado: {path.name}")
        return False

    sql = path.read_text(encoding="utf-8").strip()

    if not sql:
        ok(f"{path.name} — vazio, ignorado")
        return True

    cur.execute(sql)
    ok(f"{path.name} — executado")
    return True


def list_tables(cur) -> list[str]:
    cur.execute("""
        SELECT tablename
        FROM   pg_tables
        WHERE  schemaname = 'public'
        ORDER  BY tablename
    """)
    return [row[0] for row in cur.fetchall()]


#Main
def main() -> None:
    print()
    print("=" * 60)
    print("  Pantex · Setup do Banco de Dados")
    print("=" * 60)

    # 1. Lê .env
    sep()
    print("1. Lendo .env ...")
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        err(f".env não encontrado em {env_path}")
        sys.exit(1)

    load_dotenv(env_path)
    db_url = os.getenv("DATABASE_URL")

    if not db_url:
        err("DATABASE_URL não definida no .env")
        sys.exit(1)

    #Mascara a senha no print
    display_url = db_url
    if "@" in db_url:
        before, after = db_url.rsplit("@", 1)
        proto, creds  = before.split("://", 1)
        user          = creds.split(":")[0]
        display_url   = f"{proto}://{user}:***@{after}"

    ok(f"DATABASE_URL = {display_url}")

    #Conecta
    sep()
    print("2. Conectando ao PostgreSQL ...")
    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = False
        cur = conn.cursor()
        ok("Conexão estabelecida")
    except psycopg2.OperationalError as e:
        err(f"Falha na conexão: {e}")
        sys.exit(1)

    #Executa os arquivos SQL
    sep()
    print("3. Executando scripts SQL ...")
    try:
        all_ok = all(run_sql_file(cur, f) for f in SQL_FILES)
        if all_ok:
            conn.commit()
            ok("Transação confirmada (COMMIT)")
        else:
            conn.rollback()
            err("Erros encontrados — transação revertida (ROLLBACK)")
            cur.close()
            conn.close()
            sys.exit(1)
    except psycopg2.Error as e:
        conn.rollback()
        err(f"Erro SQL: {e}")
        cur.close()
        conn.close()
        sys.exit(1)

    #Lista tabelas criadas
    sep()
    print("4. Verificando tabelas no banco ...")
    tables = list_tables(cur)
    if tables:
        ok(f"{len(tables)} tabela(s) encontrada(s):")
        for t in tables:
            print(f"       • {t}")
    else:
        print("  [AVS] Nenhuma tabela encontrada — verifique os scripts SQL.")

    cur.close()
    conn.close()

    sep()
    print("  Setup concluído com sucesso!")
    print("=" * 60)
    print()


if __name__ == "__main__":
    main()
