# Bot privado de ventas y auditoría en Telegram

La Edge Function `telegram-sales-bot` permite consultar las ventas del TPV sin
exponer claves de Supabase en Telegram. Solo escribe el registro de vaciados en la
base independiente de auditoría y únicamente responde a los identificadores
incluidos en `TELEGRAM_ALLOWED_USER_IDS`.

## Funciones incluidas

- Resumen de hoy, ayer, los últimos siete días, el mes actual o cualquier intervalo personalizado.
- Total neto, tickets, ticket medio y devoluciones.
- Desglose de cobros en efectivo, tarjeta y tarjeta regalo.
- Diez artículos con más unidades registradas, sumando ventas cobradas y vaciados.
- Búsqueda por artículo con ventas cobradas, vaciados y total combinado.
- Consultas de fechas concretas: `día 20`, `20/07/2026` o `20 de julio`.
- Menú principal con accesos a hoy, ayer, mes, top, caja, vaciados y productos.
- Selectores de periodo para evitar escribir comandos manualmente.
- Búsqueda guiada de productos y fechas mediante respuestas de Telegram.
- Aviso inmediato cuando se vacía una mesa, comanda o venta directa.
- Aviso automático al cerrar caja con ventas del día, cobros, top de productos,
  vaciados y diferencias del arqueo cerrado.
- Resumen de pedidos vaciados por día desde una base de auditoría independiente.
- Exclusión reversible de vaciados de prueba mediante un botón privado en Telegram.
- Panel web dentro de Telegram con ventas, cobros, top de productos e histórico de vaciados.
- Acceso independiente con correo y contraseña; la cuenta solo puede crearse desde un usuario
  de Telegram autorizado y la sesión queda guardada en cada navegador.
- Ranking de toppings de MiniPancakes por intervalo, sumando ventas y vaciados contabilizables,
  mostrando ambos valores por separado y unificando `Plane` y las raciones sin opciones como `Sin Topping`.
- Tendencias de modificadores que suman ventas y vaciados contabilizables, conservando su desglose.
- Análisis de modificadores por producto y comparación con el periodo anterior de igual duración.
- Detalle de cada vaciado con empleado, hora, artículos, modificadores, importe y estado estadístico.
- Cliente reutilizable e instrucciones para integrar las mismas vistas en EsenciaTPV sin duplicar
  consultas ni exponer secretos.

## 1. Crear el bot y conocer el ID autorizado

1. Abre `@BotFather` en Telegram, ejecuta `/newbot` y guarda el token.
2. Envía un mensaje al bot recién creado.
3. Durante la puesta en marcha se puede consultar temporalmente `getUpdates` para
   obtener `message.from.id`. No guardes el resultado ni el token en el repositorio.

`TELEGRAM_ALLOWED_USER_IDS` admite varios IDs separados por comas.

## 2. Configurar secretos

Genera `TELEGRAM_WEBHOOK_SECRET` como una cadena aleatoria de al menos 32 caracteres.
Después configura los secretos del proyecto:

```powershell
npx supabase secrets set TELEGRAM_BOT_TOKEN="<token-de-botfather>" TELEGRAM_WEBHOOK_SECRET="<secreto-aleatorio>" TELEGRAM_ALLOWED_USER_IDS="<id-telegram>" AUDIT_SUPABASE_URL="https://<AUDIT_PROJECT_REF>.supabase.co" AUDIT_SUPABASE_SECRET_KEY="<clave-secreta-del-proyecto-de-auditoria>"
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son secretos integrados disponibles en
las Edge Functions. Nunca deben copiarse a variables `VITE_*`.

`AUDIT_SUPABASE_SECRET_KEY` pertenece al proyecto separado de auditoría y solo se
guarda como secreto de la Edge Function. Nunca se expone al navegador.

## 3. Desplegar

```powershell
npx supabase functions deploy telegram-sales-bot
npx supabase functions deploy esencia-panel-api
```

Ambas funciones tienen `verify_jwt = false` porque deben aceptar la firma propia de Telegram.
`telegram-sales-bot` autentica el webhook y autoriza de nuevo el ID del usuario.
`esencia-panel-api` no acepta avisos ni escrituras del TPV: solo ofrece las consultas del panel,
validadas mediante Telegram o una sesión de Supabase Auth con permiso interno.

## 4. Registrar el webhook

Sustituye los valores y realiza una petición HTTPS:

```text
POST https://api.telegram.org/bot<BOT_TOKEN>/setWebhook
Content-Type: application/json

