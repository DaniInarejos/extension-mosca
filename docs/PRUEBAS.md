# Pruebas de la extensión Chromium

## Preparación

```bash
npm ci
npm run test:e2e:install
npm run check
```

Playwright usa `channel: 'chromium'`, modo headless y un contexto persistente con un
perfil temporal por prueba. Carga `dist/` como extensión MV3 mediante
`--load-extension`; no sustituye las APIs de Chrome ni el manifiesto. La descarga
puede aparecer como «Chrome for Testing»: es el binario administrado por Playwright
dentro de su caché, no una instalación del navegador habitual ni su perfil personal.
No se instala Firefox ni WebKit.

En Linux se puede ejecutar `npx playwright install --with-deps chromium --no-shell`
para incluir las dependencias del sistema. No hay ningún proveedor de CI configurado;
`npm run check` queda disponible para una futura integración. La configuración mantiene las políticas
normales de ejecución en segundo plano, en lugar de desactivar su limitación de timers.

## Comandos

| Comando | Cobertura |
| --- | --- |
| `npm test` | Pruebas unitarias del núcleo y adaptadores |
| `npm run test:e2e` | Build y pruebas de la extensión sin sesión |
| `npm run test:e2e:live` | Build, ciclo de vida y cortes de red contra moscas.lol |
| `npm run test:e2e:outage` | Build y únicamente los escenarios de corte de red real |
| `npm run check` | Arquitectura, unitarias, tipos, build, E2E sin sesión y auditoría pública |

Las pruebas Playwright están en `tests/e2e/`; Vitest solo descubre `*.test.ts` y
Playwright usa `*.spec.ts`. La suite permanece en TypeScript junto con el proyecto.

## Cobertura sin token

- Carga del service worker MV3 y del popup con la configuración inicial correcta.
- Conservación de los campos editados durante la actualización periódica del estado.
- Rechazo local de un token incompleto sin solicitudes a moscas.lol ni creación de runner.
- Persistencia de la desactivación al reiniciar el navegador con el mismo perfil.
- Carga real del documento offscreen, respuesta de su listener y liberación desde el popup.

Estas pruebas no usan un servidor simulado. Tampoco prueban la autenticación, la carga
del conectoma ni el protocolo real: esas comprobaciones pertenecen a la sesión con token.

## Sesión real

El lanzador requiere `MOSCAS_DEVICE_TOKEN` con un token de dispositivo de la cuenta.
Proporciónalo mediante el entorno del proceso, sin guardarlo en código, capturas ni
archivos `.env` del repositorio. Después ejecuta:

```bash
npm run test:e2e:live
```

Sin token, el comando termina con error. El lanzador selecciona exclusivamente el
proyecto `chromium-live`. `npm run check`, `npm run test:e2e` y una ejecución ordinaria
de Playwright seleccionan solo los controles sin sesión, aunque exista un token en el
entorno. No definir `MOSCAS_E2E_LIVE` manualmente: es un selector interno del lanzador.

Se conecta directamente a `https://moscas.lol` con el token, obtiene un ticket, abre
el WebSocket y ejecuta el cerebro y los assets reales de `dist/`. No se interceptan
peticiones ni se simulan respuestas, workers o relojes. Para probar la reconexión,
CDP localiza el WebSocket del documento offscreen y cierra esa conexión real con código
4000; se espera a que el runner registre la desconexión y vuelva a estar online con una
mosca activa. El estado del popup por sí solo no basta, porque puede estar pendiente de refresco.
No se usa `context.setOffline()`: durante la validación no interrumpió el WebSocket
existente. Para cortes de transporte se utiliza además la suite descrita abajo.

La prueba de ciclo de vida comprueba, en una única sesión y sin reintentos automáticos:

1. Arranque desde la interfaz y presentación de la mosca conectada.
2. Continuidad del runner con el popup cerrado y recuperación de la interfaz al abrirlo.
3. Reconexión después de cerrar el WebSocket real.
4. Reanudación automática al reiniciar Chromium con el mismo perfil.
5. Parada desde el popup y ausencia de reanudación después del siguiente reinicio.

## Cortes de transporte contra el servicio real

