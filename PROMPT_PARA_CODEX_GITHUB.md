# Texto para pegar a Codex

Publica todo el contenido de esta carpeta en la rama `main` del repositorio
`EsenciaCafe/EsenciaBot`, conservando la estructura de carpetas y el historial
existente del repositorio remoto. No sobrescribas secretos ni modifiques la lógica
de ventas.

Después:

1. Activa GitHub Pages usando **GitHub Actions** como fuente.
2. Ejecuta o espera al workflow `Publicar panel en GitHub Pages`.
3. Comprueba que `https://esenciacafe.github.io/EsenciaBot/` devuelve la aplicación
   renderizada y no el código HTML como texto.
4. Solo cuando esa URL funcione, despliega la Edge Function
   `telegram-sales-bot` del proyecto Supabase actual. Su URL predeterminada del
   panel ya está cambiada a GitHub Pages.
5. Ejecuta `/start` en Telegram o vuelve a registrar el botón del menú para que
   apunte a `https://esenciacafe.github.io/EsenciaBot/`.
6. Verifica la apertura tanto desde un navegador como desde el botón del bot.

Antes de publicar, ejecuta las pruebas del repositorio y confirma que no se están
subiendo tokens, claves secretas ni archivos `.env`.
