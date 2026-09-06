const [major, minor] = process.versions.node.split('.').map(Number);
const supported = major > 22 || (major === 22 && minor >= 13);

if (!supported) {
  console.error(
    `[environment] Node.js >=22.13.0 is required; found ${process.versions.node}. ` +
      'Run `nvm use` after installing the version from .nvmrc.',
  );
  process.exit(1);
}

console.log(`[environment] Node.js ${process.versions.node} is supported`);
