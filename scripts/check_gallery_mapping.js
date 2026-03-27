// Use global fetch (Node ESM) to retrieve JSON endpoints
(async () => {
  try {
    const baseUrl = process.env.STAGING_URL || 'https://817c55b4.asp-app-staging.pages.dev';
    const listRes = await fetch(baseUrl + '/api/list_images');
    const metaRes = await fetch(baseUrl + '/api/gallery_meta');
    const list = await listRes.json();
    const meta = await metaRes.json();
    function formatFolderLabel(base, m, obj) {
      if (m && m.displayLabel) return m.displayLabel;
      if (obj && (obj.product_name || obj.part_number)) return `${obj.product_name || ''}${obj.part_number ? ' / ' + obj.part_number : ''}`.trim();
      if (m && m.product_name) return `${m.product_name}${m.part_number ? ' / ' + m.part_number : ''}`.trim();
      const mProd = base.match(/^product-(\d+)/);
      if (mProd) return `Produto #${mProd[1]}`;
      const cleaned = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
      return cleaned.length > 40 ? cleaned.substring(0, 37) + '...' : (cleaned || 'Unknown Item');
    }

    for (const it of list) {
      const key = it.key;
      const filename = key.split('/').pop();
      const base = filename.replace(/\.[^/.]+$/, '');
      const mArr = (meta.byBase && meta.byBase[base]) || [];
      const m = mArr[0] || (meta.byUrl && meta.byUrl[key]) || {};
      const display = formatFolderLabel(base, m, it);
      console.log(key + " -> displayFolder='" + display + "'");
    }
  } catch (e) {
    console.error('error', e);
    process.exitCode = 1;
  }
})();
