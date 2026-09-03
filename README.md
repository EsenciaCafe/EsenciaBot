# EsenciaBot

Bot privado de Telegram para consultar las ventas de Esencia y auditar los pedidos
vaciados desde el TPV.

Incluye un menú guiado con botones de periodo, búsqueda de productos, acciones
reversibles sobre los vaciados, un resumen privado automático al cerrar la caja y
una Mini App para consultar el panel y el histórico completo desde Telegram,
incluidos resúmenes por cualquier intervalo de fechas, el ranking de toppings de
MiniPancakes y las tendencias de modificadores por producto, contabilizando por
separado las unidades vendidas y vaciadas.

## Arquitectura

- La Edge Function `telegram-sales-bot` se despliega en el proyecto Supabase del TPV.
- Las ventas cobradas se consultan en modo lectura desde la base del TPV.
- Los vaciados se guardan en un proyecto Supabase de auditoría independiente.
- Los vaciados de prueba pueden excluirse de las estadísticas desde Telegram sin borrarlos.
- El navegador nunca recibe la clave secreta del proyecto de auditoría.
- La Mini App valida en el servidor la firma y la antigüedad de la sesión de Telegram.
- El repositorio `EsenciaTPV` solo conserva los clientes que notifican vaciados y cierres.

## Estructura

- `supabase/functions/telegram-sales-bot/`: código del bot y webhook.
- `supabase-audit/`: configuración y migraciones de la base de auditoría.
- `dist/`: Mini App estática optimizada para móvil y para el tema de Telegram.
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
