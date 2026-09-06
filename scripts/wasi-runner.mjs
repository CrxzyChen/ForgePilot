import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { WASI } from 'node:wasi';

const [modulePath, ...testArgs] = process.argv.slice(2);
if (!modulePath) {
  throw new Error('expected a WASI module path');
}

const wasi = new WASI({
  version: 'preview1',
  args: [modulePath, ...testArgs],
  env: process.env,
  preopens: { '.': process.cwd() },
});
const wasmModule = await WebAssembly.compile(await readFile(modulePath));
const instance = await WebAssembly.instantiate(wasmModule, {
  wasi_snapshot_preview1: wasi.wasiImport,
});

wasi.start(instance);
