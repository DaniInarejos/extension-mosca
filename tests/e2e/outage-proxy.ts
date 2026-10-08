import { createServer } from 'node:http';
import { createConnection, type Socket } from 'node:net';

type Mode = 'online' | 'cut' | 'stall';
type Tunnel = { client: Socket; upstream?: Socket };

/** CONNECT opaco: TLS se negocia entre Chromium y moscas.lol, sin descifrar ni simular la API. */
export class OutageProxy {
  private server = createServer((_request, response) => response.destroy());
  private sockets = new Set<Socket>();
  private tunnels = new Set<Tunnel>();
  private mode: Mode = 'online';
  url = '';
  attempts = 0;
  blockedAttempts = 0;
  established = 0;
  forwardedBytes = 0;

  diagnostics() {
    return {
      mode: this.mode, attempts: this.attempts, blockedAttempts: this.blockedAttempts,
      established: this.established, forwardedBytes: this.forwardedBytes, tunnels: this.tunnels.size,
    };
  }

  async start() {
    this.server.on('connection', (socket) => this.track(socket));
    this.server.on('connect', (request, stream, head) => {
      const client = stream as Socket;
      // No convertir el fixture en un proxy general ni permitir rutas alternativas.
      if (request.url !== 'moscas.lol:443') { client.destroy(); return; }
      this.attempts++;
      if (this.mode === 'cut') {
        this.blockedAttempts++;
        client.destroy();
        return;
      }
      const tunnel: Tunnel = { client };
      this.tunnels.add(tunnel);
      client.on('close', () => {
        this.tunnels.delete(tunnel);
        tunnel.upstream?.destroy();
      });
      if (this.mode === 'stall') {
        this.blockedAttempts++;
        // Aceptar el túnel pero no transportar ni un byte TLS: petición pendiente real.
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        // Drenar y descartar permite observar FIN/RST cuando Chromium cancela la petición.
        client.resume();
        return;
      }
      const upstream = tunnel.upstream = createConnection({ host: 'moscas.lol', port: 443 });
      this.track(upstream);
      upstream.setTimeout(10_000, () => upstream.destroy());
      upstream.on('close', () => {
        // En modo stall no propagar FIN: Chromium debe detectar el silencio por sí mismo.
        if (this.mode !== 'stall') client.destroy();
      });
      upstream.once('connect', () => {
        upstream.setTimeout(0);
        if (client.destroyed || this.mode !== 'online') { upstream.destroy(); return; }
        this.established++;
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        client.on('data', (chunk: Buffer) => {
          if (this.mode === 'online') this.forwardedBytes += chunk.length;
        });
        upstream.on('data', (chunk: Buffer) => {
          if (this.mode === 'online') this.forwardedBytes += chunk.length;
        });
        client.pipe(upstream);
        upstream.pipe(client);
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('No se pudo iniciar el proxy de pruebas.');
    this.url = `http://127.0.0.1:${address.port}`;
  }

  cut() {
    this.mode = 'cut';
    this.destroyTunnels();
  }

  stall() {
    this.mode = 'stall';
    for (const { client, upstream } of this.tunnels) {
      client.unpipe();
      upstream?.unpipe();
      // Descartar bytes, sin acumularlos ni ocultar el cierre de Chromium al fixture.
      client.resume();
      upstream?.resume();
    }
  }

  restore() {
    this.mode = 'online';
    // Descartar conexiones atascadas, nunca reproducir datos TLS acumulados del corte.
    this.destroyTunnels();
  }

  private destroyTunnels() {
    for (const { client, upstream } of this.tunnels) {
      client.destroy();
      upstream?.destroy();
    }
    this.tunnels.clear();
  }

  private track(socket: Socket) {
    this.sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => this.sockets.delete(socket));
  }

  async dispose() {
    for (const socket of this.sockets) socket.destroy();
    this.destroyTunnels();
    if (this.server.listening) await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
