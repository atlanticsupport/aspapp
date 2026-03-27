import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execp = promisify(exec);
const MAX_ATTEMPTS = 3;

function parsePagesUrl(stdout) {
  const m = stdout.match(/https?:\/\/[^\s"']+\.pages\.dev/);
  return m ? m[0] : null;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

function checkMapping(list, meta) {
  const mismatches = [];
  for (const it of list) {
    const key = it.key || it.name || '';
    const filename = key.split('/').pop() || key;
    const base = filename.replace(/\.[^/.]+$/, '');
    const byBase = meta.byBase || {};
    if (!byBase[base]) mismatches.push({ key, base });
  }
  return mismatches;
}

async function deployOnce() {
  console.log('Running deploy:staging...');
  const { stdout, stderr } = await execp('npm run deploy:staging');
  if (stderr) console.error(stderr);
  const url = parsePagesUrl(stdout) || process.env.STAGING_URL;
  console.log('Deploy output, parsed URL:', url);
  return { stdout, url };
}

async function main() {
  let attempt = 0;
  let lastErr = null;
  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    try {
      const { url } = await deployOnce();
      if (!url) throw new Error('Could not determine staging URL from deploy output and STAGING_URL not set');
      const list = await fetchJson(url + '/api/list_images');
      const meta = await fetchJson(url + '/api/gallery_meta');
      const mismatches = checkMapping(list, meta);
      if (mismatches.length === 0) {
        console.log(`Success: mapping verified on attempt ${attempt}.`);
        return 0;
      }
      console.warn(`Attempt ${attempt}: Found ${mismatches.length} mismatches.`, mismatches.slice(0,10));
      lastErr = { attempt, mismatches };
      if (attempt < MAX_ATTEMPTS) {
        console.log('Redeploying to attempt to fix transient issues...');
        continue;
      } else {
        console.log('Max attempts reached; attempting automated code fix for gallery_meta.js');
        // Try to ensure gallery_meta normalization code exists
        const gmPath = 'functions/api/gallery_meta.js';
        let text = await fs.readFile(gmPath, 'utf8');
        if (!/base\s*=\s*base\.replace\(/.test(text) || !/\?name=/.test(text)) {
          console.log('Applying normalization snippet to', gmPath);
          // A conservative append: add a normalization helper near top of attachments loop
          const needle = 'attachments.forEach(a => {';
          const insert = `attachments.forEach(a => {
            // Normalise url base and strip extension
            const url = a.url || '';
            let base = url.split('/').pop() || '';
            const nameIdx = base.indexOf('name=');
            if (nameIdx !== -1) base = base.substring(nameIdx + 5);
            if (!base && url.includes('?name=')) {
              const parts = url.split('?name=');
              base = parts.length > 1 ? parts[1].split('&')[0] : '';
            }
            if (base.startsWith('file?name=')) base = base.replace(/^file\\?name=/, '');
            base = base.replace(/\\.[^/.]+$/, '');
`;
          if (text.includes(needle)) {
            text = text.replace(needle, insert);
            // Close the inserted block by finding the corresponding push logic; we won't attempt to auto-close more than simple replacement
            await fs.writeFile(gmPath, text, 'utf8');
            await execp('git add ' + gmPath + ' && git commit -m "ci(gallery): ensure gallery_meta basename normalization" || true');
            console.log('Committed normalization snippet; redeploying...');
            continue; // will redeploy next loop
          } else {
            console.warn('Could not locate insertion point; skipping automatic file edit');
          }
        } else {
          console.log('Normalization already present, no file edits performed.');
        }
        break;
      }
    } catch (e) {
      console.error('Error during deploy/verify attempt', attempt, e);
      lastErr = e;
    }
  }
  console.error('Verification failed after attempts.', lastErr);
  return 2;
}

main().then(code => process.exit(code)).catch(e => { console.error(e); process.exit(3); });
