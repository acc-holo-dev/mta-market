#!/bin/bash

# MTA Market Backup Script (PLAN O-003)
# Usage: ./scripts/backup.sh
# Backs up the database and the uploads directory, and (optionally, encrypted)
# the environment file.
#
# Policy (see mta-market-document/05-operations/backup.md):
# - RPO 24h / RTO 4h; retention 30 days (override: BACKUP_RETENTION_DAYS);
# - .env is NEVER stored unencrypted: it is AES-256 encrypted with
#   BACKUP_ENCRYPTION_KEY (openssl enc). Without the key, the .env backup is
#   SKIPPED with a warning - secrets must not sit in the backups folder;
# - every artifact gets a SHA-256 entry in a checksum manifest for restore
#   verification.

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATE=$(date +%Y%m%d_%H%M%S)
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
MANIFEST="$BACKUP_DIR/SHA256SUMS"

echo "💾 Starting backup (retention: ${RETENTION_DAYS} days)..."

mkdir -p "$BACKUP_DIR"

add_checksum() {
  ( cd "$BACKUP_DIR" && sha256sum "$(basename "$1")" >> "$MANIFEST" )
}

# Backup PostgreSQL database
echo "📦 Backing up database..."
DB_FILE="$BACKUP_DIR/db_backup_$DATE.sql"
docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U mtamarket mtamarket > "$DB_FILE"
echo "✅ Database backed up to $DB_FILE"
add_checksum "$DB_FILE"

# Backup uploads directory
if [ -d "./uploads" ]; then
  echo "📦 Backing up uploads..."
  UPLOADS_FILE="$BACKUP_DIR/uploads_backup_$DATE.tar.gz"
  tar -czf "$UPLOADS_FILE" ./uploads
  echo "✅ Uploads backed up to $UPLOADS_FILE"
  add_checksum "$UPLOADS_FILE"
fi

# Backup environment file - ENCRYPTED ONLY (PLAN O-003/Q-004)
if [ -f ".env" ]; then
  if [ -n "$BACKUP_ENCRYPTION_KEY" ]; then
    echo "📦 Backing up .env (encrypted)..."
    ENV_FILE="$BACKUP_DIR/env_backup_$DATE.enc"
    openssl enc -aes-256-cbc -pbkdf2 -salt \
      -in .env -out "$ENV_FILE" -pass env:BACKUP_ENCRYPTION_KEY
    echo "✅ Environment backed up (encrypted) to $ENV_FILE"
    add_checksum "$ENV_FILE"
  else
    echo "⚠️  SKIPPED .env backup: BACKUP_ENCRYPTION_KEY is not set." >&2
    echo "   Unencrypted secrets are never written to the backups folder." >&2
  fi
fi

# Restore hint (verification procedure - see 05-operations/backup.md)
cat <<HINT

✅ Backup complete. Verify before trusting:
   cd $BACKUP_DIR && sha256sum -c <(grep "$(date +%Y%m%d)" SHA256SUMS)
Restore: docker-compose -f $COMPOSE_FILE exec -T postgres psql -U mtamarket mtamarket < db_backup_<date>.sql
HINT

# Remove backups older than the retention window
echo "🧹 Cleaning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "*.sql" -type f -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "*.tar.gz" -type f -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "*.enc" -type f -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "SHA256SUMS" -type f -size +1M -delete
