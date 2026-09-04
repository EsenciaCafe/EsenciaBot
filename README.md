# EsenciaBot

Bot privado de Telegram para consultar las ventas de Esencia y auditar los pedidos
vaciados desde el TPV.

Incluye un menú guiado con botones de periodo, búsqueda de productos, acciones
reversibles sobre los vaciados, un resumen privado automático al cerrar la caja y
una Mini App para consultar el panel y el histórico completo desde Telegram,
incluidos resúmenes por cualquier intervalo de fechas, el ranking de toppings de
MiniPancakes y las tendencias de modificadores por producto, contabilizando por
separado las unidades vendidas y vaciadas. El mismo panel puede abrirse directamente
en un navegador mediante una cuenta privada configurada desde Telegram.

## Arquitectura

- La Edge Function `telegram-sales-bot` se despliega en el proyecto Supabase del TPV.
- La Edge Function `esencia-panel-api` atiende únicamente las consultas protegidas del panel.
- Las ventas cobradas se consultan en modo lectura desde la base del TPV.
- Los vaciados se guardan en un proyecto Supabase de auditoría independiente.
- Los vaciados de prueba pueden excluirse de las estadísticas desde Telegram sin borrarlos.
- El navegador nunca recibe la clave secreta del proyecto de auditoría.
- La Mini App valida en el servidor la firma y la antigüedad de la sesión de Telegram.
- El repositorio `EsenciaTPV` solo conserva los clientes que notifican vaciados y cierres.

## Estructura

- `supabase/functions/telegram-sales-bot/`: código del bot y webhook.
- `supabase/functions/esencia-panel-api/`: API de solo lectura y configuración de la cuenta web.
- `supabase-audit/`: configuración y migraciones de la base de auditoría.
- `dist/`: Mini App estática optimizada para móvil y para el tema de Telegram.
- `.github/workflows/deploy-pages.yml`: publicación automática de `dist/` en GitHub Pages.
- `supabase/functions/esencia-panel-web/`: alojamiento estático alternativo; no es necesario para GitHub Pages.
- `integration/tpv-statistics/`: cliente y guía para integrar las estadísticas en EsenciaTPV.
- `docs/telegram-sales-bot.md`: instalación, secretos y operación.

## Despliegue

Vincula el directorio principal al proyecto Supabase del TPV y despliega:

```powershell
npx supabase link --project-ref <TPV_PROJECT_REF>
npx supabase functions deploy telegram-sales-bot --no-verify-jwt --use-api
npx supabase functions deploy esencia-panel-api --no-verify-jwt --use-api
```

La base de auditoría se administra por separado:

```powershell
npx supabase link --project-ref <AUDIT_PROJECT_REF> --workdir supabase-audit
npx supabase db push --linked --workdir supabase-audit
```

Consulta [la documentación completa](docs/telegram-sales-bot.md) antes de rotar
secretos o cambiar el webhook.

El panel web se publica desde `dist/` mediante GitHub Actions en
<https://esenciacafe.github.io/EsenciaBot/> y se conecta a la API privada de solo
lectura. En GitHub, selecciona **Settings → Pages → Source: GitHub Actions**. Cada
cambio enviado a `main` que afecte a `dist/` vuelve a publicar el panel.

Consulta [la guía de subida a GitHub](GUIA_SUBIR_A_GITHUB.md) para completar el
proceso y cambiar el botón del bot cuando la página ya esté disponible.
