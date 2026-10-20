# CineNexo — MVP de streaming autorizado para Telegram

Base para una plataforma de películas, series y anime **propio, de dominio público o con licencia comercial verificable**. No incluye scrapers, enlaces de terceros ni mecanismos para eludir controles de acceso.

## Incluye

- Menú de Telegram: Inicio, Películas, Series, Anime, Buscar, Mi suscripción y Ayuda.
- Registro automático de usuarios de Telegram.
- Catálogo con temporadas y episodios, publicado solo cuando se confirma la licencia.
- Planes Básico, Plus y Premium configurables en base de datos.
- Control de acceso por plan y fecha de vencimiento.
- Cobro de productos digitales mediante Telegram Stars, incluidos planes mensuales.
- Trazabilidad de pagos y eventos relevantes.

## Puesta en marcha local

1. Copia `.env.example` a `.env` y define `TELEGRAM_BOT_TOKEN`, `DATABASE_URL` y `ADMIN_IDS`.
2. Inicia PostgreSQL: `docker compose up -d`.
3. Instala dependencias: `npm install`.
4. Crea las tablas y planes: `npm run db:generate && npm run db:push && npm run db:seed`.
5. Ejecuta el bot: `npm run dev`.

Usa `/admin` con un ID incluido en `ADMIN_IDS` para comprobar la administración. Antes de producción, configura HTTPS, copias de seguridad, secretos fuera de Git y un proceso de revisión de derechos para cada obra.

## Despliegue en Render

El archivo `render.yaml` define un worker permanente y PostgreSQL administrado. En Render, conecta el repositorio de GitHub, selecciona **New + > Blueprint**, y elige este archivo. Render pedirá los secretos `TELEGRAM_BOT_TOKEN` y `ADMIN_IDS`; introdúcelos en su panel, nunca en Git.

El worker y la base incluidos usan planes de pago para que el bot no entre en suspensión. Antes de activar el despliegue, detén cualquier instancia local con `Ctrl + C`: Telegram solo permite una instancia consumiendo actualizaciones mediante long polling.

## Despliegue gratuito en Oracle Cloud

Para evitar Render, el proyecto incluye `Dockerfile`, `compose.production.yaml` y `.env.production.example` para una VM Always Free. Sigue [docs/ORACLE_CLOUD.md](docs/ORACLE_CLOUD.md). No subas el archivo `.env` ni claves SSH a GitHub.

## Operación de contenido

Cada obra requiere `rightsConfirmed = true`, una referencia de licencia en `rightsReference` y un `telegramFileId` propio antes de publicarse. Guarda el identificador de archivo después de subir material autorizado al bot; no almacenes ni difundas URLs de servicios ajenos.

Los precios son valores iniciales en Stars y se modifican en la tabla `Plan`. Telegram exige Stars (`XTR`) para la venta de bienes y servicios digitales dentro de sus aplicaciones.

### Cargar la primera película

Como administrador, abre el bot y usa `/agregar_pelicula`. Envía el título, la sinopsis y el archivo de vídeo como vídeo de Telegram. El bot crea un borrador y muestra su ID. Revísalo y usa `/publicar ID_DEL_CONTENIDO` para que aparezca en Películas.

Define quién puede verla con `/acceso ID_DEL_CONTENIDO FREE|BASIC|PLUS|PREMIUM`. El acceso `FREE` no requiere suscripción.
