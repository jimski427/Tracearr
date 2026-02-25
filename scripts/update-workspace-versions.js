#!/usr/bin/env node
// Updates the version field in all workspace package.json files.
// Usage: node scripts/update-workspace-versions.js <version>
import { readFileSync, writeFileSync } from 'fs';

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/update-workspace-versions.js <version>');
  process.exit(1);
}

const workspacePackages = [
  'apps/server/package.json',
  'apps/web/package.json',
  'apps/mobile/package.json',
  'apps/e2e/package.json',
  'packages/shared/package.json',
  'packages/translations/package.json',
  'packages/test-utils/package.json',
];

for (const pkgPath of workspacePackages) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Updated ${pkgPath} to version ${version}`);
}
