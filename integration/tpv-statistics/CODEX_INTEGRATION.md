# Integrar las estadísticas de EsenciaBot en EsenciaTPV

## Objetivo

Añadir al TPV una sección administrativa llamada `Estadísticas` reutilizando la API ya desplegada
por EsenciaBot. No se debe duplicar en el TPV la lógica que suma tickets, vaciados, toppings o
modificadores.

## Archivos disponibles

- `esencia-statistics-client.js`: cliente independiente para autenticación y consultas.
- `../../dist/index.html`: estructura de las tres vistas actuales.
- `../../dist/app.js`: renderizado y comportamiento de filtros, rankings y detalle de vaciados.
- `../../dist/styles.css`: estilos actuales del panel, que deben adaptarse al diseño del TPV.

## Cómo integrarlo

1. Inspecciona primero la arquitectura, rutas, autenticación, componentes y estilos existentes del TPV.
2. Crea una sección accesible solo para el propietario o personal con permiso administrativo.
3. Copia `esencia-statistics-client.js` al lugar apropiado del TPV o conviértelo a TypeScript sin
   alterar su contrato público.
4. Si el TPV ya dispone de una sesión Supabase del usuario autorizado, reutiliza su `access_token`.
   Si no, muestra el formulario de correo y contraseña usando `client.signIn(email, password)`.
5. Implementa las siguientes vistas dentro de la navegación existente:
   - Resumen: ventas, tickets, cobros, vaciados, productos y toppings.
   - Histórico de vaciados: filtros, paginación, detalle y estado contabilizado/excluido.
   - Modificadores: selección de producto, periodo y comparación con el periodo anterior.
6. Conserva los rangos `Hoy`, `Ayer`, `7 días`, `Este mes`, `12 meses` y fechas personalizadas.
7. Muestra siempre por separado `vendidos` y `vaciados`. Los totales y porcentajes combinan ambos.
8. `Plane`, `Plain` y MiniPancakes sin opciones deben mostrarse como `Sin Topping`.
9. No expongas claves `service_role`, claves secretas de Supabase ni el proyecto de auditoría en el
   navegador. La clave `sb_publishable_...` incluida es pública y está diseñada para clientes web.
10. No consultes directamente las tablas de auditoría: utiliza exclusivamente la Edge Function.

## Contrato de la API

Todas las peticiones son `POST`, incluyen `Authorization: Bearer <access_token>` y este cuerpo base:

```json
{
  "type": "web_app",
  "action": "overview"
}
```

### Resumen

```js
await client.overview({ period: 'today' });
await client.overview({ period: 'range', from: '2026-08-01', to: '2026-08-31' });
```

La respuesta contiene `sales`, `voids`, `top` y `toppings`. Los productos y toppings incluyen campos
separados de venta y vaciado.

### Histórico de vaciados

```js
await client.voidHistory({ from: '2026-08-01', to: '2026-08-31', page: 0 });
```

### Modificadores

```js
await client.modifierAnalysis({ from: '2026-08-01', to: '2026-08-31' });
```

Cada producto y modificador incluye `soldUnits`, `voidUnits`, `units`, porcentaje y comparación con
el intervalo anterior de la misma duración.

## Criterios de aceptación

- La sección funciona en escritorio y tablet sin afectar cobros, comandas ni KDS.
- Una cuenta no autorizada recibe `401` y no ve información.
- La sesión se conserva y se renueva sin pedir la contraseña en cada visita.
- Un cierre de sesión elimina los tokens locales.
- Todos los filtros devuelven los mismos resultados que el panel independiente.
- No aparecen secretos en el código cliente, consola, red o repositorio.
- Se ejecutan las pruebas existentes del TPV y se documentan los archivos modificados.
