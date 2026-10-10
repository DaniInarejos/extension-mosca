# Moscas para Windows y macOS

Compañero experimental que ejecuta el mismo `MoskaRunner` de la extensión sin
necesitar un navegador abierto. La ventana conserva el retrato y el estilo de Chrome.

## Uso

1. Crear un token de dispositivo en la cuenta de `https://moscas.lol`.
2. Abrir **Ajustes**, pegar el token `fly_device_…` y pulsar **Guardar token**.
   Guardar cifra la credencial sin iniciar el cerebro. Después, pulsar **Conectar**.
   Sin un token guardado, Conectar permanece deshabilitado y explica este requisito.
3. Cerrar u ocultar la ventana. La aplicación permanece en la bandeja de Windows o
   la barra de menús de macOS.
   **Mostrar ventana** recupera la interfaz.
4. **Desconectar** cierra la sesión, libera el runner y guarda la desactivación. Limpia
   la información de la mosca y del jardín. Conserva el token
   cifrado para el próximo **Conectar**. Ni despertar ni abrir de nuevo la aplicación
   vuelve a iniciarlo automáticamente.
5. **Salir** termina el proceso, cierra transportes y workers y libera el bloqueo de
   instancia. Conserva la activación elegida: si estaba activa, se reanudará al volver
   a abrir la aplicación. Para impedirlo, pulsar **Desconectar** antes de salir.

**Olvidar dispositivo** detiene la sesión y elimina la credencial cifrada. No revoca
el token en el servidor; su revocación se realiza en la cuenta web.

El arranque al iniciar sesión es opcional y está desactivado inicialmente. Se configura
mediante el sistema operativo y se muestra su valor real. Solo está disponible en la
aplicación empaquetada; no registra el ejecutable de desarrollo. Arranca sin mostrar
la ventana y respeta la activación guardada. No cambiar de ubicación una aplicación
registrada para inicio automático sin volver a configurar esta preferencia.

## El cerebro y el jardín

La aplicación no muestra una mosca flotante sobre el escritorio. El retrato y el
estado se consultan en la ventana; para observar la mosca se utiliza el jardín web.

La ventana principal se centra en iniciar/detener el cerebro y consultar su actividad.
El token se guarda desde Ajustes antes de conectar. Un token escrito pero sin guardar
no habilita Conectar; al cambiarlo hay que guardar el nuevo valor o vaciar el campo para
reutilizar el anterior. Guardar comprueba el formato y el cifrado local; el servidor
valida la credencial al conectar. **Olvidar dispositivo** vuelve a bloquear Conectar.
Un único botón alterna **Conectar** y **Desconectar**, con una explicación de cómo
inicia o detiene el cerebro local y conserva el token al cerrar la sesión.
Con la sesión activada muestra, en la cabecera de la tarjeta de la mosca, la fase del día y
temperatura, calculado con el mismo reloj del jardín recibido por el stream. Los datos
de más de 90 s se marcan como antiguos. **No hay eventos, recompensas, historial ni
consultas públicas de respaldo**: con el cerebro apagado la interfaz muestra **Sesión
cerrada** y no consulta la mosca ni el jardín. El núcleo solo conserva el resumen del
reloj; no acumula un historial de eventos para la interfaz.

El botón destacado **Abrir el jardín** abre `https://moscas.lol` en el navegador
predeterminado, donde se encuentran la tienda y los eventos. Usa la sesión del navegador;
no importa cookies ni transmite el token al navegador. Abrir el jardín autenticado puede
ceder el control a la web.

### Ver mi cerebro

La sección **Ver mi cerebro** es opcional y se abre dentro de la ventana de detalles.
Muestra los disparos por tick, grupos activos, salida motora y una forma cerebral en
perspectiva con dos hemisferios, pliegues y 1.280 puntos representativos de grupos.
No dibuja individualmente las 139.255 neuronas ni afirma reproducir su anatomía. Se
puede girar arrastrando o con botones accesibles y recuperar la vista inicial con
**Centrar**. El lienzo compacto de 180 píxeles de alto representa todos los grupos
simultáneamente, sin selector ni énfasis en un grupo elegido. Verde indica disparos; ocre indica procesamiento
subumbral señalado por el kernel. Sin una muestra reciente no se inventa actividad.

