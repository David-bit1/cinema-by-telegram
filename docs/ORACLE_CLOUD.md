# Despliegue gratuito en Oracle Cloud Always Free

Este despliegue mantiene el bot y PostgreSQL en una única VM de Oracle Cloud. Docker reinicia los servicios tras un reinicio de la VM. La base de datos no se expone a Internet.

## 1. Crear la VM

1. Crea una cuenta en [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/) y selecciona con cuidado la región principal.
2. En **Compute > Instances > Create instance**, usa Ubuntu 24.04 o una versión LTS disponible.
3. En **Shape**, selecciona **Ampere > VM.Standard.A1.Flex** con `1 OCPU` y `6 GB` de RAM. Confirma que aparece la etiqueta **Always Free**.
4. Asigna una IP pública y añade tu clave SSH. Descarga y conserva la clave privada fuera del repositorio.
5. En la lista de seguridad de red, permite únicamente SSH (`22`) desde tu IP. El bot usa long polling: no necesita abrir puertos HTTP ni PostgreSQL.

Oracle limita Always Free a un total de 2 OCPU y 12 GB para Ampere A1. La disponibilidad puede variar según la región.

## 2. Preparar el servidor

Conéctate por SSH y ejecuta:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit
```

Vuelve a conectarte por SSH para que el permiso del grupo Docker se aplique.

## 3. Descargar y configurar el bot

```bash
git clone https://github.com/David-bit1/cinema-by-telegram.git
cd cinema-by-telegram
cp .env.production.example .env
nano .env
```

En `.env`, define un token vigente de BotFather, tu ID administrativo y una contraseña larga y única. `DATABASE_URL` debe contener exactamente la misma contraseña que `POSTGRES_PASSWORD`, manteniendo `@database:5432` como host.

## 4. Iniciar y comprobar

```bash
docker compose -f compose.production.yaml up -d --build
docker compose -f compose.production.yaml logs -f bot
```

Cuando aparezca que el bot fue iniciado, prueba `/start` desde Telegram. Para detener los registros, usa `Ctrl+C`; los contenedores seguirán ejecutándose. Para actualizar tras un cambio en GitHub:

```bash
git pull
docker compose -f compose.production.yaml up -d --build
```

## Respaldo

Al menos una vez por semana, crea un respaldo y cópialo fuera de la VM:

```bash
docker compose -f compose.production.yaml exec -T database pg_dump -U streaming streaming > backup-streaming.sql
```

No guardes `.env`, claves SSH ni respaldos en GitHub.
