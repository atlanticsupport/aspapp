import { chromium } from 'playwright';

const STAGING = process.env.STAGING_URL || 'https://66fe1708.asp-app-staging.pages.dev';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    console.log('Navigating to', STAGING);
    await page.goto(STAGING, { waitUntil: 'load', timeout: 30000 });

    // try to open gallery view
    try {
      await page.evaluate(() => {
        if (window.navigateTo) return window.navigateTo('gallery');
        if (window.loadGalleryView) return window.loadGalleryView();
        return null;
      });
    } catch (e) {}

    // remove potential login overlay/modal that blocks clicks (test-only)
    try {
      await page.evaluate(() => {
        const overlay = document.getElementById('login-overlay') || document.querySelector('.modal.open');
        if (overlay) overlay.remove();
      });
    } catch (e) {}

    // wait for tree
    await page.waitForSelector('#gallery-tree-container li', { timeout: 10000 });

    // expand first top-level node
    const topAnchors = await page.$$('#gallery-tree-container > .jstree-container-ul > li > .jstree-anchor');
    if (topAnchors.length === 0) {
      console.log('no top anchors found');
      await browser.close();
      process.exit(1);
    }
    await topAnchors[0].click();
    await page.waitForTimeout(300);

    // find first child folder anchor under that top li
    const firstTopLi = await page.$('#gallery-tree-container > .jstree-container-ul > li');
    const childAnchors = await firstTopLi.$$('.jstree-children li > .jstree-anchor');
    if (childAnchors.length === 0) {
      // maybe one more expand
      await page.waitForTimeout(500);
    }

    // click first child to open product folder (3 cols)
    const firstChild = (childAnchors && childAnchors.length) ? childAnchors[0] : null;
    if (firstChild) {
      await firstChild.click();
      await page.waitForTimeout(300);
    }

    // measure after opening product folder
    const productMeasurements = await page.evaluate(() => {
      const out = {};
      out.previewRect = document.getElementById('gallery-preview')?.getBoundingClientRect();
      out.contentRect = document.getElementById('gallery-preview-content')?.getBoundingClientRect();
      const imgs = Array.from(document.querySelectorAll('#gallery-preview-content img'));
      out.count = imgs.length;
      out.images = imgs.slice(0,50).map(img => ({
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        clientWidth: img.clientWidth,
        clientHeight: img.clientHeight,
        computedWidth: getComputedStyle(img).width,
        computedHeight: getComputedStyle(img).height,
        src: img.src
      }));
      // also capture parent cell styles for first image if present
      if (imgs[0] && imgs[0].parentElement) {
        const p = imgs[0].parentElement;
        out.firstParent = {
          classList: Array.from(p.classList),
          computedDisplay: getComputedStyle(p).display,
          computedPosition: getComputedStyle(p).position,
          computedPaddingTop: getComputedStyle(p).paddingTop,
          computedWidth: getComputedStyle(p).width,
          computedHeight: getComputedStyle(p).height
        };
      }
      return out;
    });

    // now click top-level node itself to show process-level (5 cols)
    await topAnchors[0].click();
    await page.waitForTimeout(300);

    const processMeasurements = await page.evaluate(() => {
      const out = {};
      out.previewRect = document.getElementById('gallery-preview')?.getBoundingClientRect();
      out.contentRect = document.getElementById('gallery-preview-content')?.getBoundingClientRect();
      const imgs = Array.from(document.querySelectorAll('#gallery-preview-content img'));
      out.count = imgs.length;
      out.images = imgs.slice(0,50).map(img => ({
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        clientWidth: img.clientWidth,
        clientHeight: img.clientHeight,
        computedWidth: getComputedStyle(img).width,
        computedHeight: getComputedStyle(img).height,
        src: img.src
      }));
      if (imgs[0] && imgs[0].parentElement) {
        const p = imgs[0].parentElement;
        out.firstParent = {
          classList: Array.from(p.classList),
          computedDisplay: getComputedStyle(p).display,
          computedPosition: getComputedStyle(p).position,
          computedPaddingTop: getComputedStyle(p).paddingTop,
          computedWidth: getComputedStyle(p).width,
          computedHeight: getComputedStyle(p).height
        };
      }
      return out;
    });

    // If there is a leaf image, click first leaf to open single-image view
    const firstLeafAnchor = await page.$('#gallery-tree-container li[data-key] .jstree-anchor');
    if (firstLeafAnchor) {
      await firstLeafAnchor.click();
      await page.waitForTimeout(300);
    }

    const singleMeasurements = await page.evaluate(() => {
      const out = {};
      out.previewRect = document.getElementById('gallery-preview')?.getBoundingClientRect();
      out.contentRect = document.getElementById('gallery-preview-content')?.getBoundingClientRect();
      const img = document.querySelector('#gallery-preview-content img');
      if (!img) return out;
      out.image = {
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        clientWidth: img.clientWidth,
        clientHeight: img.clientHeight,
        computedWidth: getComputedStyle(img).width,
        computedHeight: getComputedStyle(img).height,
        src: img.src
      };
      if (img.parentElement) {
        const p = img.parentElement;
        out.parent = { classList: Array.from(p.classList), computedDisplay: getComputedStyle(p).display, computedPosition: getComputedStyle(p).position, computedWidth: getComputedStyle(p).width, computedHeight: getComputedStyle(p).height };
      }
      return out;
    });

    console.log('PRODUCT FOLDER MEASUREMENTS:\n', JSON.stringify(productMeasurements, null, 2));
    console.log('PROCESS FOLDER MEASUREMENTS:\n', JSON.stringify(processMeasurements, null, 2));
    console.log('SINGLE IMAGE MEASUREMENTS:\n', JSON.stringify(singleMeasurements, null, 2));

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await browser.close();
    process.exit(2);
  }
})();
