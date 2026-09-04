# Prompt para el Codex del TPV

Integra en este repositorio de EsenciaTPV el módulo completo de estadísticas incluido en la carpeta
`tpv-statistics` que te he proporcionado.

Lee primero `CODEX_INTEGRATION.md` y examina la arquitectura real del TPV antes de editar. Añade una
sección administrativa `Estadísticas` integrada visualmente con el TPV, con Resumen, Histórico de
vaciados y Modificadores. Reutiliza `esencia-statistics-client.js` y la API existente; no copies al TPV
la lógica de agregación ni consultes directamente la base de auditoría.

Mantén separados vendidos y vaciados, conserva todos los rangos de fechas, unifica `Plane` y las
raciones de MiniPancakes sin opciones como `Sin Topping`, y protege la sección para que solo accedan
cuentas con permiso. No expongas ninguna clave secreta o `service_role`.

Adapta componentes y estilos a los patrones ya existentes en EsenciaTPV. No alteres los flujos de
cobro, comandas, cierre de caja o KDS. Implementa la integración completa, ejecuta las pruebas y
entrégame un resumen de archivos cambiados, decisiones tomadas y cualquier paso manual pendiente.
