import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const sourceRoot = join(root, 'src');
const problems = [];

function* files(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.name.endsWith('.ts')) yield path;
  }
}

function layer(file) {
  return relative(sourceRoot, file).split(sep)[0];
}

for (const file of files(sourceRoot)) {
  const currentLayer = layer(file);
  const name = relative(root, file);
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const specifier = node.moduleSpecifier.text;
      if (specifier.startsWith('.')) {
        const targetLayer = layer(resolve(dirname(file), specifier));
        const allowed = currentLayer === 'core' ? ['core'] : ['core', 'adapters'];
        if (['core', 'adapters'].includes(currentLayer) && !allowed.includes(targetLayer))
          problems.push(`${name}: dependencia no permitida: ${specifier}`);
      } else if (currentLayer === 'core' && specifier !== 'zod') {
        problems.push(`${name}: dependencia externa del núcleo no permitida: ${specifier}`);
      }
    }
    if (ts.isIdentifier(node)) {
      const forbidden = currentLayer === 'core'
        ? ['chrome', 'browser', 'window', 'document', 'navigator', 'Worker', 'WebSocket', 'fetch']
        : currentLayer === 'adapters' ? ['chrome', 'browser'] : [];
      if (forbidden.includes(node.text)) problems.push(`${name}: API de plataforma fuera de su capa: ${node.text}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Arquitectura correcta: núcleo independiente y adaptadores sin APIs de extensiones.');
