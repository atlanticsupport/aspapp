import { views } from './core/dom.js';

function escapeId(s = '') {
    return `n-${String(s).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

export async function loadGalleryView() {
    if (!views.gallery) return;

    views.gallery.innerHTML = `
        <div class="view-gallery" style="display:flex; gap:16px; align-items:flex-start;">
            <div id="gallery-tree-container" style="width:360px; border:1px solid var(--border-color); border-radius:8px; padding:12px; background:var(--bg-color);"></div>
            <div id="gallery-preview" style="flex:1; min-height:400px; border:1px solid var(--border-color); border-radius:8px; padding:12px; background:var(--bg-color); display:flex; flex-direction:column; gap:8px;">
                <div id="gallery-preview-toolbar" style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-weight:700;">Preview</div>
                    <div>
                        <button id="gallery-delete-btn" class="btn btn-danger" style="display:none;"><i class="fa-solid fa-trash"></i> Apagar</button>
                    </div>
                </div>
                <div id="gallery-preview-content" style="flex:1; display:flex; align-items:center; justify-content:center; overflow:auto;"></div>
            </div>
        </div>
    `;

    const container = document.getElementById('gallery-tree-container');
    const preview = document.getElementById('gallery-preview-content');
    const deleteBtn = document.getElementById('gallery-delete-btn');

    // Fetch file list and metadata from server
    let list = [];
    let meta = { byBase: {}, byUrl: {} };
    try {
        const [resList, resMeta] = await Promise.all([
            fetch('/api/list_images'),
            fetch('/api/gallery_meta').catch(() => new Response(JSON.stringify({})))
        ]);

        if (!resList.ok) throw new Error('Erro ao listar imagens');
        list = await resList.json();

        if (resMeta && resMeta.ok) {
            try { meta = await resMeta.json(); } catch (e) { meta = { byBase: {}, byUrl: {} }; }
        }
    } catch (e) {
        container.innerHTML = `<div style="padding:1rem; color:var(--text-secondary);">Falha ao listar imagens: ${e.message}</div>`;
        return;
    }

    // Group files by sales_process -> displayFolder
    const grouped = new Map();
    function formatFolderLabel(base, m, obj) {
        // prefer explicit display label
        if (m && m.displayLabel) return m.displayLabel;
        // prefer object-enriched product_name/part_number
        if (obj && (obj.product_name || obj.part_number)) return `${obj.product_name || ''}${obj.part_number ? ' / ' + obj.part_number : ''}`.trim();
        if (m && m.product_name) return `${m.product_name}${m.part_number ? ' / ' + m.part_number : ''}`.trim();
        // if base contains product-<id>-... show friendly Produto #id
        const mProd = base.match(/^product-(\d+)/);
        if (mProd) return `Produto #${mProd[1]}`;
        // fallback: use readable path segment or cleaned base
        const cleaned = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
        return cleaned.length > 40 ? cleaned.substring(0, 37) + '...' : (cleaned || 'Unknown Item');
    }

    for (const obj of list) {
        const key = obj.key || obj.name || '';
        const filename = key.split('/').pop() || key;
        const base = filename.replace(/\.[^/.]+$/, '');
        const mByUrl = meta.byUrl && meta.byUrl[key];
        const mByBase = meta.byBase && meta.byBase[base];
        const m = mByUrl || mByBase || {};
        // sales process: prefer metadata, then obj, then key path first segment
        const salesProcess = m.sales_process || obj.sales_process || (key.includes('/') ? key.split('/')[0] : 'Unknown Process');
        const displayFolder = formatFolderLabel(base, m, obj);

        if (!grouped.has(salesProcess)) grouped.set(salesProcess, new Map());
        const procMap = grouped.get(salesProcess);
        if (!procMap.has(displayFolder)) procMap.set(displayFolder, []);
        procMap.get(displayFolder).push({ obj, filename });
    }

    // Build jsTree nodes
    const nodes = [];
    const nodeMap = { '#': true };
    function pushNode(id, parent, text, a_attr, iconClass) {
        if (nodeMap[id]) return;
        nodeMap[id] = true;
        const node = { id, parent: parent || '#', text, a_attr: a_attr || {} };
        if (iconClass) node.icon = iconClass;
        nodes.push(node);
        return node;
    }

    grouped.forEach((procMap, proc) => {
        const procId = escapeId(proc);
        pushNode(procId, '#', proc, {}, 'fa fa-folder');
        procMap.forEach((items, itemLabel) => {
            const itemId = escapeId(proc + '|' + itemLabel);
            pushNode(itemId, procId, itemLabel, {}, 'fa fa-folder');
            // sort images by sort_order then uploaded (if present)
            items.sort((a,b) => {
                const sa = (a.obj && a.obj.sort_order) || 0;
                const sb = (b.obj && b.obj.sort_order) || 0;
                if (sa !== sb) return sa - sb;
                return new Date(a.obj && a.obj.uploaded || 0) - new Date(b.obj && b.obj.uploaded || 0);
            });
            items.forEach((it, idx) => {
                const extMatch = it.filename.match(/(\.[^.]*)$/);
                const ext = extMatch ? extMatch[1] : '';
                const fname = `${idx+1}${ext}`;
                const leafId = escapeId(proc + '|' + itemLabel + '|' + fname);
                // Do not set an icon for file leaves; thumbnails will be shown instead
                const leaf = pushNode(leafId, itemId, fname, { 'data-key': it.obj.key }, null);
                if (leaf) leaf.li_attr = { 'data-url': `/api/r2_object?key=${encodeURIComponent(it.obj.key)}`, 'data-key': it.obj.key };
            });
        });
    });

    // Render jsTree and inject thumbnails for leaves
    try {
        $(container).jstree({ core: { data: nodes, themes: { icons: true } }, plugins: ['wholerow'] });

        function renderThumbs() {
            // Find all li elements with data-key and prepend a small thumbnail to their anchor
            const lis = container.querySelectorAll('li[data-key]');
            lis.forEach(li => {
                try {
                    const key = li.getAttribute('data-key');
                    if (!key) return;
                    const a = li.querySelector('.jstree-anchor');
                    if (!a) return;
                    if (a.querySelector('.jstree-thumb')) return; // already rendered
                    const img = document.createElement('img');
                    img.className = 'jstree-thumb';
                    img.loading = 'lazy';
                    img.height = 24;
                    img.style.width = 'auto';
                    img.src = `/api/r2_thumbnail?key=${encodeURIComponent(key)}&w=72&h=72&q=60`;
                    a.insertBefore(img, a.firstChild);
                    // remove any leftover jsTree icon elements inside the anchor to ensure only the thumbnail remains
                    const leftoverIcons = a.querySelectorAll('.jstree-icon, .jstree-themeicon, .jstree-themeicon-custom');
                    leftoverIcons.forEach(el => el.remove());
                } catch (e) { /* ignore per-item errors */ }
            });
        }

        $(container).on('ready.jstree refresh.jstree open_node.jstree', renderThumbs);

        $(container).on('select_node.jstree', function (e, data) {
            const node = data.node;
            const liAttr = node.li_attr || {};
            const fileUrl = liAttr['data-url'];
            const fileKey = liAttr['data-key'];
            if (fileUrl) {
                preview.innerHTML = `<img src="${fileUrl}" style="max-width:100%; max-height:80vh; object-fit:contain; border-radius:6px;" />`;
                deleteBtn.style.display = 'inline-flex';
                deleteBtn.dataset.key = fileKey;
            } else {
                try { $(container).jstree(true).toggle_node(node.id); } catch (e) { }
                preview.innerHTML = `<div style="color:var(--text-secondary);">Pasta selecionada</div>`;
                deleteBtn.style.display = 'none';
                deleteBtn.dataset.key = '';
            }
        });

        deleteBtn.onclick = async () => {
            const key = deleteBtn.dataset.key;
            if (!key) return;
            const ok = confirm('Apagar ficheiro ' + key + ' ?');
            if (!ok) return;
            try {
                const resp = await fetch('/api/delete_image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
                const j = await resp.json();
                if (!resp.ok) throw new Error(j.error || 'Falha ao apagar');
                loadGalleryView();
            } catch (err) {
                alert('Erro ao apagar: ' + err.message);
            }
        };
    } catch (err) {
        container.innerHTML = `<div style="padding:1rem; color:var(--text-secondary);">Erro a renderizar a árvore: ${err.message}</div>`;
    }
}