Los enlaces se calculan durante el build a partir del mismo `connectome.bin.gz` local:
se agregan conexiones entre grupos y se conservan hasta tres salidas principales por
grupo. Las posiciones son esquemáticas, no coordenadas anatómicas. Se mantienen las
licencias y avisos del modelo FlyWire; no se descarga otro cerebro para la visualización.

La ventana solicita únicamente telemetría del cerebro propietario mediante un canal IPC
de lectura, separado del snapshot habitual. No mezcla voluntarias, no inicia otra
simulación y no envía esta información por red. Hay como máximo una lectura pendiente,
a 10 Hz con la sección visible y a 1 Hz con movimiento reducido. El lienzo se dibuja
a un máximo de 30 fps, independientemente del muestreo. La rotación suave y los pulsos
solo avanzan con actividad reciente; arrastrar fija la orientación elegida. Movimiento
reducido elimina la rotación automática y los pulsos en tránsito. Cerrar la sección,
ocultar la ventana o sacar el lienzo de la vista cancela el muestreo y el dibujo; el
cerebro conserva su ciclo de vida independiente. Un tick detenido durante más de dos
segundos se muestra como señal antigua, y Desconectar o una nueva sesión limpian el historial.

### Compatibilidad del handshake de dispositivo

El transporte nativo envía un `Origin` con formato `chrome-extension://…` y un
identificador estable derivado del appId de escritorio. El servicio desplegado lo
exige para aceptar el ticket de dispositivo: en la comprobación real del 9 de octubre,
la ausencia de Origin, `null` y el origen de la web recibieron HTTP 401, mientras el
origen de extensión recibió HTTP 101. Es una cabecera de compatibilidad; no implica
que exista una extensión instalada ni sustituye la autenticación mediante token y
ticket de un solo uso. Solo se añade en el adaptador desktop; el núcleo y Chromium
conservan su transporte. No se reutilizan cookies ni se inicia sesión en la web.

## Runtime y modelo de ejecución

Se utiliza **Electron 44**, con TypeScript y una ventana pequeña sin framework de UI.
Electron tiene un coste de descarga y memoria mayor que una interfaz nativa o Tauri.
A cambio, incorpora Node y Chromium, comparte el lenguaje del núcleo y proporciona
bandeja, instancia única, energía, arranque y almacenamiento seguro para ambos sistemas.
Tauri reduciría el contenedor, pero exigiría otro runtime o un sidecar para el cerebro
JavaScript y un puente adicional de ciclo de vida. No se ha reescrito la simulación.

- `MoskaRunner`, temporizadores y transporte HTTP/WebSocket viven en el proceso
  principal Node de Electron, fuera de la ventana.
- Cada cerebro usa un `worker_threads.Worker`, no un Web Worker del renderer.
- El build antepone un puente `parentPort` al worker FlyWire generado. No cambia el
  kernel LIF, el modelo, el readout ni las ecuaciones de simulación.
- El conectoma y la lateralidad se leen del disco local. En el paquete se encuentran
  en `resources/app.asar.unpacked/brain/`, con sus avisos y licencias.
- La ventana solo consulta snapshots y envía órdenes mediante un preload pequeño.
  Sus timers pueden ralentizarse estando oculta sin afectar al cerebro. Incluso la
  destrucción de la ventana deja vivo el runner.
- Mientras se carga o está online se mantiene `prevent-app-suspension`; permite apagar
  la pantalla, pero evita la suspensión automática por inactividad durante la sesión.
  No impide la suspensión explícita ni cerrar la tapa. Aumenta el consumo respecto a
  dejar dormir el equipo. **Desconectar** y la cesión de control liberan el bloqueo.
- `powerMonitor.suspend` libera la sesión sin cambiar la activación persistida;
  `resume` obtiene un ticket y una baseline nuevos. No intenta simular el tiempo dormido.
- La caída de un worker libera el runner y programa un reinicio cancelable de 5 s.

La capacidad voluntaria usa CPU y RAM del sistema, con un máximo de tres cerebros
extra. El núcleo mantiene su reducción dinámica de capacidad y la cadencia de 5 Hz
para voluntarias. El renderer no realiza peticiones de red. La información mostrada
procede exclusivamente de la sesión del runner.

## Transporte y autoridad

