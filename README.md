# EsenciaBot

Bot privado de Telegram para consultar las ventas de Esencia y auditar los pedidos
vaciados desde el TPV.

## Arquitectura

- La Edge Function `telegram-sales-bot` se despliega en el proyecto Supabase del TPV.
- Las ventas cobradas se consultan en modo lectura desde la base del TPV.
- Los vaciados se guardan en un proyecto Supabase de auditoría independiente.
- El navegador nunca recibe la clave secreta del proyecto de auditoría.
- El repositorio `EsenciaTPV` solo conserva el cliente que notifica cada vaciado.

## Estructura

- `supabase/functions/telegram-sales-bot/`: código del bot y webhook.
- `supabase-audit/`: configuración y migraciones de la base de auditoría.
- `docs/telegram-sales-bot.md`: instalación, secretos y operación.

## Despliegue

Vincula el directorio principal al proyecto Supabase del TPV y despliega:

```powershell
npx supabase link --project-ref <TPV_PROJECT_REF>
npx supabase functions deploy telegram-sales-bot --no-verify-jwt --use-api
```

La base de auditoría se administra por separado:

```powershell
npx supabase link --project-ref <AUDIT_PROJECT_REF> --workdir supabase-audit
npx supabase db push --linked --workdir supabase-audit
```

Consulta [la documentación completa](docs/telegram-sales-bot.md) antes de rotar
secretos o cambiar el webhook.
