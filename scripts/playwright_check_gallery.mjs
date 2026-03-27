import { chromium } from 'playwright';

const STAGING = process.env.STAGING_URL || 'https://bb8b327a.asp-app-staging.pages.dev';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    console.log('Navigating to', STAGING);
    await page.goto(STAGING, { waitUntil: 'load', timeout: 30000 });

    // Navigate to gallery view using the app navigation API if exposed
    try {
      await page.evaluate(() => {
        if (window.navigateTo) return window.navigateTo('gallery');
        if (window.loadGalleryView) return window.loadGalleryView();
        return null;
      });
    } catch (e) {
      // ignore
    }

    // Wait for gallery container and expand top-level nodes to reveal product folders
    try {
      await page.waitForSelector('#gallery-tree-container li', { timeout: 8000 });
      // expand first-level nodes (click anchors) to load children
      const topAnchors = await page.$$('#gallery-tree-container > .jstree-container-ul > li > .jstree-anchor');
      for (let i = 0; i < Math.min(topAnchors.length, 6); i++) {
        try {
          await topAnchors[i].click();
          await page.waitForTimeout(250);
        } catch (e) { }
      }
    } catch (e) {
      // fallback: short wait for any anchor inside gallery container
      await page.waitForTimeout(1500);
    }

    // Extract node samples and folder labels
    const nodes = await page.evaluate(() => {
      const out = [];
      const lis = Array.from(document.querySelectorAll('#gallery-tree-container li'));
      for (const li of lis.slice(0, 200)) {
        const a = li.querySelector('.jstree-anchor');
        if (!a) continue;
        const text = a.innerText.trim().replace(/\s+/g, ' ');
        const hasThumb = !!a.querySelector('.jstree-thumb');
        const isLeaf = li.hasAttribute('data-key') || li.dataset.key;
        out.push({ text, hasThumb, isLeaf, id: li.id || null });
      }
      // Also collect unique top-level folder labels (proc -> folder)
      const folderLabels = [];
      const anchors = Array.from(document.querySelectorAll('#gallery-tree-container .jstree-anchor'));
      anchors.forEach(a => {
        const txt = a.innerText.trim().replace(/\s+/g, ' ');
        if (!folderLabels.includes(txt)) folderLabels.push(txt);
      });
      return { sampleNodes: out.slice(0, 100), folderLabels: folderLabels.slice(0,50) };
    });

    console.log('Extracted nodes (sample):');
    console.log(JSON.stringify(nodes, null, 2));
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('Playwright error', err);
    await browser.close();
    process.exit(2);
  }
})();