El adaptador Node usa Undici, con validación TLS normal y el origen fijo
`https://moscas.lol`. No utiliza cookies de la web ni credenciales de usuario. Envía la cabecera Origin
de compatibilidad documentada arriba. Comparte con Chrome el intercambio de tickets, WebSocket
`protocol=3`, las consultas `view=control`, el límite de salida de 512 kB y los errores
HTTP. El núcleo mantiene el comportamiento v3, incluidos `GardenStream`, secuencias,
`ObservationCadence`, correcciones y voluntariado.

Se mantienen HTTP 15 s (cabeceras y cuerpo), bienvenida 20 s, silencio 45 s y backoff
hasta 30 s. Cada WebSocket Node tiene su propio dispatcher; al cerrarlo se concede
hasta 1 s al cierre ordenado/checkpoint antes de destruir un transporte atascado.
Salir destruye todos los dispatchers. Los checkpoints al finalizar son de mejor
esfuerzo, igual que ante un cierre abrupto del cliente web.

Los códigos 4001/4002 liberan los cerebros y esperan a que la mosca quede libre.
No se solicitan tickets para expulsar a la web ni a otra sesión mientras esta conserve
el control. Se reutiliza la consulta ligera cada 15 s del runner común. Los arranques
automáticos y despertares usan `startWhenAvailable`: primero consultan la disponibilidad
sin solicitar un ticket, incluso si una consulta falla. Una conexión explícita conserva
la semántica habitual del cliente de dispositivo.

## Credenciales y límites de seguridad

`settings.json`, dentro de `app.getPath('userData')`, contiene versión, activación y
el token cifrado. Las preferencias de la mosca flotante de versiones preliminares se
ignoran sin perder el token ni la activación y desaparecen en la siguiente escritura. Se escribe mediante un archivo temporal y renombrado, con permisos 0600
cuando el sistema los admite. La aplicación obtiene el bloqueo de instancia antes de
leer o modificar el perfil. Una configuración ilegible no arranca automáticamente ni
se sobrescribe al abrirla.

`safeStorage` cifra mediante Keychain en macOS y DPAPI en Windows. No hay fallback a
texto plano si el almacén no está disponible. DPAPI protege frente a otros usuarios,
pero no garantiza aislamiento de otros procesos del mismo usuario. En macOS, builds
sin una firma estable pueden volver a pedir permiso para el llavero. Para distribución
regular debe usarse una identidad de firma estable.

La credencial descifrada solo se usa en memoria en el proceso principal. El renderer
puede enviar un token nuevo, pero nunca recibe el token guardado; el campo se vacía
tras iniciar y al ocultarse. No se guardan tickets, logs de red, volcados propios,
trazas, capturas o vídeos de sesiones autenticadas. La aplicación no inicia un
crash reporter. Los errores de transporte se presentan con texto genérico, evitando
propagar URLs de tickets o cuerpos remotos por IPC. Los HTTP 401/403 muestran una
instrucción local para volver a vincular un token válido.

El renderer tiene sandbox, aislamiento de contexto, Node desactivado, CSP restrictiva,
red bloqueada, permisos denegados y navegación/ventanas nuevas bloqueadas. IPC acepta
solo el frame principal del documento local correspondiente y valida los argumentos.
No se exponen
canales IPC arbitrarios ni APIs de archivos o shell; abrir la web solo admite la URL fija
de moscas.lol, nunca una dirección proporcionada por el renderer.

Si el disco no permite guardar **Desconectar**, el runner se libera inmediatamente y se
muestra el fallo. La desactivación en el siguiente arranque no puede garantizarse
hasta corregir ese error de persistencia; salir y reparar los permisos del perfil.
La pérdida abrupta de alimentación conserva la última configuración escrita completa.

## Desarrollo y paquetes

Node.js 22 o posterior y npm. Los scripts conservan `npm run build` para Chrome.

```bash
npm ci
npm run dev:desktop
npm run build:desktop
npm run test:desktop
npm run test:desktop:live
```

`dist-desktop/` contiene el programa ejecutable mediante `npx electron dist-desktop`.
`dev:desktop` realiza un build y abre la aplicación; no introduce un servidor de
recarga ni hot reload en el proceso de simulación. Tras cambiar código, salir y
volver a ejecutar el comando. `MOSCAS_DESKTOP_PROFILE` permite un perfil de desarrollo
separado, solo en builds sin empaquetar. No pasar tokens por argumentos del proceso.

Crear instaladores en su sistema de destino:

