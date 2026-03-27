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

    list.forEach((obj) => {
        let parts = obj.key.split('/').filter(Boolean);
        // Heuristic: keys like product-<id>-...ext -> group as product/<id>/filename
        if (parts.length === 1) {
            const m = parts[0].match(/^product-(\d+)-.*$/i);
            if (m) {
                const pid = m[1];
                const filename = parts[0];
                parts = ['product', pid, filename];
            } else {
                // fallback grouping under 'Other'
                parts = ['Other', parts[0]];
            }
        }

        let parent = '#';
        let pathSoFar = '';
        parts.forEach((part, i) => {
            pathSoFar = pathSoFar ? pathSoFar + '/' + part : part;
            const id = `n-${pathSoFar.replace(/[^a-zA-Z0-9_-]/g,'_')}`;
            const isFile = i === parts.length - 1 && part.match(/\.(jpe?g|png|webp|gif|bmp|svg)$/i);
            const iconClass = isFile ? 'fa fa-file-image' : 'fa fa-folder';
            pushNode(id, parent === '#' ? '#' : parent, part, { 'data-key': pathSoFar }, iconClass);
            parent = id;
        });

        const leafId = `n-${parts.join('/').replace(/[^a-zA-Z0-9_-]/g,'_')}`;
        const leaf = nodes.find(n => n.id === leafId);
        if (leaf) leaf.li_attr = { 'data-url': `/api/r2_object?key=${encodeURIComponent(obj.key)}`, 'data-key': obj.key };
    });

    // Render jsTree
    try {
        $(container).jstree({ core: { data: nodes, themes: { icons: true } } });

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
