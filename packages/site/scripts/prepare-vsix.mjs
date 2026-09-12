import { cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = join(here, '..');
const repoRoot = join(siteRoot, '..', '..');
const vscodeRoot = join(repoRoot, 'packages', 'vscode');
const source = join(vscodeRoot, 'markup-lang-0.1.1.vsix');
const destination = join(siteRoot, 'downloads', 'markup-lang-0.1.1.vsix');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Vercel builds the documentation directly, so it does not execute the
// GitHub Actions step that normally creates the VSIX. Keep the site build
// self-contained by producing the extension artifact when needed.
execFileSync(npm, ['run', 'build', '--workspace=packages/vscode'], {
  cwd: repoRoot,
  stdio: 'inherit',
});

execFileSync(npm, ['run', 'package', '--workspace=packages/vscode'], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (!existsSync(source)) {
  throw new Error(`VSIX was not generated: ${source}`);
}

cpSync(source, destination);
console.log(`site: VSIX prepared → ${destination}`);
