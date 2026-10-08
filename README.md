# Moskas Brain Extension 0.1

Extensión experimental de Chrome que ejecuta localmente el cerebro FlyWire de la mosca del propietario y sincroniza su cuerpo con el servidor de Moskas.

## Estado

La versión 0.1 prioriza validar el runner en Chrome. Usa un token de dispositivo revocable, un documento offscreen y un Web Worker. Mientras esta versión está activa, abrir el jardín con la misma cuenta puede sustituir su conexión.

## Desarrollo

```bash
npm install
npm run build
```

Después, abre `chrome://extensions`, activa el modo desarrollador y carga `dist/` como extensión descomprimida.

El servidor de Moskas debe implementar `POST /api/device/simulation-ticket` y aceptar el ticket de un solo uso en `/ws/device`.

## Código copiado

La simulación, el adaptador FlyWire y los assets se copiaron de Moskas en el commit `eefebcbd7b0b5d0b14ce2749916db54ec5787e6d`. Para la 0.1 se mantienen como una instantánea local, sin paquetes compartidos.

## Seguridad

- La extensión nunca solicita ni guarda la contraseña de la cuenta.
- El token se guarda en `chrome.storage.local`, no se sincroniza entre navegadores.
- No hay content scripts ni permiso para leer páginas visitadas.
- El token puede revocarse desde la cuenta de Moskas.

## Licencias y atribución

El kernel `snedea/flybrain` conserva su licencia MIT en `licenses/flybrain-MIT.txt`. Los datos derivados de FlyWire requieren atribución CC BY 4.0; consulta `public/brain/NOTICE.txt`. La licencia del código propio de esta extensión está pendiente de elección antes de publicar el repositorio.
