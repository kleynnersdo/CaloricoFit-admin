# Calórico Fit — deploy VPS (Hostkey)

> VPS: `162.141.78.230` · SSH: `ssh hostkey-vps` · Path: `/opt/apps/caloricofit`

## Flujo git

1. Desarrollo en `ender`
2. Merge → `staging` → deploy staging
3. Validación → merge → `main` → deploy producción

## Staging (sin dominio)

- URL: `http://162.141.78.230:8080`
- API: `http://162.141.78.230:8080/api`

```bash
ssh hostkey-vps
cd /opt/apps/caloricofit
cp .env.production.example .env   # editar passwords
bash scripts/deploy.sh staging
```

## Producción (con dominio)

1. Cliente apunta DNS `A` → `162.141.78.230`
2. Editar `deploy/nginx/caloricofit-production.conf` (reemplazar `CALORICO_DOMAIN`)
3. Copiar a nginx + certbot:

```bash
sudo sed 's/CALORICO_DOMAIN/admin.tudominio.com/' deploy/nginx/caloricofit-production.conf | sudo tee /etc/nginx/sites-available/caloricofit.conf
sudo ln -sf /etc/nginx/sites-available/caloricofit.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d admin.tudominio.com
```

4. Actualizar `.env`: `VITE_LOCAL_API_URL=https://admin.tudominio.com/api`
5. `bash scripts/deploy.sh main`

## Comandos útiles

```bash
pm2 logs caloricofit-api
docker compose -f docker-compose.prod.yml logs -f
docker exec -it caloricofit-prod-db psql -U calorico -d caloricofit
```

## Release desde tu PC

Flujo: `ender` → merge → push → VPS

```powershell
# CaloricoFit
npm run deploy:staging    # ender→staging + deploy
npm run deploy:main       # staging→main + deploy
npm run deploy:sync       # solo subir (sin merge)

# O directo:
.\scripts\release.ps1 staging
.\scripts\release.ps1 main -DeployOnly
```

Requiere: cambios commiteados, SSH `hostkey-vps` configurado, Git Bash para sync.

Ver skill `kleynners-deploy` en Cursor para el workflow completo.

## Backups

Ver `/opt/backups/backup-dbs.sh` en el VPS (sube dumps a Bunny.net).

Configuración Bunny: copiar `deploy/bunny.env.example` → `/opt/backups/.env` y configurar rclone.
Cron diario 03:00 UTC-4 ya instalado para `deploy`.

Credenciales admin/DB generadas en VPS: `/opt/backups/.env.credentials` (no commitear).
