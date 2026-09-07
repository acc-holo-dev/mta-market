# Deployment Guide

## 🚀 Quick Start (Development)

### Prerequisites

- Docker & Docker Compose installed
- Git

### Steps

1. **Clone repository**

```bash
git clone https://github.com/acc-holo-dev/mta-market.git
cd mta-market
```

2. **Create environment file**

```bash
cp .env.example .env
# Edit .env with your values
```

3. **Start services**

```bash
docker-compose up -d
```

4. **Access application**

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Health check: http://localhost:3001/health

---

## 🏭 Production Deployment

### Prerequisites

- Docker & Docker Compose
- Domain name with DNS configured
- SSL certificate (Let's Encrypt recommended)
- GitHub account (for Docker images)

### 1. Prepare Server

**Minimum requirements:**

- 2 CPU cores
- 4 GB RAM
- 20 GB disk space
- Ubuntu 22.04 LTS (recommended)

**Install Docker:**

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

**Install Docker Compose:**

```bash
sudo apt-get update
sudo apt-get install docker-compose-plugin
```

### 2. Configure Environment

**Create production .env file:**

```bash
nano .env
```

**Required variables:**

```env
# Database
POSTGRES_USER=mtamarket
POSTGRES_PASSWORD=<strong-password>

# JWT
JWT_SECRET=<generate-strong-secret-min-32-chars>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Discord OAuth2
DISCORD_CLIENT_ID=<your-discord-client-id>
DISCORD_CLIENT_SECRET=<your-discord-client-secret>
DISCORD_REDIRECT_URI=https://yourdomain.com/api/auth/discord/callback

# URLs
BASE_URL=https://yourdomain.com/api
FRONTEND_URL=https://yourdomain.com
NEXT_PUBLIC_API_URL=https://yourdomain.com/api

# S3 / Cloudflare R2
S3_ENABLED=true
S3_BUCKET=mta-market
S3_REGION=us-east-1
S3_ACCESS_KEY=<your-access-key>
S3_SECRET_KEY=<your-secret-key>
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com

# YooKassa
YOOKASSA_ENABLED=true
YOOKASSA_SHOP_ID=<your-shop-id>
YOOKASSA_SECRET_KEY=<your-secret-key>
YOOKASSA_WEBHOOK_SECRET=<webhook-secret>

# Email
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<your-email>
SMTP_PASS=<app-password>
EMAIL_FROM=noreply@yourdomain.com

# GitHub (for pulling images)
GITHUB_REPOSITORY=yourusername/mta-market
```

### 3. Setup SSL Certificate

**Option A: Let's Encrypt (recommended)**

```bash
sudo apt-get install certbot
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com
```

**Copy certificates:**

```bash
mkdir -p ssl
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ssl/
sudo chown -R $USER:$USER ssl/
```

**Option B: Self-signed (development only)**

```bash
mkdir -p ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/privkey.pem -out ssl/fullchain.pem
```

### 4. Deploy with Docker Compose

**Pull images:**

```bash
docker login ghcr.io
docker-compose -f docker-compose.prod.yml pull
```

**Start services:**

```bash
docker-compose -f docker-compose.prod.yml up -d
```

**Check status:**

```bash
docker-compose -f docker-compose.prod.yml ps
```

**View logs:**

```bash
docker-compose -f docker-compose.prod.yml logs -f
```

### 5. Initialize Database

**Run migrations (if using Prisma migrations):**

```bash
docker-compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

**Seed database (optional):**

```bash
docker-compose -f docker-compose.prod.yml exec backend npm run seed
```

### 6. Verify Deployment

**Health checks:**

```bash
curl https://yourdomain.com/health
curl https://yourdomain.com/api/health
```

**Test endpoints:**

```bash
# Backend
curl https://yourdomain.com/api/

# Frontend
curl https://yourdomain.com/
```

---

## 🔄 CI/CD with GitHub Actions

### Setup

1. **Enable GitHub Packages:**
   - Go to repository Settings → Actions → General
   - Enable "Read and write permissions"

2. **Push code to trigger build:**

```bash
git add .
git commit -m "Deploy to production"
git push origin main
```

3. **Workflow runs automatically:**
   - Lints code
   - Runs type checks
   - Builds backend & frontend
   - Builds Docker images
   - Pushes to GitHub Container Registry

### Deploy New Version

**On server:**

```bash
# Pull latest images
docker-compose -f docker-compose.prod.yml pull

# Restart services
docker-compose -f docker-compose.prod.yml up -d

# Remove old images
docker image prune -f
```

**Or use script:**

```bash
./scripts/deploy.sh
```

---

## 🔧 Maintenance

### Backup Database

**Manual backup:**

```bash
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U mtamarket mtamarket > backup.sql
```

**Automated daily backups:**

```bash
# Add to crontab
0 2 * * * cd /path/to/mta-market && docker-compose -f docker-compose.prod.yml exec -T postgres pg_dump -U mtamarket mtamarket > backups/backup-$(date +\%Y\%m\%d).sql
```

### Restore Database

```bash
docker-compose -f docker-compose.prod.yml exec -T postgres psql -U mtamarket mtamarket < backup.sql
```

### Update SSL Certificate

**Renew Let's Encrypt:**

```bash
sudo certbot renew
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ssl/
docker-compose -f docker-compose.prod.yml restart nginx
```

### View Logs

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f frontend
docker-compose -f docker-compose.prod.yml logs -f nginx
```

### Scale Services

```bash
# Scale backend to 3 instances
docker-compose -f docker-compose.prod.yml up -d --scale backend=3
```

### Monitor Resources

```bash
docker stats
```

---

## 🐛 Troubleshooting

### Backend not starting

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs backend

# Common issues:
# - Database connection failed → check DATABASE_URL
# - Redis connection failed → check REDIS_URL
# - Port already in use → change PORT in .env
```

### Frontend not loading

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs frontend

# Common issues:
# - NEXT_PUBLIC_API_URL incorrect
# - Backend not reachable
```

### Database connection errors

```bash
# Check if PostgreSQL is running
docker-compose -f docker-compose.prod.yml ps postgres

# Restart PostgreSQL
docker-compose -f docker-compose.prod.yml restart postgres
```

### SSL certificate errors

```bash
# Check certificate files exist
ls -la ssl/

# Verify certificate validity
openssl x509 -in ssl/fullchain.pem -text -noout
```

---

## 📊 Monitoring

### Health Checks

**Endpoints:**

- Frontend: `https://yourdomain.com/`
- Backend: `https://yourdomain.com/api/health`
- Nginx: `https://yourdomain.com/health`

**Setup monitoring (UptimeRobot, Pingdom, etc):**

- Monitor: `https://yourdomain.com/health`
- Interval: 5 minutes
- Alert: email/SMS on failure

### Log Aggregation

**Use Docker logging driver:**

```yaml
services:
  backend:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Metrics (optional)

**Install Prometheus + Grafana:**

```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

---

## 🔒 Security Checklist

- ✅ Use strong passwords (DATABASE, JWT_SECRET)
- ✅ Enable HTTPS (SSL certificate)
- ✅ Configure firewall (only 80, 443 open)
- ✅ Enable rate limiting (nginx)
- ✅ Regular backups (database)
- ✅ Update Docker images regularly
- ✅ Use secrets management (not .env in production)
- ✅ Enable Docker security scanning
- ✅ Configure CSP headers
- ✅ Disable DEBUG mode

---

## 📝 Environment Variables Reference

See `.env.example` for complete list of variables.

**Critical:**

- `JWT_SECRET` — min 32 characters, cryptographically random
- `POSTGRES_PASSWORD` — strong password
- `DISCORD_CLIENT_SECRET` — from Discord Developer Portal
- `YOOKASSA_SECRET_KEY` — from YooKassa dashboard

**URLs:**

- `BASE_URL` — backend public URL (https://yourdomain.com/api)
- `FRONTEND_URL` — frontend public URL (https://yourdomain.com)
- `DISCORD_REDIRECT_URI` — OAuth callback URL

---

## 🎯 Performance Optimization

### Enable Redis caching

- Already configured in docker-compose.yml
- Backend uses Redis for rate limiting and sessions

### Use CDN for static assets

- Configure Cloudflare or similar CDN
- Point to `https://yourdomain.com/_next/static/`

### Database optimization

```sql
-- Create indexes (already in Prisma schema)
CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
CREATE INDEX IF NOT EXISTS idx_purchases_buyer ON purchases(buyer_id);
```

### Nginx caching

- Static files cached for 1 year
- API responses not cached (dynamic)

---

## 📞 Support

For issues and questions:

- GitHub Issues: https://github.com/acc-holo-dev/mta-market/issues
- Documentation: https://docs.yourdomain.com
- Email: support@yourdomain.com
