# NanBet - Docker Deployment Guide

This guide explains how to deploy NanBet using Docker and Docker Compose with MariaDB.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+

## Quick Start

### 1. Environment Configuration

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` and set the following required variables:

```env
# Nano Nodes API Key (REQUIRED)
NODES_API_KEY=your_api_key_from_nanswap

# Database passwords (RECOMMENDED to change)
DB_PASSWORD=your_secure_db_password
DB_ROOT_PASSWORD=your_secure_root_password

# Server URL (if deploying publicly)
BASE_URL=https://your-domain.com
```

### 2. Start the Application

Start all services (MariaDB + Backend):

```bash
docker-compose up -d
```

This will:
- Pull/build the necessary Docker images
- Start MariaDB database
- Initialize the database schema
- Start the NanBet backend API

### 3. Check Service Status

```bash
# View running containers
docker-compose ps

# View logs
docker-compose logs -f backend
docker-compose logs -f mariadb
```

### 4. Access the Application

- Backend API: http://localhost:3000
- Health Check: http://localhost:3000/health

## Management Commands

### Stop Services

```bash
docker-compose down
```

### Stop and Remove Data

⚠️ **Warning**: This will delete all database data!

```bash
docker-compose down -v
```

### Rebuild Application

After code changes:

```bash
docker-compose up -d --build backend
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f mariadb

# Last 100 lines
docker-compose logs --tail=100 backend
```

### Database Access

Access MariaDB shell:

```bash
docker-compose exec mariadb mysql -u nanbet -p nanbet
```

### Backup Database

```bash
docker-compose exec mariadb mysqldump -u nanbet -p nanbet > backup-$(date +%Y%m%d-%H%M%S).sql
```

### Restore Database

```bash
docker-compose exec -T mariadb mysql -u nanbet -p nanbet < backup.sql
```

## Production Deployment

### 1. Security Hardening

Update `.env` with secure values:

```env
NODE_ENV=production
DB_PASSWORD=use_strong_random_password_here
DB_ROOT_PASSWORD=use_strong_random_password_here
BASE_URL=https://your-production-domain.com
```

### 2. Reverse Proxy (Nginx Example)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. SSL/TLS with Let's Encrypt

```bash
# Install Certbot
apt-get install certbot python3-certbot-nginx

# Obtain certificate
certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
```

### 4. Firewall Configuration

```bash
# Allow only necessary ports
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## Monitoring

### Health Checks

Docker Compose includes built-in health checks:

```bash
docker-compose ps
```

Services should show "healthy" status.

### Resource Usage

```bash
docker stats
```

## Troubleshooting

### Database Connection Issues

Check if MariaDB is running:

```bash
docker-compose ps mariadb
docker-compose logs mariadb
```

### Backend Not Starting

Check backend logs:

```bash
docker-compose logs backend
```

Common issues:
- Database not ready: Wait for MariaDB health check to pass
- Missing environment variables: Check `.env` file
- Port already in use: Change `PORT` in `.env`

### Reset Everything

⚠️ **Warning**: This will delete all data!

```bash
docker-compose down -v
rm -rf docker/mariadb/data/
docker-compose up -d
```

## Development with Docker

For development, you can mount source code:

```yaml
# Add to docker-compose.yml under backend service
volumes:
  - ./src:/app/src
  - ./logs:/app/logs
```

Then restart:

```bash
docker-compose up -d backend
```

## Environment Variables Reference

### Server
- `NODE_ENV`: Environment mode (development/production)
- `PORT`: Server port (default: 3000)
- `BASE_URL`: Public URL of the application

### Database
- `DB_DIALECT`: Database type (mysql/mariadb)
- `DB_HOST`: Database host
- `DB_PORT`: Database port (default: 3306)
- `DB_NAME`: Database name
- `DB_USER`: Database user
- `DB_PASSWORD`: Database password
- `DB_ROOT_PASSWORD`: Database root password

### Services
- `NODES_API_KEY`: NanSwap nodes API key (required)

## Support

For issues and questions:
- Check logs: `docker-compose logs`
- Verify configuration: `docker-compose config`
- Restart services: `docker-compose restart`
