# Moskas Brain Extension 0.1

Extensión experimental de Chrome que ejecuta localmente el cerebro FlyWire de la mosca del propietario y sincroniza su cuerpo con el servidor de Moskas.

## Estado

La versión 0.1 usa un token de dispositivo revocable, un documento offscreen y un Web Worker. Negocia el stream v3 del jardín y conserva compatibilidad con servidores v1/v2. La web del propietario tiene prioridad sobre la extensión.

Al abrir el icono de la extensión durante una sesión activa, el popup muestra una representación animada de la mosca con sus colores de adopción, nombre, acción corporal actual, estado y energía. El movimiento se deriva de la postura que ya produce la simulación y respeta `prefers-reduced-motion`.

Tras introducir el token y pulsar **Iniciar cerebro** una vez, la extensión guarda la activación en este navegador. El popup puede cerrarse: el cerebro continúa en el documento offscreen, se reconecta con espera progresiva si se corta la red y vuelve a arrancar automáticamente al abrir Chrome. **Detener** desactiva también los siguientes arranques automáticos.

Cuando la propietaria entra en el jardín desde `moscas.lol`, el servidor detiene el runner de la extensión sin permitir que vuelva a expulsar a la web. La extensión libera sus workers y comprueba cada 15 segundos `GET /api/device/state?view=control`. Esta respuesta mínima no renueva la presencia de un cerebro inactivo. Retoma automáticamente el control al salir de la web; puede tardar hasta unos 15 segundos, más la carga del cerebro.

El stream v3 transmite diferencias compactas y cambios privados de las moscas controladas. Si falta una secuencia o se acumulan 512 kB en la cola de salida, se reconecta para obtener un estado íntegro. Se conservan las correcciones y las acciones compradas. Los checkpoints corporales se guardan cada 10 segundos y al detener el runner; un cierre abrupto puede perder ese último intervalo. En reposo envía una observación por segundo; en movimiento conserva la cadencia de 750 ms de la extensión, adelantando cambios de conducta/vuelo y enviando una trayectoria acotada para validar colisiones. Los reintentos de red tienen espera progresiva.

Como el cliente web, la extensión puede acoger temporalmente cerebros de moscas desconectadas. Anuncia automáticamente una capacidad de 0 a 3 moscas extra según los hilos de CPU, memoria estimada, ahorro de datos y tipo de puntero del dispositivo. Los cerebros extra funcionan a 5 Hz, se cargan uno a uno, reducen la capacidad si el cálculo se vuelve lento y se devuelven en cuanto regresa su propietaria.

## Desarrollo

Requiere Node.js 22 y npm. La compilación actual genera únicamente el cliente de Chrome.

```bash
npm ci
npm run test:e2e:install
npm run check
```

Playwright descarga su propio Chromium de pruebas en una caché y usa perfiles temporales.
No hace falta instalar Google Chrome como navegador. `npm run build` genera `dist/` si
solo necesitas compilar la extensión.

`npm run check` comprueba los límites entre capas, ejecuta las pruebas, verifica los tipos,
compila la extensión, prueba la extensión real en Chromium headless y realiza la auditoría
pública. El comando se puede ejecutar localmente o integrar en el sistema de CI que se
elija; por ahora no hay ningún proveedor de CI configurado.

## Pruebas de navegador

`npm run test:e2e` compila y carga la extensión real en Chromium. Comprueba el popup,
la edición del formulario, la validación del token, el documento offscreen y la persistencia
del estado desactivado al reiniciar. No usa un servidor simulado ni inicia una sesión.

