# Guía para publicar EsenciaBot en GitHub

Este paquete contiene el bot, la API, el panel web y el flujo automático de
GitHub Pages. No subas el archivo ZIP como un único fichero al repositorio:
primero hay que descomprimirlo.

## Opción recomendada: pedir a Codex que lo publique

1. Descarga y descomprime el ZIP.
2. Abre Codex en un ordenador con acceso a la cuenta de GitHub `EsenciaCafe`.
3. Dale la carpeta descomprimida y copia el texto de
   `PROMPT_PARA_CODEX_GITHUB.md`.
4. Revisa que la acción **Publicar panel en GitHub Pages** termine en verde.

## Opción con GitHub Desktop

1. Instala GitHub Desktop e inicia sesión con la cuenta que administra
   `EsenciaCafe/EsenciaBot`.
2. Clona `https://github.com/EsenciaCafe/EsenciaBot.git`.
3. Copia dentro de la carpeta clonada todo el contenido de este paquete,
   manteniendo las carpetas `.github`, `dist`, `docs`, `integration`, `supabase` y
   `supabase-audit`.
4. En GitHub Desktop crea un commit con el mensaje
   `feat: publicar panel independiente` y pulsa **Push origin**.
5. En GitHub abre **Settings → Pages** y selecciona **GitHub Actions** como fuente.
6. Espera a que la acción **Publicar panel en GitHub Pages** termine en verde.
7. Comprueba `https://esenciacafe.github.io/EsenciaBot/`.

## Después de publicar la web

La página y el botón de Telegram son dos despliegues distintos. Cuando la página
ya funcione, hay que desplegar de nuevo `telegram-sales-bot` o establecer el secreto
`TELEGRAM_WEB_APP_URL` con este valor:

```text
https://esenciacafe.github.io/EsenciaBot/
```

Después escribe `/start` al bot para que Telegram vuelva a registrar sus botones.
El código de este paquete ya utiliza esa dirección como valor predeterminado.

## Qué se publica

GitHub Actions publica únicamente `dist/`, que contiene archivos estáticos. Las
consultas privadas siguen pasando por `esencia-panel-api` en Supabase. El token del
bot y las claves secretas no se incluyen en la página web.
