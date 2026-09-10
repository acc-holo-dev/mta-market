#!/bin/bash

# MTA Market Deployment Script (PLAN-004 K-004/K-006/K-007)
# Usage: ./scripts/deploy.sh [image-tag]
#   image-tag — exact image tag to deploy (defaults to :latest). Production
#   deployments should pass the immutable CI tag (commit SHA, K-003) so the
#   deployment is reproducible and rollback-targetable.
#
# Sequence (C-001): backup → migrate → deploy → health-gate → verify.

set -e

ENVIRONMENT=${1:-production}
IMAGE_TAG=${2:-latest}
COMPOSE_FILE="docker-compose.prod.yml"

echo "🚀 Deploying MTA Market to $ENVIRONMENT (image tag: $IMAGE_TAG)..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    echo "Copy .env.example to .env and configure it"
    exit 1
fi

# Check if SSL certificates exist
if [ ! -d ssl ]; then
    echo "⚠️  Warning: SSL certificates not found in ./ssl/"
    echo "Please setup SSL certificates before deploying to production"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Record the current running version for rollback (K-004/K-005).
PREVIOUS_TAG=$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' mta-market-backend 2>/dev/null || true)
if [ -z "$PREVIOUS_TAG" ]; then
    PREVIOUS_TAG="unknown"
fi
echo "🔖 Previous backend image tag: $PREVIOUS_TAG"
echo "🔖 Deploying backend image tag: $IMAGE_TAG"

# ---------------------------------------------------------------------------
# 1. Database backup BEFORE any migration (C-001/C-004).
# ---------------------------------------------------------------------------
echo "💾 Creating pre-deploy database backup..."
if [ -x scripts/backup.sh ]; then
    ./scripts/backup.sh || {
        echo "❌ Backup failed — aborting deployment (C-001: no backup, no migration)"
        exit 1
    }
else
    echo "❌ scripts/backup.sh not found — aborting (C-001)"
    exit 1
fi

# ---------------------------------------------------------------------------
# 2. Run database migrations BEFORE swapping containers (C-002).
# Prisma 8 formal path: production must run a reviewed, hashed migration —
# `db migrate` applies the committed migration packages (migrations/app/).
# A migration package is authored via `prisma migration plan` at
# contract-change time and committed together with the contract (see
# docs/operations/database-migrations.md). The quick-path `db update` is
# dev-only per the project's own Prisma-8 skill doc.
# ---------------------------------------------------------------------------
echo "🗄️  Running database migrations (prisma db migrate — formal path)..."
docker compose -f $COMPOSE_FILE run --rm --no-deps \
    -e DATABASE_URL="postgresql://${POSTGRES_USER:-mtamarket}:${POSTGRES_PASSWORD}@postgres:5432/mtamarket" \
    backend node -e "
const { execSync } = require('child_process');
process.env.NODE_ENV = 'production';
execSync('npx prisma db migrate', { stdio: 'inherit', env: process.env });
" || {
    echo "❌ Migration failed — aborting deployment. Database backup is in backups/."
    exit 1
}

# ---------------------------------------------------------------------------
# 3. Deploy exact image versions (K-004).
# ---------------------------------------------------------------------------
echo "📦 Pulling Docker images (tag: $IMAGE_TAG)..."
IMAGE_TAG="$IMAGE_TAG" docker compose -f $COMPOSE_FILE pull

echo "🛑 Stopping old containers..."
docker compose -f $COMPOSE_FILE down

echo "▶️  Starting new containers..."
IMAGE_TAG="$IMAGE_TAG" docker compose -f $COMPOSE_FILE up -d --wait --wait-timeout 180 || {
    echo "❌ Health-gated startup failed (K-006). Rolling back to previous tag: $PREVIOUS_TAG"
    if [ "$PREVIOUS_TAG" != "unknown" ]; then
        IMAGE_TAG="$PREVIOUS_TAG" docker compose -f $COMPOSE_FILE up -d --wait --wait-timeout 120 && \
            echo "↩️  Rollback to $PREVIOUS_TAG completed." || \
            echo "🚨 Rollback FAILED — manual intervention required."
    fi
    docker compose -f $COMPOSE_FILE logs --tail 100
    exit 1
}

echo "🏥 All services healthy (compose --wait gate passed, K-006)."

# Keep previous images for rollback (K-004/K-005): only prune images older
# than 168h — never the immediately-previous version.
echo "🧹 Pruning dangling images older than 7 days (rollback window)..."
docker image prune -f --filter "until=168h"

echo "✅ Deployment completed successfully!"
echo "   deployed tag: $IMAGE_TAG"
echo "   previous tag: $PREVIOUS_TAG (rollback: ./scripts/deploy.sh $ENVIRONMENT $PREVIOUS_TAG)"
echo ""
echo "📊 Services status:"
docker compose -f $COMPOSE_FILE ps
echo ""
echo "📝 View logs:"
echo "   docker compose -f $COMPOSE_FILE logs -f"
