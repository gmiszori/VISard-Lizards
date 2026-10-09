// Builds the site for GitHub Pages and publishes dist/ to the gh-pages branch.
// Usage: npm run deploy   (needs a git remote named "origin" and push rights)
import { execSync } from 'node:child_process';
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });
const remote = execSync('git remote get-url origin').toString().trim();
const repo = remote.replace(/\.git$/, '').split('/').pop();

// Project pages live under /<repo>/, so the app is built with that base path.
run('npm run build', { env: { ...process.env, BASE_PATH: `/${repo}` } });

const tmp = mkdtempSync(join(tmpdir(), 'pages-'));
cpSync('dist', tmp, { recursive: true });
run('git init -q -b gh-pages', { cwd: tmp });
run('git add -A', { cwd: tmp });
run('git commit -q -m "Deploy to GitHub Pages"', { cwd: tmp });
run(`git push -q --force "${remote}" gh-pages`, { cwd: tmp });
console.log(`Published. Site: https://<owner>.github.io/${repo}/`);
