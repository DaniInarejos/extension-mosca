# Contexto público de integración con moscas.lol

Esta es la referencia de integración para la extensión 0.1. Describe únicamente contratos observables y autorizados para clientes normales. No contiene credenciales, direcciones internas de infraestructura, datos de usuarios ni contratos administrativos.

## Origen y transporte

- Origen canónico: `https://moscas.lol`.
- API HTTP: `/api/*`.
- Jardín WebSocket para la extensión: `/ws/device?ticket=<ticket efímero>`.
- JSON es el formato de las peticiones HTTP y los mensajes WebSocket.
- Los errores HTTP tienen la forma `{ "error": string }`.

La extensión no debe conocer la dirección real del backend ni saltarse el proxy público. Las únicas excepciones del manifiesto son `localhost` y `127.0.0.1` para desarrollo.

## Autenticación adecuada para la extensión

La extensión usa exclusivamente un token revocable con prefijo `fly_device_`. El token se envía en `Authorization: Bearer <token>` solo al solicitar acceso y permanece en `chrome.storage.local`.

1. `POST /api/device/simulation-ticket` valida el token.
2. El servidor devuelve `{ ticket, expiresAt }` con un ticket aleatorio, válido durante 60 segundos y utilizable una sola vez.
3. La extensión abre `wss://moscas.lol/ws/device?ticket=...` desde un origen `chrome-extension://` o `moz-extension://`.
4. El servidor consume el ticket durante el upgrade WebSocket.

La extensión nunca solicita email o contraseña, no lee la cookie de sesión de la web y no guarda tickets WebSocket.

La conexión web tiene prioridad. Si existe un WebSocket de navegador para la misma propietaria, `/ws/device` se cierra con el código `4002`. La extensión libera los cerebros locales, muestra el estado de control cedido y consulta `GET /api/device/state` cada cinco segundos. Solo solicita un ticket nuevo cuando `fly.connected` vuelve a ser `false`.

## Endpoints disponibles

### Públicos, sin autenticación

| Método | Ruta                         | Respuesta / tipo | Uso posible                                   |
| ------ | ---------------------------- | ---------------- | --------------------------------------------- |
| `GET`  | `/api/health`                | `HealthResponse` | Salud y diagnóstico público del servicio.     |
| `GET`  | `/api/ready`                 | `ReadyResponse`  | Confirma que el jardín terminó de arrancar.   |
| `GET`  | `/api/world`                 | `WorldState`     | Instantánea pública inicial del jardín.       |
| `GET`  | `/api/world/live?since=<ms>` | `WorldDelta`     | Cambios públicos posteriores a un reloj Unix. |

### Autenticados con token de dispositivo

| Método   | Ruta                            | Entrada                       | Respuesta / tipo                 |
| -------- | ------------------------------- | ----------------------------- | -------------------------------- |
| `POST`   | `/api/device/simulation-ticket` | Cabecera Bearer               | `DeviceSimulationTicketResponse` |
| `GET`    | `/api/device/state`             | Cabecera Bearer               | `DeviceStateResponse`            |
| `POST`   | `/api/device/state`             | `DeviceBrainTelemetryRequest` | `DeviceStateResponse`            |
| `DELETE` | `/api/device/state`             | Cabecera Bearer               | `{ ok: true }`                   |

`/api/device/state` es el contrato ligero para pantallas compañeras. La extensión usa el WebSocket porque ejecuta la simulación completa; puede usar el `GET` como diagnóstico o fallback sin convertirlo en un segundo bucle de simulación.

### Exclusivos del cliente web con cookie de sesión

El servidor también ofrece sesión, registro/login, adopción, eventos, dashboard, puntos, tienda y gestión de dispositivos bajo `/api`. Son contratos del sitio web y no deben llamarse desde la extensión con email/contraseña ni intentando reutilizar cookies. La vinculación y revocación del token se realiza siempre desde la cuenta en `moscas.lol`.

