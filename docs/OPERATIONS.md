# Operación segura

## Antes de publicar

1. Crea el bot exclusivamente desde `@BotFather` y guarda `TELEGRAM_BOT_TOKEN` como secreto del servidor: nunca en Git, mensajes ni capturas.
2. Configura `ADMIN_IDS` con IDs numéricos de cuentas administradoras de confianza. No aceptes nombres de usuario como identidad administrativa.
3. Ejecuta PostgreSQL en una red privada o en `127.0.0.1`; no expongas el puerto 5432 a Internet. Usa una contraseña única y copias cifradas de la base.
4. Ejecuta el proceso bajo un usuario sin privilegios, aplica actualizaciones del sistema y conserva registros de acceso y pagos.
5. Antes de publicar una obra, registra contrato o licencia, territorio, fecha de vencimiento, tipo de uso comercial permitido y referencia documental en `rightsReference`.

## Catálogo y entrega

- Solo establece `published = true` y `rightsConfirmed = true` tras validar derechos de distribución en Telegram y en los territorios objetivo.
- Sube al bot únicamente los archivos maestros autorizados y guarda su `telegramFileId`; no incorpores enlaces extraídos de servicios de streaming externos.
- Revoca la publicación y el acceso cuando caduque una licencia. Conserva los eventos de pago y soporte para reclamaciones y reembolsos.

## Producción

Para el MVP se utiliza long polling. En producción, cambia a webhook detrás de HTTPS, limita el firewall a los servicios estrictamente necesarios, monitoriza errores y prueba restauraciones de respaldo periódicamente.
