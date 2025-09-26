set -euo pipefail

# === CONFIGURÁVEIS ===
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # raiz do projeto
ENV_FILE="$APP_DIR/.env"
BACKUP_DIR="/var/backups/celulares"                          
RETENTION_DAYS=14

command -v sqlite3 >/dev/null 2>&1 || { echo "Erro: sqlite3 não encontrado. Instale (apt install sqlite3)."; exit 1; }
mkdir -p "$BACKUP_DIR"

# Carrega .env (para pegar DB_FILE)
if [[ -f "$ENV_FILE" ]]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

DB_FILE="${DB_FILE:-$APP_DIR/data.db}"
TS="$(date +'%Y%m%d-%H%M%S')"
DAY="$(date +'%Y%m%d')"

DAY_DIR="$BACKUP_DIR/$DAY"
mkdir -p "$DAY_DIR"

echo "==> Iniciando backup $TS"
echo "APP_DIR=$APP_DIR"
echo "DB_FILE=$DB_FILE"
echo "BACKUP_DIR=$BACKUP_DIR"

# 1) Banco 
DB_BK="$DAY_DIR/db-$TS.sqlite3"
SQL_DUMP_GZ="$DAY_DIR/db-$TS.sql.gz"
sqlite3 "$DB_FILE" ".backup '$DB_BK'"
sqlite3 "$DB_FILE" .dump | gzip -9 > "$SQL_DUMP_GZ"
sha256sum "$DB_BK" > "$DB_BK.sha256"
sha256sum "$SQL_DUMP_GZ" > "$SQL_DUMP_GZ.sha256"

#  Snapshot do código
CODE_TGZ="$DAY_DIR/code-$TS.tar.gz"
tar -czf "$CODE_TGZ" \
  --directory="$APP_DIR" \
  --exclude='node_modules' \
  --exclude='front/node_modules' \
  --exclude='front/dist' \
  --exclude='.git' \
  --exclude='*.log' \
  --exclude='scripts/backups' \
  .

#  Rotação
find "$BACKUP_DIR" -maxdepth 1 -type d -name '20*' -mtime +$RETENTION_DAYS -print -exec rm -rf {} \;

echo "==> Backup finalizado."