```bash
# macOS: elegir --arm64, --x64 o ambas arquitecturas
npm run package:desktop -- --mac --arm64
# Windows: NSIS por usuario
npm run package:desktop -- --win --x64
# Paquete sin instalador para inspección local
npm run package:desktop -- --dir
```

Los resultados van a `release-desktop/`, excluido de Git. El builder usa ASAR con el
cerebro fuera del archivo, incluye las licencias y nunca publica automáticamente.
La configuración ofrece macOS arm64/x64 (DMG/ZIP) y Windows x64/arm64 (NSIS).
Construir para una arquitectura no demuestra su funcionamiento en ese equipo.

No se incluyen certificados, firma de Windows, credenciales Apple ni configuración de
notarización. Configurarlos fuera del repositorio para una distribución pública firmada.
Los paquetes locales sin firma no representan una validación de Gatekeeper/SmartScreen.
No se configura ningún proveedor de CI ni Firefox.

## Pruebas y evidencia

`npm run check` incorpora unitarias, arquitectura, tipos, ambos builds, cinco smoke
checks de Chromium y las pruebas Electron sin autenticación, además de la auditoría
pública. No requiere una instalación de Chrome. En macOS/Windows necesita una sesión
gráfica; los tests Electron no son un proceso headless puro.

Las unitarias cubren activación/restauración, Desconectar durante suspensión o recuperación,
Quit, pérdida del almacén seguro, archivo dañado, Olvidar y errores de escritura. El
adaptador neuronal se prueba con conectoma y kernel reales en Node: carga, avance de
ticks, cancelación y ausencia de assets.

Los smoke tests de Electron usan el ejecutable real y perfiles temporales. Comprueban
preload aislado, credencial inválida sin conexión, ocultar/cerrar, Salir, instancia
única, persistencia de Desconectar y un roundtrip real de `safeStorage`. Una configuración
antigua con la mosca flotante activada conserva credencial y activación, pero no crea
ventanas adicionales ni ofrece controles para esa función retirada. La prueba real
comprueba que durante la sesión solo existe la ventana principal.

`npm run test:desktop:live` exige `MOSCAS_DEVICE_TOKEN` y conecta exclusivamente con
moscas.lol. No crea un servidor simulado. Los escenarios de ciclo de vida y cortes
emplean el proxy CONNECT opaco existente; Undici envía tanto HTTP como WSS por ese
proxy. TLS no se termina en el fixture. La prueba visual conecta directamente y
contrasta el movimiento con la API pública del jardín.
`MOSCAS_DESKTOP_PROXY` es una opción solo de desarrollo para esa prueba, no un proxy
configurable desde la ventana ni desde los paquetes distribuidos.

Los seis escenarios autenticados comprueban:

- Ticks reales al ocultar, cerrar y destruir el renderer, además de snapshot/online.
- Cifrado del archivo, restauración activa, Desconectar persistido y eventos de suspensión.
- Dos cortes TCP, reinicio durante corte y recuperación con túneles nuevos.
- Silencio TCP, watchdog de 45 s, deadline HTTP y Desconectar durante un ticket atascado.
- Cesión a una extensión Chromium real y recuperación cuando esta se detiene.
- Arranque sin red conservando activación y recuperación cuando vuelve el enlace.
- Vista cerebral con ticks reales, una única ventana, limpieza al detener y movimiento
  confirmado en la posición publicada por el servidor.

Estos eventos de suspensión son inyectados sobre `powerMonitor`; no equivalen a dormir
físicamente el equipo. La cesión a otro dispositivo tampoco sustituye la comprobación
manual de prioridad de una sesión web con cookie.

Evidencia local del 9 de octubre de 2026, macOS arm64:

- 59 unitarias, cinco smoke tests Chromium y ocho smoke tests Electron.
- Cuatro escenarios Chromium autenticados pasaron contra moscas.lol, incluidos
  los tres escenarios de cortes, silencio y cancelación de transporte real.
- Consumo de comida y agua cubierto con el runner y la simulación reales en unitarias
  con cerebro aislado. Vista gráfica aislada de fruta/agua, retirada del accesorio y
  movimiento reducido comprobados; no equivale a verificar una comida en el servicio.
- Vista cerebral contrastada con el kernel local real y estímulos controlados: deja de
  consultar y dibujar al cerrarse mientras el kernel avanza y respeta movimiento reducido.
  Además, una sesión autenticada verifica los ticks en la ventana,
  el movimiento publicado en el jardín real y la retirada de actividad al pulsar Desconectar.