{
  "url": "https://<PROJECT_REF>.supabase.co/functions/v1/telegram-sales-bot",
  "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
  "allowed_updates": ["message", "callback_query"],
  "drop_pending_updates": true
}
```

Comprueba el resultado con `getWebhookInfo` y escribe `/start` al bot.
Al ejecutar `/start`, el bot registra también su menú de comandos en Telegram.
La dirección desplegada del panel está incluida como valor predeterminado. El secreto
opcional `TELEGRAM_WEB_APP_URL` permite sustituirla sin editar el código. Con una URL
disponible, el bot añade el botón **Abrir panel** y convierte el botón de menú del chat
en un acceso directo al panel.

## Mini App y panel web

El contenido de `dist/` es estático y puede alojarse en cualquier origen HTTPS. Su
dirección de API se configura en `dist/config.js`. Incluye únicamente una clave publicable
de Supabase, segura para clientes web; las claves secretas y el token de Telegram permanecen
en las Edge Functions.

El panel se publica desde `dist/` mediante GitHub Actions en
`https://esenciacafe.github.io/EsenciaBot/`. En GitHub debe estar seleccionada la
opción **Settings → Pages → Source: GitHub Actions**. La Edge Function
`esencia-panel-web` queda únicamente como alojamiento alternativo y no es necesaria
para este despliegue.

Cuando se abre desde el bot, cada consulta envía `Telegram.WebApp.initData` a
`esencia-panel-api`. El servidor:

1. Comprueba la firma HMAC con el token del bot.
2. Rechaza sesiones con más de una hora de antigüedad.
3. Comprueba de nuevo que el ID pertenezca a `TELEGRAM_ALLOWED_USER_IDS`.
4. Consulta las bases del TPV y auditoría con las claves que solo existen en el servidor.

Desde Telegram se puede crear una cuenta web con correo y contraseña. Fuera de Telegram,
el panel solicita esa cuenta, conserva la sesión en el navegador y la renueva automáticamente.
La autorización se guarda en `app_metadata`, que el usuario no puede modificar.
El resumen y el histórico admiten intervalos personalizados de hasta cinco años. El histórico carga 20
vaciados por página para mantener una respuesta rápida en el móvil.

## Consultas de ejemplo

```text
/hoy
/ayer
/mes
/caja hoy
/top este mes
/producto minipancakes
/producto mini pancakes día 20
/vaciados hoy
¿Cuántas mesas se vaciaron ayer y por qué importe?
¿Cuántos cafés se vendieron ayer?
¿Cuántos mini pancakes se vendieron el día 20?
¿Cuánto hemos vendido hoy?
```

Cuando se indica solo `día 20`, el bot consulta el día 20 del mes actual. Para
evitar ambigüedades también se puede indicar `día 20 del mes pasado`, `20/07` o
`20 de julio de 2026`. La respuesta siempre muestra la fecha interpretada.

El ranking `/top` muestra el total combinado y el desglose de cada artículo. Por
ejemplo, 5 latte cobrados y 3 latte vaciados aparecen como 8 unidades:
`5 vendidas + 3 vaciadas`.

## Menú y botones

El menú principal ofrece:

- **Hoy**, **Ayer** y **Este mes** para abrir directamente el resumen.
- **Top**, **Caja** y **Vaciados**, que primero permiten elegir el periodo.
- **Otra fecha** para responder con `día 20`, `20/07` o una fecha escrita.
- **Buscar producto**, que solicita una respuesta como `latte ayer` o
  `mini pancakes día 20`.
- **Ayuda** para ver ejemplos.

El comando `/menu` recupera los botones principales en cualquier momento.

## Seguridad y operación

- Rota el token inmediatamente si aparece en un chat, log o commit.
- Usa un chat privado; no añadas el bot a grupos.
- Mantén reducida la lista de usuarios autorizados.
- La función no modifica ventas, cierres ni inventario.
- Los accesos rechazados quedan registrados sin almacenar el contenido del mensaje.

## Aviso de cierre de caja

Después de guardar un cierre, el TPV envía un evento privado al bot. El bot consulta
las ventas definitivas de la fecha comercial y los vaciados contabilizados en la base
de auditoría, y envía un resumen a cada usuario autorizado.

El resumen incluye neto, tickets, ticket medio, efectivo, tarjeta, vaciados, top
combinado de productos y diferencias del arqueo. Un fallo puntual de Telegram no
anula ni bloquea el cierre ya guardado en el TPV.

## Registro de pedidos vaciados

Al confirmar **Vaciar**, la Edge Function registra el pedido y sus líneas en el
proyecto Supabase de auditoría, separado del TPV y del sistema de fidelidad. La base
principal del TPV no conserva esos registros.

Cada vaciado incluye una fecha comercial calculada con `Atlantic/Canary`, por lo que
`/vaciados hoy`, `/vaciados ayer` y `/vaciados mes` consultan periodos independientes.
Las preguntas por producto combinan las ventas cobradas del TPV con las líneas
vaciadas de auditoría, mostrando ambos importes y el total.

El TPV espera a que el registro de auditoría se complete antes de borrar el pedido.
Si falla, muestra un error y conserva todos los artículos.

### Vaciados de prueba

Cada aviso de vaciado incluye el botón **No contar en estadísticas**. Al pulsarlo:

- El registro permanece guardado en la base de auditoría.
- Sus artículos e importe dejan de participar en consultas, top y totales.
- `/vaciados` lo muestra únicamente dentro de `No contabilizados`.
- El botón cambia a **Volver a contar** para poder deshacer la exclusión.

Este control solo aparece en el chat privado autorizado de Telegram y no añade
ningún mensaje ni indicador nuevo en el TPV.