Las operaciones administrativas quedan deliberadamente fuera de esta referencia y de la instantánea de tipos de la extensión.

## Protocolo WebSocket del jardín

Los esquemas y tipos fuente viven en [`src/simulation/protocol`](../src/simulation/protocol). El servidor valida estrictamente cada mensaje.

### Extensión → servidor

| Mensaje              | Propósito                                                              |
| -------------------- | ---------------------------------------------------------------------- |
| `FLY_STATE`          | Posición, velocidad, rotación y postura de la mosca propietaria.       |
| `FLY_ACTION`         | Solicitud contextual `FEED` o `DRINK`; el servidor vuelve a validarla. |
| `BODY_CHECKPOINT`    | Memoria corporal acotada, disponible para futuras versiones.           |
| `CHAT_SEND`          | Chat del jardín, disponible pero no usado por la 0.1.                  |
| `VOLUNTEER_CAPACITY` | Capacidad automática para 0–3 cerebros adicionales.                    |
| `VOLUNTEER_STATES`   | Estados de las moscas acogidas junto con lease y época.                |

### Servidor → extensión

| Mensaje                    | Propósito                                                   |
| -------------------------- | ----------------------------------------------------------- |
| `WELCOME`                  | Mosca propietaria, mundo, eventos y chat iniciales.         |
| `WORLD_STATE`              | Estado autoritativo periódico del jardín.                   |
| `WORLD_DELTA`              | Variante incremental del mundo para protocolo 2.            |
| `CORRECTION`               | Corrección autoritativa de un movimiento rechazado.         |
| `EVENT`, `EVENT_HISTORY`   | Momentos registrados de la vida.                            |
| `CHAT_MESSAGE`             | Mensaje aceptado del chat global.                           |
| `POINTS_UPDATE`            | Saldo y progreso actualizados.                              |
| `SIMULATION_LEASES`        | Moscas desconectadas asignadas al dispositivo voluntario.   |
| `SIMULATION_LEASE_REVOKED` | Devolución de una mosca a su propietaria o al modo offline. |
| `ERROR`                    | Error de protocolo legible.                                 |

El servidor mantiene la autoridad: valida velocidad, colisiones, identidad, lease, época, caducidad, comida, bebida, energía y muerte. La extensión nunca decide resultados persistentes por sí sola.

## Tipos copiados para la versión 0.1

- `index.ts`: mundo, mosca, cuerpo, sentidos, mensajes, leases y esquemas Zod.
- `appearance.ts`: paleta e identidad visual.
- `natural-events.ts`: fenómenos visibles del jardín.
- `points.ts`, `shop.ts`: contratos públicos que llegan por el protocolo aunque la extensión todavía no los muestre.
- `presence.ts`, `user.ts`, `world-delta.ts`: presencia, roles visibles en chat y deltas del mundo.
- [`src/api/public-contract.ts`](../src/api/public-contract.ts): respuestas HTTP útiles para una extensión o dispositivo normal.

Esta copia evita una librería compartida durante la 0.1. Al actualizarla hay que comparar con `packages/protocol` del proyecto Moscas, revisar el diff manualmente, excluir contratos privilegiados y ejecutar:

```bash
npm run typecheck
npm run build
npm run audit:public
```

La procedencia exacta y la revisión de Moscas usada para comprobar cada copia están registradas en [`upstream-snapshot.json`](upstream-snapshot.json).

## Información que puede salir del navegador

La extensión transmite únicamente el token durante el intercambio inicial, movimiento y postura de las moscas, acciones `FEED`/`DRINK`, capacidad voluntaria y estados de leases. El conectoma, los potenciales internos, el historial de navegación y el contenido de otras páginas no se envían.

Nunca deben versionarse tokens reales, cookies, contraseñas, claves de firma, archivos `.pem`, paquetes `.crx` firmados, URIs de base de datos ni direcciones privadas de despliegue.
