import { mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { validToken } from './contracts';

export interface Vault {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}
export type Settings = { enabled: boolean; encryptedToken?: string };

/** Escritura atómica, solo ciphertext. La activación nunca se infiere de la credencial. */
export class DesktopStore {
  constructor(private file: string, private vault: Vault) {}
  read(): Settings {
    try {
      const value = JSON.parse(readFileSync(this.file, 'utf8'));
      if (value.version !== 1 || typeof value.enabled !== 'boolean' ||
        (value.encryptedToken !== undefined && typeof value.encryptedToken !== 'string')) throw new Error();
      // Ignorar preferencias retiradas de versiones preliminares, sin perder la sesión.
      return { enabled: value.enabled, encryptedToken: value.encryptedToken };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { enabled: false };
      throw new Error('No se pudo leer la configuración. Revisa el archivo local antes de iniciar.');
    }
  }
  write(settings: Settings) {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify({ version: 1, enabled: settings.enabled, encryptedToken: settings.encryptedToken }), { mode: 0o600 });
      renameSync(temporary, this.file);
    } finally {
      try { unlinkSync(temporary); } catch { /* Ya renombrado o no creado. */ }
    }
  }
  seal(token: string) {
    if (!validToken(token)) throw new Error('Revisa el token de dispositivo.');
    if (!this.vault.isEncryptionAvailable()) throw new Error('El almacén seguro del sistema no está disponible.');
    return this.vault.encryptString(token).toString('base64');
  }
  unseal(settings: Settings) {
    if (!settings.encryptedToken) throw new Error('Introduce un token de dispositivo.');
    if (!this.vault.isEncryptionAvailable()) throw new Error('El almacén seguro del sistema no está disponible.');
    try {
      const token = this.vault.decryptString(Buffer.from(settings.encryptedToken, 'base64'));
      if (!validToken(token)) throw new Error();
      return token;
    } catch { throw new Error('No se pudo desbloquear el token. Vuelve a vincular el dispositivo.'); }
  }
}
