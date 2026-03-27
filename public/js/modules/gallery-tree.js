import { views } from './core/dom.js';

function escapeId(s = '') {
    return `n-${String(s).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

export async function loadGalleryView() {
    if (!views.gallery) return;

    views.gallery.innerHTML = `
        <div class="view-gallery" style="display:flex; gap:16px; align-items:flex-start;">
            <div id="gallery-tree-container" style="width:360px; padding:12px; background:var(--bg-color);"></div>
            <div id="gallery-preview" style="flex:1; min-height:400px; padding:12px; background:var(--bg-color); display:flex; flex-direction:column; gap:8px;">
                <div id="gallery-preview-toolbar" style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-weight:700;">Preview</div>
                    <div>
                        <button id="gallery-download-btn" class="btn btn-primary" style="display:none;"><i class="fa-solid fa-download"></i> Descarregar</button>
                    </div>
                </div>
                <div id="gallery-preview-content" style="flex:1; display:flex; align-items:center; justify-content:center; overflow:auto;"></div>
            </div>
        </div>
    `;

    const container = document.getElementById('gallery-tree-container');
    const preview = document.getElementById('gallery-preview-content');
    const downloadBtn = document.getElementById('gallery-download-btn');

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
        // Show only part_number for product folders when available
        if (obj && obj.part_number) return String(obj.part_number).trim();
        if (m && m.part_number) return String(m.part_number).trim();
        // prefer explicit display label if no part_number
        if (m && m.displayLabel) return m.displayLabel;
        // prefer product_name as fallback
        if (obj && obj.product_name) return obj.product_name;
        if (m && m.product_name) return m.product_name;
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
        const mBaseItem = Array.isArray(mByBase) ? mByBase[0] : mByBase;
        const m = mByUrl || mBaseItem || {};
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
                if (leaf) leaf.li_attr = { 'data-url': `/api/r2_object?key=${encodeURIComponent(it.obj.key)}`, 'data-key': it.obj.key, 'data-index': String(idx+1) };
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
                    // insert numbering element
                    if (!a.querySelector('.jstree-index')) {
                        const idxAttr = li.getAttribute('data-index') || li.dataset.index || '';
                        const span = document.createElement('span');
                        span.className = 'jstree-index';
                        span.textContent = idxAttr ? `${idxAttr} - ` : '';
                        span.style.fontWeight = '600';
                        span.style.marginRight = '6px';
                        a.insertBefore(span, a.firstChild);
                    }

                    const img = document.createElement('img');
                    img.className = 'jstree-thumb';
                    img.loading = 'lazy';
                    img.height = 24;
                    img.style.width = 'auto';
                    img.src = `/api/r2_thumbnail?key=${encodeURIComponent(key)}&w=72&h=72&q=60`;
                    // insert thumbnail after index (if present) so order is: index, thumb
                    const firstChild = a.querySelector('.jstree-index');
                    if (firstChild) a.insertBefore(img, firstChild.nextSibling); else a.insertBefore(img, a.firstChild);
                    // remove any leftover jsTree icon elements inside the anchor to ensure only the thumbnail remains
                    const leftoverIcons = a.querySelectorAll('.jstree-icon, .jstree-themeicon, .jstree-themeicon-custom');
                    leftoverIcons.forEach(el => el.remove());
                    // remove plain text nodes inside anchor for file leaves so only thumbnail is visible
                    Array.from(a.childNodes).forEach(n => {
                        if (n.nodeType === Node.TEXT_NODE) n.remove();
                    });
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
                downloadBtn.style.display = 'inline-flex';
                downloadBtn.dataset.key = fileKey;
                downloadBtn.dataset.node = node.id;
            } else {
                // Do not toggle node on click; selecting a folder only selects it.
                preview.innerHTML = `<div style="color:var(--text-secondary);">Pasta selecionada</div>`;
                downloadBtn.style.display = 'inline-flex';
                downloadBtn.dataset.key = '';
                downloadBtn.dataset.node = node.id;
            }
        });
        downloadBtn.onclick = async () => {
            const key = downloadBtn.dataset.key;
            const nodeId = downloadBtn.dataset.node;
            downloadBtn.disabled = true;
            const origText = downloadBtn.innerText;
            downloadBtn.innerText = 'A descarregar...';
            try {
                const tree = $(container).jstree(true);
                if (key) {
                    // Single file download
                    const resp = await fetch(`/api/r2_object?key=${encodeURIComponent(key)}`);
                    if (!resp.ok) throw new Error('Falha ao obter ficheiro');
                    const blob = await resp.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = key.split('/').pop();
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                } else if (nodeId) {
                    // Folder/process download: collect descendant file keys and zip client-side
                    // Ensure JSZip is loaded
                    if (!window.JSZip) {
                        await new Promise((res, rej) => {
                            const s = document.createElement('script');
                            s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
                            s.onload = res; s.onerror = rej; document.head.appendChild(s);
                        });
                    }
                    const instance = tree;
                    const nodeObj = instance.get_node(nodeId);
                    const descendants = nodeObj.children_d || [];
                    // collect file leaf ids (those with data-key)
                    const fileIds = descendants.filter(id => {
                        const n = document.getElementById(id);
                        return n && (n.getAttribute('data-key') || n.dataset.key);
                    });
                    if (fileIds.length === 0) throw new Error('Nenhum ficheiro na pasta selecionada');
                    const zip = new window.JSZip();
                    for (const fid of fileIds) {
                        const li = document.getElementById(fid);
                        const fkey = li.getAttribute('data-key') || li.dataset.key;
                        // build path relative to selected node
                        const pathSegments = instance.get_path(fid, '/', false);
                        // remove root if includes selected node text at start
                        const selPath = instance.get_path(nodeId, '/', false);
                        // compute relative path
                        let relParts = pathSegments.slice(selPath.length);
                        if (relParts.length === 0) relParts = [li.querySelector('.jstree-anchor')?.innerText || fkey.split('/').pop()];
                        const filePath = relParts.join('/');
                        const resp = await fetch(`/api/r2_object?key=${encodeURIComponent(fkey)}`);
                        if (!resp.ok) continue;
                        const buf = await resp.arrayBuffer();
                        zip.file(filePath, buf);
                    }
                    const blob = await zip.generateAsync({ type: 'blob' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const nodeText = nodeObj.text.replace(/\s+/g,'_');
                    a.download = `${nodeText}.zip`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                }
            } catch (err) {
                alert('Erro ao descarregar: ' + (err.message || err));
            } finally {
                downloadBtn.disabled = false;
                downloadBtn.innerText = origText;
            }
        };
    } catch (err) {
        container.innerHTML = `<div style="padding:1rem; color:var(--text-secondary);">Erro a renderizar a árvore: ${err.message}</div>`;
    }
}
