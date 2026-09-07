#!/bin/bash

# MTA Market Backup Script
# Usage: ./scripts/backup.sh
# Backs up database and uploads directory

set -e

BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)
COMPOSE_FILE="docker-compose.prod.yml"

echo "💾 Starting backup..."

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup PostgreSQL database
echo "📦 Backing up database..."
docker-compose -f $COMPOSE_FILE exec -T postgres pg_dump -U mtamarket mtamarket > "$BACKUP_DIR/db_backup_$DATE.sql"
echo "✅ Database backed up to $BACKUP_DIR/db_backup_$DATE.sql"

# Backup uploads directory
if [ -d "./uploads" ]; then
    echo "📦 Backing up uploads..."
    tar -czf "$BACKUP_DIR/uploads_backup_$DATE.tar.gz" ./uploads
    echo "✅ Uploads backed up to $BACKUP_DIR/uploads_backup_$DATE.tar.gz"
fi

# Backup environment file
if [ -f ".env" ]; then
    echo "📦 Backing up .env..."
    cp .env "$BACKUP_DIR/env_backup_$DATE"
    echo "✅ Environment backed up to $BACKUP_DIR/env_backup_$DATE"
fi

# Remove backups older than 7 days
echo "🧹 Cleaning old backups (keeping last 7 days)..."
find $BACKUP_DIR -name "*.sql" -type f -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -type f -mtime +7 -delete
find $BACKUP_DIR -name "env_backup_*" -type f -mtime +7 -delete

# Calculate backup size
BACKUP_SIZE=$(du -sh $BACKUP_DIR | cut -f1)
echo "✅ Backup completed! Total size: $BACKUP_SIZE"
echo ""
echo "📁 Backup files:"
ls -lh $BACKUP_DIR/*$DATE*