`tests/e2e/outage-proxy.ts` abre un proxy CONNECT en `127.0.0.1` con puerto efímero
y permite únicamente el destino `moscas.lol:443`. Chromium usa este proxy para HTTPS
y WSS; QUIC se desactiva en estos perfiles para forzar TCP. TLS sigue negociándose entre
Chromium y moscas.lol: no se instalan certificados, no se descifran tokens ni tickets
y no se fabrican respuestas de la API. Solo se cuentan túneles e intercambios de bytes
cifrados. La red del resto del equipo no se modifica.

El modo **cut** destruye ambos extremos de cada túnel sin enviar un cierre WebSocket,
y rechaza conexiones nuevas. El modo **stall** mantiene el extremo de Chromium abierto
pero deja de transportar bytes, incluso si el servidor remoto cierra su extremo;
los nuevos intentos quedan atascados en la negociación TLS. Esto prueba el caso en el
que no llega un evento `close`. Al recuperar el enlace se descartan los túneles antiguos
y se permiten conexiones nuevas al servicio real.

| Escenario | Comprobación |
| --- | --- |
| Arranque sin red | No puede saltarse el proxy; conserva la activación y arranca cuando vuelve el servicio |
| Dos cortes durante una sesión sin popup | Sale de online, limpia la simulación y crea una conexión nueva con tráfico real al recuperar |
| Reinicio del navegador durante un corte | Conserva la activación y reanuda automáticamente al restablecer el enlace |
| Conexión silenciosa | El watchdog elimina el falso online y libera la simulación; un ticket atascado alcanza el timeout HTTP |
| Detener durante una petición atascada | Permanece desactivado y en idle, sin offscreen, durante todo el timeout y después de reiniciar |

Los tiempos son los de producción (HTTP 15 s, bienvenida 20 s, silencio 45 s). No se
acelera el reloj. Las aserciones consultan el estado del background y un snapshot real,
no solo texto del popup que podría estar pendiente de actualizarse. También se verifican
los contadores del proxy para demostrar que el corte afecta al transporte y que la
recuperación usa túneles nuevos. En fallos se adjuntan únicamente esos contadores, sin
contenido de peticiones. Perfiles, sockets y proxy se liberan siempre en el teardown.

Para Detener se comprueba repetidamente el estado del runner durante 17 s después de
recuperar la red. No se exige que desaparezca inmediatamente todo intento CONNECT:
Chromium puede continuar una negociación TLS ya iniciada incluso después de cancelar
fetch y cerrar el documento. La propagación de AbortSignal se verifica en las unitarias.

Las pruebas unitarias complementan estas comprobaciones: abortar cabeceras o cuerpos
HTTP atascados, cancelar solicitudes al detenerse, límites de bienvenida y silencio,
ignorancia de eventos tardíos y backoff de 1/2/4/8/16/30 segundos con tope de 30.

La cuenta debe tener una mosca viva y un token no revocado. El jardín web y otros clientes
deben dejar libre su control. La prueba ejecuta una simulación real y puede producir
movimiento, alimentación y actividad voluntaria igual que una sesión normal.

Los fallos del servicio, credenciales revocadas o una mosca controlada por otra sesión
pueden hacer fallar esta prueba sin que exista una regresión local. Por eso no se ejecuta
con una cuenta real automáticamente. Una futura integración de CI deberá proporcionar
el token explícitamente si decide ejecutar estas pruebas.

## Credenciales, diagnóstico y límites

Se desactivan trazas, capturas y vídeos. Las aserciones no comparan ni imprimen el token;
los estados consultados desde storage excluyen la credencial. Cada perfil temporal se
elimina en el teardown, incluso si falla una prueba. Si se mata el proceso o el sistema
se apaga, eliminar los directorios temporales `moskas-playwright-*` restantes.

El cierre del contexto libera los workers y la conexión incluso ante un fallo. La prueba
del botón Detener comprueba además la limpieza explícita del runner y del offscreen.

El popup se abre como página `chrome-extension://…/popup.html`, siguiendo la técnica
documentada por Playwright. No se automatiza el clic en el icono de la barra del navegador.
Los cambios de interfaz Wi-Fi, DNS, la pausa por suspensión del sistema, periodos largos de inactividad y la cesión de control
al jardín con una sesión web y la experiencia visual desde la barra siguen necesitando
comprobación manual. Firefox también se probará manualmente cuando exista su cliente.

Referencias: [extensiones en Playwright](https://playwright.dev/docs/chrome-extensions)
y [binarios de navegador](https://playwright.dev/docs/browsers).