- Ambos builds, límites de arquitectura, tipos y auditoría pública correctos.
- Bundle macOS arm64 sin firma generado. Se lanzó el ejecutable empaquetado con un
  perfil temporal aislado: preload, mapa cerebral y disponibilidad del control de login
  correctos, sin guardar credenciales. Su conectoma empaquetado carga 139.255 neuronas
  y avanza ticks desde `app.asar.unpacked`.
- Bundle Windows x64 ensamblado desde macOS, sin editar recursos del ejecutable ni
  firmar. Esto comprueba la inclusión de assets; no se ha ejecutado en Windows.
- `npm audit --omit=dev`: sin vulnerabilidades de dependencias de ejecución.
- Tras restablecerse el endpoint público, el ticket real devuelve HTTP 201 y la
  extensión original alcanza HTTP 101 en `/ws/device?ticket=…&protocol=3`.
- El transporte desktop necesita el Origin de compatibilidad descrito arriba. Con él,
  la aplicación recibe la cesión de control a la web y queda en `paused`, sin workers
  ni bloqueo de energía. Desconectar la deja en `idle` con la activación deshabilitada;
  el perfil temporal se elimina al salir.
- Con la web cerrada, los seis escenarios desktop autenticados pasaron contra
  moscas.lol: ciclo de vida, cortes repetidos, silencio/cancelación, cesión y recuperación,
  arranque sin red y vista cerebral con movimiento confirmado por el servidor.
- La prueba de cancelación destruye los túneles previos antes del segundo stall para
  exigir un CONNECT nuevo: una conexión HTTP keep-alive puede quedar atascada sin
  incrementar el contador de conexiones nuevas. Se conservan los plazos reales y se
  comprueba que Desconectar evita reactivarse durante 17 s y después de reiniciar.

Revisión del 10 de octubre de 2026, macOS arm64:

- Retirada completa de la mosca flotante: ventana, preload, IPC, ajustes, menú,
  geometría, dependencia Three.js y assets de empaquetado.
- `npm run check`: 55 unitarias, cinco smoke tests Chromium y ocho Electron, con
  arquitectura, tipos, builds y auditoría pública correctos. Se retiraron las cuatro
  unitarias de la función eliminada; se comprueba la compatibilidad de perfiles antiguos.
- La sesión visual real confirma actividad de 139.255 neuronas, movimiento publicado
  por moscas.lol, una única ventana y limpieza al desconectar conservando el token.
  En el primer intento el contador visible quedó vacío aunque avanzaron los ticks;
  la repetición pasó sin cambios de código. No se considera resuelta esa intermitencia.
- Paquetes sin firma macOS arm64 y Windows x64 regenerados; ambos ASAR excluyen
  los bundles de la mosca flotante y la licencia de Three.js. El ejecutable macOS se
  abrió con un perfil temporal: preload, mapa cerebral compacto y bloqueo de Conectar
  sin token correctos. Windows no se ha ejecutado.
- No se repitieron las suites completas de cortes ni Chromium autenticado en esta
  revisión de interfaz; su evidencia corresponde al 9 de octubre.

Si se interrumpe forzosamente un test, eliminar su perfil temporal `moscas-desktop-*`
o `moskas-playwright-*` tras comprobar que el proceso ha terminado. En una ejecución
normal el teardown elimina perfiles y conexiones incluso cuando falla una aserción.

### Comprobaciones manuales por plataforma

- Windows x64/arm64: instalar, bandeja y menú, DPAPI, inicio de sesión real, desinstalar,
  procesos tras Salir, consumo sostenido, bloqueo de pantalla y suspensión física.
- macOS arm64/x64: menú claro/oscuro, instalación firmada, permisos Keychain tras una
  actualización, login real, App Nap, tapa/suspensión física y recuperación de Wi-Fi.
- Ambos: abrir el jardín web autenticado, observar cesión y recuperación al salir;
  comprobar periodos prolongados, ahorro de energía, cambio de red y token revocado.


Referencias oficiales: [modelo de procesos](https://www.electronjs.org/docs/latest/tutorial/process-model),
[safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage),
[powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor),
[powerSaveBlocker](https://www.electronjs.org/docs/latest/api/power-save-blocker),
[instancia única e inicio de sesión](https://www.electronjs.org/docs/latest/api/app).
