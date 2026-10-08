import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const tracked = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter((file) => file && existsSync(file));
const forbiddenNames = [
  /(^|\/)\.env(?:\.|$)/i,
  /\.(?:pem|key|p12|pfx|crx)$/i,
  /(^|\/)(?:credentials?|secrets?)(?:\.|\/|$)/i,
];
const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.txt',
  '.yaml',
  '.yml',
]);
const forbiddenContent = [
  ['clave privada', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['token de dispositivo real', /\bfly_(?:device|socket)_[a-f0-9]{64}\b/i],
  ['URI de MongoDB con credenciales', /mongodb(?:\+srv)?:\/\/[^\s/:@]+:[^\s/@]+@/i],
];

const problems = [];
for (const file of tracked) {
  const normalized = file.replaceAll('\\', '/');
  if (forbiddenNames.some((pattern) => pattern.test(normalized))) {
    problems.push(`${file}: tipo de archivo privado`);
    continue;
  }
  if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
  const content = readFileSync(file, 'utf8');
  for (const [label, pattern] of forbiddenContent)
    if (pattern.test(content)) problems.push(`${file}: contiene ${label}`);
}

if (problems.length) {
  console.error('La auditoría pública ha encontrado contenido bloqueado:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`Auditoría pública correcta: ${tracked.length} archivos revisados.`);
