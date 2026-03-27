import { views } from './core/dom.js';

export async function loadGalleryView() {
    if (!views.gallery) return;

    views.gallery.innerHTML = `
        <div style="display:flex; gap:16px; align-items:flex-start;">
            <div id="gallery-tree-container" style="width:360px; max-height:80vh; overflow:auto; border:1px solid var(--border-color); border-radius:8px; padding:12px; background:var(--bg-color);"></div>
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

    // Fetch file list from server
    let list = [];
    try {
        const res = await fetch('/api/list_images');
        if (!res.ok) throw new Error('Erro ao listar imagens');
        list = await res.json();
    } catch (e) {
        container.innerHTML = `<div style="padding:1rem; color:var(--text-secondary);">Falha ao listar imagens: ${e.message}</div>`;
        return;
    }

    // Build jsTree compatible nodes from object keys
    // Expecting keys like: processName/PartNumber/filename.jpg
    // If keys are flat (no slashes), try to infer grouping from naming conventions
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

    // Prefer structured grouping when server provided metadata
    // Grouping: sales_process -> "Descrição / Part-Number" -> images numbered by sort_order
    const grouped = new Map();
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
        const itemList = procMap.get(displayFolder) || [];
        itemList.push({ obj, filename, productId });
        procMap.set(displayFolder, itemList);
        grouped.set(salesProcess, procMap);
    });

    // Build nodes from grouped map
    grouped.forEach((procMap, proc) => {
        const procId = `n-${proc.replace(/[^a-zA-Z0-9_-]/g,'_')}`;
        pushNode(procId, '#', proc, {}, 'fa fa-folder');
        procMap.forEach((items, itemLabel) => {
            const itemId = `${procId}-${itemLabel.replace(/[^a-zA-Z0-9_-]/g,'_')}`;
            pushNode(itemId, procId, itemLabel, {}, 'fa fa-folder');
            // sort images by sort_order then uploaded
            items.sort((a,b) => {
                const sa = a.obj.sort_order ?? 0;
                const sb = b.obj.sort_order ?? 0;
                if (sa !== sb) return sa - sb;
                return new Date(a.obj.uploaded || 0) - new Date(b.obj.uploaded || 0);
            });
            items.forEach((it, idx) => {
                const fname = `${idx+1}${it.filename.includes('.') ? it.filename.substring(it.filename.lastIndexOf('.')) : ''}`;
                const leafPath = `${proc}/${itemLabel}/${fname}`;
                const leafId = `n-${leafPath.replace(/[^a-zA-Z0-9_-]/g,'_')}`;
                const leaf = pushNode(leafId, itemId, fname, { 'data-key': it.obj.key }, 'fa fa-file-image');
                if (leaf) leaf.li_attr = { 'data-url': `/api/r2_object?key=${encodeURIComponent(it.obj.key)}`, 'data-key': it.obj.key };
            });
        });
    });

    // Render jsTree
    try {
        // Use wholerow so the entire row is clickable
        $(container).jstree({ core: { data: nodes, themes: { icons: true } }, plugins: ['wholerow'] });

        $(container).on('select_node.jstree', function (e, data) {
            const node = data.node;
            // if node has data-url render preview
            const liAttr = node.li_attr || {};
            const fileUrl = liAttr['data-url'];
            const fileKey = liAttr['data-key'];
            if (fileUrl) {
                preview.innerHTML = `<img src="${fileUrl}" style="max-width:100%; max-height:80vh; object-fit:contain; border-radius:6px;" />`;
                deleteBtn.style.display = 'inline-flex';
                deleteBtn.dataset.key = fileKey;
            } else {
                // Toggle folder open/close when clicking the row
                try {
                    $(container).jstree(true).toggle_node(node.id);
                } catch (e) { }
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
                // Refresh view
                loadGalleryView();
            } catch (err) {
                alert('Erro ao apagar: ' + err.message);
            }
        };
    } catch (err) {
        container.innerHTML = `<div style="padding:1rem; color:var(--text-secondary);">Erro a renderizar a árvore: ${err.message}</div>`;
    }
}
