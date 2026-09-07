#!/bin/bash

# MTA Market Deployment Script
# Usage: ./scripts/deploy.sh [environment]
# Example: ./scripts/deploy.sh production

set -e

ENVIRONMENT=${1:-production}
COMPOSE_FILE="docker-compose.prod.yml"

echo "🚀 Deploying MTA Market to $ENVIRONMENT..."

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

# Pull latest images
echo "📦 Pulling latest Docker images..."
docker-compose -f $COMPOSE_FILE pull

# Stop old containers
echo "🛑 Stopping old containers..."
docker-compose -f $COMPOSE_FILE down

# Start new containers
echo "▶️  Starting new containers..."
docker-compose -f $COMPOSE_FILE up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check health
echo "🏥 Checking service health..."
for service in postgres redis backend frontend nginx; do
    if docker-compose -f $COMPOSE_FILE ps $service | grep -q "Up"; then
        echo "✅ $service is running"
    else
        echo "❌ $service failed to start"
        docker-compose -f $COMPOSE_FILE logs $service
        exit 1
    fi
done

# Cleanup old images
echo "🧹 Cleaning up old images..."
docker image prune -f

echo "✅ Deployment completed successfully!"
echo ""
echo "📊 Services status:"
docker-compose -f $COMPOSE_FILE ps
echo ""
echo "🌐 Access your application:"
echo "   Frontend: http://localhost (or your domain)"
echo "   Backend API: http://localhost/api"
echo ""
echo "📝 View logs:"
echo "   docker-compose -f $COMPOSE_FILE logs -f"
