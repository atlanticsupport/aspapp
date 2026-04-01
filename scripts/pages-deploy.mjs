import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { copyFile, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const environment = process.argv[2];

const environments = {
    production: {
        template: 'wrangler.production.toml',
        projectName: 'asp-app',
        branch: 'main'
    },
    staging: {
        template: 'wrangler.staging.toml',
        projectName: 'asp-app-staging',
        branch: 'staging'
    }
};

if (!environment || !environments[environment]) {
    console.error('Usage: node scripts/pages-deploy.mjs <production|staging>');
    process.exit(1);
}

const gitBranch = process.env.GITHUB_REF_NAME;
if (gitBranch && gitBranch !== environments[environment].branch) {
    console.error(
        `Branch mismatch: deploy "${environment}" expects "${environments[environment].branch}" but got "${gitBranch}".`
    );
    process.exit(1);
}

const rootDir = process.cwd();
const wranglerPath = path.join(rootDir, 'wrangler.toml');
const backupPath = path.join(rootDir, 'wrangler.toml.bak');
const templatePath = path.join(rootDir, environments[environment].template);

const originalConfig = await readFile(wranglerPath, 'utf8');

function resolveWranglerBin() {
    const localWrangler = path.join(rootDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    if (existsSync(localWrangler)) return localWrangler;

    if (process.platform === 'win32' && process.env.APPDATA) {
        const globalWrangler = path.join(process.env.APPDATA, 'npm', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
        if (existsSync(globalWrangler)) return globalWrangler;
    }

    throw new Error('Wrangler binary not found. Run npm install first.');
}

try {
    await copyFile(wranglerPath, backupPath);
    await copyFile(templatePath, wranglerPath);

    const args = [
        'pages',
        'deploy',
        'public',
        '--project-name',
        environments[environment].projectName,
        '--branch',
        environments[environment].branch
    ];

    if (process.env.GITHUB_SHA) {
        args.push('--commit-hash', process.env.GITHUB_SHA);
    }

    const commitMessage = process.env.GITHUB_HEAD_COMMIT_MESSAGE || process.env.GITHUB_SHA;
    if (commitMessage) {
        args.push('--commit-message', commitMessage);
    }

    const command = {
        file: process.execPath,
        args: [resolveWranglerBin(), ...args]
    };

    const child = spawn(command.file, command.args, {
        stdio: 'inherit',
        env: process.env
    });

    const exitCode = await new Promise(resolve => {
        child.on('exit', resolve);
    });

    if (exitCode !== 0) {
        process.exit(exitCode ?? 1);
    }
} finally {
    await writeFile(wranglerPath, originalConfig, 'utf8');
    await unlink(backupPath).catch(() => {});
}