Para probar una sesión completa, proporciona `MOSCAS_DEVICE_TOKEN` como variable de entorno
y ejecuta `npm run test:e2e:live`. Esta prueba se conecta directamente a **https://moscas.lol**
y ejecuta el cerebro real. No forma parte del CI ni de `npm run check`; sin token falla
con un mensaje explícito. Se comprueban conexión, continuidad sin popup, reconexión,
reanudación tras reiniciar y parada. La suite también corta el transporte TCP y bloquea
el tráfico sin cerrar conexiones mediante un proxy CONNECT local, siempre contra moscas.lol.
No descifra TLS ni simula respuestas del servidor. `npm run test:e2e:outage` ejecuta
solo los escenarios de corte, recuperación y cancelación.

El runner limita las peticiones HTTP a 15 segundos, la espera de bienvenida a 20 segundos
y el silencio del servidor a 45 segundos. Al detectar un corte libera los cerebros y
reconecta con espera creciente hasta 30 segundos. **Detener** cancela también peticiones
pendientes para evitar arranques tardíos cuando vuelve la red.

La prueba real utiliza tu mosca: deja libre su control cerrando el jardín y deteniendo
otros clientes. No pegues el token en archivos del repositorio. No se guardan trazas,
vídeos ni capturas, y el perfil con sus credenciales se elimina al terminar normalmente
o tras un fallo de prueba. Si el proceso se termina de forma forzosa, puede quedar un
directorio temporal `moskas-playwright-*` que debe eliminarse.

La extensión Firefox se verificará manualmente. El soporte de extensiones de Playwright
utilizado aquí es exclusivo de Chromium; no se configura un proyecto Firefox que dé
una falsa impresión de cobertura. Consulta [la guía de pruebas](docs/PRUEBAS.md).

## Organización del código

- `src/core/`: simulación, protocolo, contratos HTTP y coordinación del cerebro. No depende de Chrome, del DOM ni de una interfaz gráfica.
- `src/adapters/web/`: implementaciones con Web Worker, fetch, WebSocket y temporizadores. Pueden reutilizarse en otros clientes compatibles con estas APIs.
- `src/clients/chrome/`: background, documento offscreen, mensajes, almacenamiento y popup de Chrome.
- `src/brain/` y `public/brain/`: fuentes del kernel, adaptador neuronal, modelo y datos FlyWire con su procedencia y atribución.

Firefox y escritorio aún no están implementados. Se incorporarán como clientes del mismo
núcleo, aportando su ciclo de vida, almacenamiento y adaptadores de plataforma.
Consulta [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) antes de añadir un cliente o cambiar
estas responsabilidades.

El servidor de Moskas debe implementar `POST /api/device/simulation-ticket` y aceptar el ticket de un solo uso en `/ws/device`.

La referencia pública de endpoints, autenticación, mensajes WebSocket y tipados disponibles está en [`docs/MOSCAS_PUBLIC_CONTEXT.md`](docs/MOSCAS_PUBLIC_CONTEXT.md).

## Código copiado

La simulación, el adaptador FlyWire y los assets se copiaron inicialmente de Moskas en el commit `eefebcbd7b0b5d0b14ce2749916db54ec5787e6d`. El protocolo público y los cerebros voluntarios se comprobaron después contra `b2103b92c30259db775942597af14955dd4a9c81`. Para la 0.1 se mantienen como una instantánea local, sin paquetes compartidos; [`docs/upstream-snapshot.json`](docs/upstream-snapshot.json) registra la procedencia exacta.

## Seguridad

- La extensión nunca solicita ni guarda la contraseña de la cuenta.
- El token se guarda en `chrome.storage.local`, no se sincroniza entre navegadores.
- No hay content scripts ni permiso para leer páginas visitadas.
- El token puede revocarse desde la cuenta de Moskas.
- `npm run audit:public` impide versionar claves privadas, paquetes firmados, tokens reales o URIs de MongoDB con credenciales.

## Licencias y atribución

El kernel `snedea/flybrain` conserva su licencia MIT en `licenses/flybrain-MIT.txt`. Los datos derivados de FlyWire requieren atribución CC BY 4.0; consulta `public/brain/NOTICE.txt`. La licencia del código propio de esta extensión está pendiente de elección antes de publicar el repositorio.
