import { spawnSync } from 'node:child_process';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

import { compileFromFile } from 'json-schema-to-typescript';

const schemaPath = resolve(
  'examples/tank-legacy-regression/schemas/game-ir.schema.json',
);
const outputPath = resolve(
  'examples/tank-legacy-regression/generated/game-ir.ts',
);
const checkOnly = process.argv.includes('--check');
const unformatted = await compileFromFile(schemaPath, {
  bannerComment:
    '/* Generated from examples/tank-legacy-regression/schemas/game-ir.schema.json. Do not edit by hand. */',
  unreachableDefinitions: true,
  unknownAny: true,
  style: {
    bracketSpacing: true,
    printWidth: 80,
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'all',
    useTabs: false,
  },
});
const generated = await formatTypeScript(unformatted);

if (checkOnly) {
  const existing = await readFile(outputPath, 'utf8').catch(() => '');
  if (existing !== generated) {
    console.error(
      '[game-ir] generated/game-ir.ts is stale; run `npm run generate:ir`.',
    );
    process.exit(1);
  }
  console.log('[game-ir] TypeScript binding matches the authoritative schema');
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, generated);
  console.log('[game-ir] generated TypeScript binding');
}

async function formatTypeScript(source) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'game-ir-codegen-'));
  const temporaryFile = join(temporaryDirectory, 'game-ir.ts');
  try {
    await writeFile(temporaryFile, source);
    const formatter = spawnSync(
      process.execPath,
      [resolve('node_modules/oxfmt/bin/oxfmt'), temporaryFile],
      { encoding: 'utf8' },
    );
    if (formatter.status !== 0) {
      throw new Error(formatter.stderr || 'oxfmt failed for generated binding');
    }
    return await readFile(temporaryFile, 'utf8');
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
