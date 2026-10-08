# Arquitectura de los clientes Moskas

El repositorio mantiene un núcleo común para la extensión de Chrome y los futuros
clientes de Firefox y escritorio. Por ahora se compila y distribuye solo Chrome.
Las capas viven en un proyecto TypeScript y una instalación de npm; no necesitan
paquetes publicados ni herramientas de monorepo.

## Capas y dependencias

```text
src/
  core/
    runner.ts             Sesión, simulación, reconexión y cesión de control
    volunteer.ts          Cerebros voluntarios
    ports.ts              Contratos que debe proporcionar cada cliente
    types.ts              Configuración, estado y retrato de la mosca
    simulation/           Física, sentidos, comportamiento y protocolo
    api/                  Contratos HTTP y errores de respuesta
  adapters/web/
    device-client.ts      HTTP y WebSocket mediante las APIs web
    flywire.ts            Ciclo de vida del Web Worker y carga de assets
    clock.ts              Relojes y temporizadores cancelables
    volunteer-capacity.ts Detección de recursos del entorno web
  clients/chrome/
    background.ts         Persistencia, arranque y documento offscreen
    offscreen.ts          Construcción del runner y enlace de mensajes
    messages.ts           Mensajes y configuración propios de la extensión
    popup/                Interfaz del cliente Chrome
  brain/                  Fuentes y modelo neuronal copiados de upstream
```

La dirección de las dependencias es `clientes → adaptadores → núcleo`.
Los clientes también pueden importar directamente el núcleo. El núcleo no importa
clientes ni adaptadores; los adaptadores no importan clientes. `npm run check:architecture`
comprueba las importaciones estáticas y detecta APIs de navegador o extensión fuera
de su capa. Los tipos del protocolo y las fórmulas de simulación se han trasladado sin
modificar su contenido.

## Contrato del runner

`MoskaRunner` recibe un objeto `RunnerDependencies`:

| Dependencia | Responsabilidad |
| --- | --- |
| `device` | Obtener tickets, abrir la conexión y consultar si otra sesión controla la mosca |
| `createBrain(tickRate)` | Construir un cerebro independiente para la propietaria o una mosca voluntaria |
| `clock` | Tiempo monotónico para simulación, tiempo Unix para mensajes y temporizadores cancelables |
| `volunteerCapacity` | Límite de cerebros extra que ofrece este cliente |
| `onStatus` | Entregar el estado al almacenamiento o a la interfaz del cliente |

El cliente llama a `start({ serverUrl, token })`, `stop()` y `snapshot()`. La decisión
de recordar la activación, arrancar con el sistema o conservar el token pertenece
al cliente. El núcleo no conoce `chrome.storage`, IPC ni ventanas.

La implementación de `DeviceClient.connect` debe devolver la conexión antes de emitir
eventos. Un ticket es efímero y solo se usa en esa conexión. El token de dispositivo
se envía únicamente en las cabeceras de los endpoints autenticados.

Cada temporizador devuelve una función de cancelación para evitar exponer identificadores
distintos entre navegador y Node. `stop()` cancela los temporizadores, cierra la conexión
y libera los cerebros. También aborta peticiones HTTP mediante la señal del contrato
`DeviceClient`. Los resultados de una sesión sustituida o detenida se descartan.

`src/core/connection-policy.ts` define límites de producción: HTTP 15 s (incluido el
cuerpo de la respuesta), bienvenida 20 s, silencio del servidor 45 s y backoff máximo
30 s. El límite de bienvenida no se renueva con mensajes que no sean `WELCOME`.
Después de la bienvenida, cada mensaje recibido renueva el límite de silencio; no se
añaden mensajes ping ni cambios al protocolo del servidor. Al agotarse el límite se
cierra la conexión y se liberan cerebro, voluntarios, simulación y estado local antes
de reintentar. El backoff solo se reinicia después de inicializar el cerebro de una
sesión utilizable. Cierres del servidor con código 4001/4002 siguen cediendo el control
mediante consultas; los demás cierres se recuperan mientras el runner esté activado.

## Adaptadores web y assets

`FlyWireAdapter` recibe una función para resolver rutas de assets. Chrome pasa
`chrome.runtime.getURL`; otro cliente web puede aportar su propio origen de assets.
El worker y el conectoma se cargan localmente. El script `prepare:brain` sigue generando
`public/brain/flywire-worker.js` desde `src/brain/`; no hay cambios en el kernel ni el modelo.

Los adaptadores web requieren las APIs web que utilizan. Su existencia no garantiza que
un proceso Node o una ventana oculta pueda ejecutarlos sin adaptación. Un cliente de
escritorio debe proporcionar un cerebro compatible con su proceso de ejecución y comprobar
que el sistema no suspende la simulación al cerrar u ocultar la interfaz.

Los mensajes recibidos mantienen el contrato de la versión 0.1: se analiza JSON y se usan
los tipos del protocolo; no se añade validación completa de mensajes del servidor en esta
refactorización. Las reglas de autoridad del servidor permanecen sin cambios.

## Incorporar otros clientes

1. Crear `src/clients/firefox/` o `src/clients/desktop/` con sus entradas y configuración de compilación.
2. Reutilizar `MoskaRunner` e implementar sus dependencias con adaptadores apropiados.
3. Mantener el almacenamiento, los permisos, el arranque y los mensajes internos en el cliente.
4. Validar la ejecución continua, la suspensión del sistema y la reconexión en la plataforma real.
5. Comprobar la autenticación y los orígenes admitidos por moscas.lol, y la cesión de control entre clientes.

No se debe copiar el bucle de simulación ni el protocolo para cada plataforma. Tampoco
debe incorporarse Electron, una API de Firefox o un almacén de credenciales al núcleo.
La interfaz actual permanece en Chrome hasta que otro cliente necesite compartir partes
concretas de ella.

## Verificación y actualizaciones de upstream

`npm run check` ejecuta los límites de arquitectura, las pruebas unitarias, la
comprobación de tipos, el build, Playwright en Chromium y la auditoría pública. Las pruebas unitarias ejercitan el runner
sin Chrome ni DOM y sustituyen el transporte y los cerebros por implementaciones de prueba.
Cubren inicio/parada, cesión de control, reconexión, cancelación de operaciones pendientes
y el contrato de los adaptadores web.

Playwright carga `dist/` con el manifiesto, el service worker y el documento offscreen
reales en su propio Chromium, sin requerir Chrome instalado. Los controles sin sesión
forman parte del CI. `npm run test:e2e:live` utiliza un token proporcionado por entorno
y se conecta a moscas.lol sin servidor simulado ni sustitución del cerebro. Los detalles
y los límites de cobertura están en [`PRUEBAS.md`](PRUEBAS.md).

La copia de upstream sigue registrada en `docs/upstream-snapshot.json`. Al actualizarla,
comparar protocolo y simulación con la versión de Moscas correspondiente y conservar
las adaptaciones locales de inyección de dependencias. No sustituir el núcleo por una
copia completa del cliente web. Mantener las licencias y los avisos de FlyWire.
