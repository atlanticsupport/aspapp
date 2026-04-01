import { searchInput, views } from './core/dom.js';
import { state } from './core/state.js';
import { showToast } from './core/ui.js';
import { navigateTo } from './views/views.js';

const IMAGE_FILE_PATTERN = /\.(avif|bmp|gif|heic|heif|jfif|jpeg|jpg|png|svg|webp)$/i;

const galleryState = {
    processes: [],
    filteredProcesses: [],
    selected: null,
    search: '',
    expandedProcessIds: new Set(),
    selectedFolders: new Set(),
    folderSelectionAnchor: null
};

function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function escapeAttr(value = '') {
    return escapeHtml(value);
}

function slugify(value = '') {
    return String(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}

function sanitizeZipSegment(value = '', fallback = 'Sem nome') {
    const cleaned = String(value || '')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/\.+$/g, '')
        .trim();

    return cleaned || fallback;
}

function sanitizeZipFileName(value = '', fallback = 'ficheiro') {
    const cleaned = String(value || '')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/\.+$/g, '')
        .trim();

    return cleaned || fallback;
}

function formatFileSize(bytes = 0) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exponent;
    return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function formatUploadedDate(value) {
    if (!value) return 'Sem data';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Sem data';
    return new Intl.DateTimeFormat('pt-PT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function getFileExtension(filename = '') {
    const match = String(filename).match(/\.([^.]+)$/);
    return match ? match[1].toUpperCase() : 'Ficheiro';
}

function getFileTypeLabel(file) {
    const extension = getFileExtension(file?.filename || file?.key || '');
    return `${extension} Image`;
}

function ensureJsZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);

    return new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-gallery-jszip="true"]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.JSZip), { once: true });
            existing.addEventListener('error', reject, { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
        script.dataset.galleryJszip = 'true';
        script.onload = () => resolve(window.JSZip);
        script.onerror = () => reject(new Error('Falha ao carregar JSZip.'));
        document.head.appendChild(script);
    });
}

function isImageObject(item) {
    return IMAGE_FILE_PATTERN.test(item?.key || item?.name || '');
}

function buildFolderLabel(item) {
    const description = String(item?.description || item?.product_name || item?.name || '').trim();
    const partNumber = String(item?.part_number || '').trim();

    if (description && partNumber) return `${description} / ${partNumber}`;
    if (description) return description;
    if (partNumber) return partNumber;

    const filename = (item?.key || '').split('/').pop() || '';
    const baseName = filename.replace(/\.[^/.]+$/, '');
    const friendly = baseName.replace(/[-_]+/g, ' ').trim();
    return friendly || 'Sem identificação';
}

function getFolderKey(processId = '', folderId = '') {
    return `${processId}::${folderId}`;
}

function splitFolderKey(key = '') {
    const [processId = '', folderId = ''] = String(key).split('::');
    return { processId, folderId };
}

function getVisibleFolderEntries(processes = galleryState.filteredProcesses) {
    return processes.flatMap(process =>
        process.folders.map(folder => ({
            key: getFolderKey(process.id, folder.id),
            process,
            folder
        }))
    );
}

function getResolvedFolderEntry(key, source = galleryState.processes) {
    const { processId, folderId } = splitFolderKey(key);
    if (!processId || !folderId) return null;

    const process = source.find(item => item.id === processId);
    const folder = process?.folders.find(item => item.id === folderId);
    if (!process || !folder) return null;

    return { key, process, folder };
}

function getSelectedFolderEntries(source = galleryState.processes) {
    return [...galleryState.selectedFolders]
        .map(key => getResolvedFolderEntry(key, source))
        .filter(Boolean);
}

function setSelectedFolders(keys = []) {
    galleryState.selectedFolders = new Set(keys);

    const selectedEntries = getSelectedFolderEntries();
    if (selectedEntries.length === 1) {
        const [entry] = selectedEntries;
        galleryState.selected = {
            type: 'folder',
            processId: entry.process.id,
            folderId: entry.folder.id
        };
        galleryState.folderSelectionAnchor = entry.key;
        return;
    }

    if (selectedEntries.length > 1) {
        const [firstEntry] = selectedEntries;
        galleryState.selected = {
            type: 'multi-folder',
            processId: firstEntry.process.id,
            folderId: firstEntry.folder.id
        };
        if (!galleryState.folderSelectionAnchor) {
            galleryState.folderSelectionAnchor = firstEntry.key;
        }
        return;
    }

    galleryState.selected = null;
    galleryState.folderSelectionAnchor = null;
}

function summarizeFolders(folders = []) {
    return folders.reduce(
        (totals, folder) => ({
            totalImages: totals.totalImages + Number(folder.totalImages || 0),
            totalSize: totals.totalSize + Number(folder.totalSize || 0)
        }),
        { totalImages: 0, totalSize: 0 }
    );
}

function createStructuredGallery(rawList = []) {
    const processMap = new Map();

    rawList
        .filter(isImageObject)
        .map(item => ({
            ...item,
            processLabel:
                item.sales_process?.trim() ||
                item.product_name?.trim() ||
                (item.key?.includes('/') ? item.key.split('/')[0] : 'Processo'),
            folderLabel: buildFolderLabel(item),
            filename: (item.key || '').split('/').pop() || item.key || 'ficheiro',
            previewUrl: `/api/r2_thumbnail?key=${encodeURIComponent(item.key)}&w=520&h=520&q=78`,
            fullUrl: `/api/r2_object?key=${encodeURIComponent(item.key)}`,
            uploadedLabel: formatUploadedDate(item.uploaded)
        }))
        .sort((a, b) => {
            if (a.processLabel !== b.processLabel)
                return a.processLabel.localeCompare(b.processLabel, 'pt');
            if (a.folderLabel !== b.folderLabel)
                return a.folderLabel.localeCompare(b.folderLabel, 'pt');
            const orderDiff = Number(a.sort_order || 0) - Number(b.sort_order || 0);
            if (orderDiff !== 0) return orderDiff;
            return String(a.filename).localeCompare(String(b.filename), 'pt');
        })
        .forEach(item => {
            const processKey = slugify(item.processLabel) || 'sem-processo';
            const folderIdentity =
                item.product_id != null && item.product_id !== ''
                    ? `product-${String(item.product_id)}`
                    : `label-${slugify(item.folderLabel) || 'sem-pasta'}`;
            const folderKey = `${processKey}::${folderIdentity}`;

            if (!processMap.has(processKey)) {
                processMap.set(processKey, {
                    id: processKey,
                    label: item.processLabel,
                    folders: new Map(),
                    totalImages: 0,
                    totalSize: 0
                });
            }

            const process = processMap.get(processKey);
            if (!process.folders.has(folderKey)) {
                process.folders.set(folderKey, {
                    id: folderKey,
                    processId: processKey,
                    label: item.folderLabel,
                    productId: item.product_id ?? null,
                    files: [],
                    totalImages: 0,
                    totalSize: 0
                });
            }

            const folder = process.folders.get(folderKey);
            folder.files.push(item);
            folder.totalImages += 1;
            folder.totalSize += Number(item.size || 0);
            process.totalImages += 1;
            process.totalSize += Number(item.size || 0);
        });

    return [...processMap.values()].map(process => {
        const folders = [...process.folders.values()];
        const labelCounts = folders.reduce((counts, folder) => {
            counts.set(folder.label, (counts.get(folder.label) || 0) + 1);
            return counts;
        }, new Map());

        folders.forEach(folder => {
            folder.baseLabel = folder.label;
            folder.archiveLabel = folder.label;

            const isDuplicateLabel = (labelCounts.get(folder.label) || 0) > 1;
            if (isDuplicateLabel && folder.productId != null && folder.productId !== '') {
                const suffix = ` · #${folder.productId}`;
                folder.label = `${folder.label}${suffix}`;
                folder.archiveLabel = `${folder.archiveLabel}${suffix}`;
            }
        });

        return {
            ...process,
            folders
        };
    });
}

function filterProcesses(processes, query) {
    if (!query) return processes;
    const needle = query.toLowerCase();

    return processes
        .map(process => {
            const matchesProcess = process.label.toLowerCase().includes(needle);
            const folders = process.folders.filter(folder => {
                if (matchesProcess) return true;
                if (folder.label.toLowerCase().includes(needle)) return true;
                return folder.files.some(
                    file =>
                        file.filename.toLowerCase().includes(needle) ||
                        (file.part_number || '').toLowerCase().includes(needle) ||
                        (file.product_name || '').toLowerCase().includes(needle)
                );
            });

            const totals = summarizeFolders(folders);

            return {
                ...process,
                folders,
                totalImages: totals.totalImages,
                totalSize: totals.totalSize
            };
        })
        .filter(process => process.folders.length > 0);
}

function getAllFiles() {
    return galleryState.processes.flatMap(process =>
        process.folders.flatMap(folder =>
            folder.files.map(file => ({
                ...file,
                processId: process.id,
                processLabel: process.label,
                folderId: folder.id,
                folderLabel: folder.label,
                folderArchiveLabel: folder.archiveLabel || folder.label
            }))
        )
    );
}

function resolveSelection(source = galleryState.processes) {
    if (galleryState.selectedFolders.size > 1 || galleryState.selected?.type === 'multi-folder') {
        const folders = getSelectedFolderEntries(source);
        if (folders.length > 1) {
            return {
                type: 'multi-folder',
                folders,
                process: folders[0]?.process || null,
                folder: null,
                file: null
            };
        }
    }

    if (!galleryState.selected) return null;

    const { type, processId, folderId, key } = galleryState.selected;
    const process = source.find(item => item.id === processId);
    const folder = process?.folders.find(item => item.id === folderId);
    const file = folder?.files.find(item => item.key === key);

    if (type === 'process' && process) return { type, process, folder: null, file: null };
    if (type === 'folder' && process && folder) return { type, process, folder, file: null };
    if (type === 'file' && process && folder && file) return { type, process, folder, file };

    return null;
}

function getSelectionFiles(selection) {
    if (!selection?.type) return [];
    if (selection.type === 'multi-folder') {
        return (selection.folders || []).flatMap(entry =>
            (entry.folder?.files || []).map(file => ({
                ...file,
                processLabel: entry.process?.label || file.processLabel || '',
                folderLabel: entry.folder?.label || file.folderLabel || '',
                folderArchiveLabel:
                    entry.folder?.archiveLabel || entry.folder?.label || file.folderArchiveLabel || ''
            }))
        );
    }
    if (selection.type === 'file') {
        if (!selection.file) return [];
        return [
            {
                ...selection.file,
                processLabel: selection.process?.label || selection.file.processLabel || '',
                folderLabel: selection.folder?.label || selection.file.folderLabel || '',
                folderArchiveLabel:
                    selection.folder?.archiveLabel || selection.folder?.label || selection.file.folderArchiveLabel || ''
            }
        ];
    }
    if (selection.type === 'folder') {
        return (selection.folder?.files || []).map(file => ({
            ...file,
            processLabel: selection.process?.label || file.processLabel || '',
            folderLabel: selection.folder?.label || file.folderLabel || '',
            folderArchiveLabel:
                selection.folder?.archiveLabel || selection.folder?.label || file.folderArchiveLabel || ''
        }));
    }
    if (selection.type === 'process') {
        return (
            selection.process?.folders.flatMap(folder =>
                folder.files.map(file => ({
                    ...file,
                    processLabel: selection.process?.label || file.processLabel || '',
                    folderLabel: folder.label || file.folderLabel || '',
                    folderArchiveLabel: folder.archiveLabel || folder.label || file.folderArchiveLabel || ''
                }))
            ) || []
        );
    }
    return [];
}

function buildArchivePath(file) {
    const processLabel = sanitizeZipSegment(file.processLabel || file.sales_process || 'Sem Processo');
    const folderLabel = sanitizeZipSegment(
        file.folderArchiveLabel || file.folderLabel || file.product_name || file.part_number || 'Sem Item'
    );
    const fileName = sanitizeZipFileName(file.filename || file.key || 'ficheiro');
    return `${processLabel}/${folderLabel}/Fotos/${fileName}`;
}

function getDefaultSelection(processes = galleryState.filteredProcesses) {
    const firstProcess = processes[0];

    if (firstProcess) {
        return {
            type: 'process',
            processId: firstProcess.id
        };
    }

    return null;
}

function ensureSelectionVisible() {
    if (!galleryState.filteredProcesses.length) {
        galleryState.selected = null;
        return;
    }

    if (galleryState.selectedFolders.size > 0) {
        return;
    }

    const visibleSelection = resolveSelection(galleryState.filteredProcesses);
    if (visibleSelection) return;

    galleryState.selected = getDefaultSelection(galleryState.filteredProcesses);
}

function setSelection(nextSelection, options = {}) {
    galleryState.selected = nextSelection;
    if (nextSelection?.type === 'folder') {
        const folderKey = getFolderKey(nextSelection.processId || '', nextSelection.folderId || '');
        galleryState.selectedFolders = new Set(folderKey ? [folderKey] : []);
        galleryState.folderSelectionAnchor = folderKey || null;
    } else if (nextSelection?.type === 'multi-folder') {
        galleryState.folderSelectionAnchor = galleryState.folderSelectionAnchor || null;
    } else {
        galleryState.selectedFolders.clear();
        galleryState.folderSelectionAnchor = null;
    }

    if (options.expandProcess && nextSelection?.processId) {
        galleryState.expandedProcessIds.add(nextSelection.processId);
    }

    renderGalleryTree();
    renderPreview();
}

function toggleFolderSelection(processId, folderId, { ctrlKey = false, shiftKey = false } = {}) {
    const folderKey = getFolderKey(processId, folderId);
    const visibleFolders = getVisibleFolderEntries(galleryState.filteredProcesses);
    const visibleIndex = visibleFolders.findIndex(item => item.key === folderKey);
    const anchorKey = galleryState.folderSelectionAnchor;
    let nextKeys = null;

    if (shiftKey && anchorKey) {
        const anchorIndex = visibleFolders.findIndex(item => item.key === anchorKey);
        const startIndex = anchorIndex === -1 ? visibleIndex : Math.min(anchorIndex, visibleIndex);
        const endIndex = anchorIndex === -1 ? visibleIndex : Math.max(anchorIndex, visibleIndex);
        const rangeKeys =
            startIndex >= 0 && endIndex >= 0
                ? visibleFolders.slice(startIndex, endIndex + 1).map(item => item.key)
                : [folderKey];

        const nextKeysSet = ctrlKey
            ? new Set([...galleryState.selectedFolders, ...rangeKeys])
            : new Set(rangeKeys);

        galleryState.folderSelectionAnchor = folderKey;
        nextKeys = [...nextKeysSet];
    } else if (ctrlKey) {
        const nextKeysSet = new Set(galleryState.selectedFolders);
        if (nextKeysSet.has(folderKey)) nextKeysSet.delete(folderKey);
        else nextKeysSet.add(folderKey);
        galleryState.folderSelectionAnchor = folderKey;
        nextKeys = [...nextKeysSet];
    } else {
        galleryState.folderSelectionAnchor = folderKey;
        nextKeys = [folderKey];
    }

    setSelectedFolders(nextKeys);
    renderGalleryTree();
    renderPreview();
}

function toggleProcess(processId) {
    if (!processId) return;

    if (galleryState.expandedProcessIds.has(processId)) {
        galleryState.expandedProcessIds.delete(processId);
    } else {
        galleryState.expandedProcessIds.add(processId);
    }

    renderGalleryTree();
}

function buildBreadcrumbSegments(selection) {
    const segments = [
        {
            label: 'Staging',
            selection: getDefaultSelection(galleryState.filteredProcesses)
        }
    ];

    if (!selection?.type) return segments;

    if (selection.type === 'multi-folder') {
        segments.push({
            label: `${selection.folders?.length || 0} pastas selecionadas`,
            selection: null
        });
        return segments;
    }

    if (selection.process) {
        segments.push({
            label: selection.process.label,
            selection: {
                type: 'process',
                processId: selection.process.id
            }
        });
    }

    if (selection.folder) {
        segments.push({
            label: selection.folder.label,
            selection: {
                type: 'folder',
                processId: selection.process?.id || '',
                folderId: selection.folder.id
            }
        });
    }

    if (selection.file) {
        segments.push({
            label: selection.file.filename,
            selection: null
        });
    }

    return segments;
}

function renderBreadcrumb(segments = []) {
    const breadcrumbNode = document.getElementById('gallery-breadcrumb');
    const addressNode = document.getElementById('gallery-address');
    if (!breadcrumbNode || !addressNode) return;

    const safeSegments = segments.length ? segments : buildBreadcrumbSegments(null);
    const address = safeSegments.map(segment => segment.label).join(' \\ ');

    addressNode.textContent = address;
    breadcrumbNode.innerHTML = safeSegments
        .map((segment, index) => {
            const isLast = index === safeSegments.length - 1;
            const separator =
                index < safeSegments.length - 1 ? '<i class="fa-solid fa-chevron-right"></i>' : '';

            if (!segment.selection || isLast) {
                return `
                    <span class="gallery-crumb current">
                        ${escapeHtml(segment.label)}
                    </span>
                    ${separator}
                `;
            }

            return `
                <button
                    type="button"
                    class="gallery-crumb"
                    data-breadcrumb='${escapeAttr(JSON.stringify(segment.selection))}'
                >
                    ${escapeHtml(segment.label)}
                </button>
                ${separator}
            `;
        })
        .join('');

    breadcrumbNode.querySelectorAll('[data-breadcrumb]').forEach(button => {
        button.addEventListener('click', () => {
            try {
                const selection = JSON.parse(button.dataset.breadcrumb || 'null');
                if (selection) setSelection(selection);
            } catch (error) {
                console.error('Breadcrumb parse error:', error);
            }
        });
    });
}

function updatePreviewHeader({ title, meta, segments }) {
    const titleNode = document.getElementById('gallery-preview-title');
    const metaNode = document.getElementById('gallery-preview-meta');

    if (titleNode) titleNode.textContent = title;
    if (metaNode) metaNode.textContent = meta;

    renderBreadcrumb(segments);
}

function updateStatusBar(left = '', right = '') {
    const statusNode = document.getElementById('gallery-statusbar');
    if (!statusNode) return;

    statusNode.innerHTML = `
        <span>${escapeHtml(left)}</span>
        <span>${escapeHtml(right)}</span>
    `;
}

function updateGalleryActionButtons(selection) {
    const jumpBtn = document.getElementById('gallery-jump-btn');
    const downloadBtn = document.getElementById('gallery-download-btn');
    if (!jumpBtn || !downloadBtn) return;

    const canJump = selection?.type === 'process' || selection?.type === 'folder';
    if (!canJump) {
        jumpBtn.style.display = 'none';
        jumpBtn.dataset.jumpType = '';
        jumpBtn.dataset.processLabel = '';
        jumpBtn.dataset.folderLabel = '';
        jumpBtn.dataset.folderProductId = '';
        return;
    }

    jumpBtn.style.display = 'inline-flex';
    jumpBtn.dataset.jumpType = selection.type;
    jumpBtn.dataset.processLabel = selection.process?.label || '';
    jumpBtn.dataset.folderLabel = selection.folder?.baseLabel || selection.folder?.label || '';
    jumpBtn.dataset.folderProductId =
        selection.folder?.productId != null ? String(selection.folder.productId) : '';
    jumpBtn.innerHTML = `
        <i class="fa-solid fa-arrow-right"></i>
        ${selection.type === 'process' ? 'Ir para processo' : 'Ir para item'}
    `;
}

function renderGalleryTree() {
    const tree = document.getElementById('gallery-tree-container');
    if (!tree) return;

    if (!galleryState.filteredProcesses.length) {
        tree.innerHTML = `
            <div class="gallery-empty-state compact">
                <i class="fa-solid fa-magnifying-glass"></i>
                <p>Não encontrámos resultados para esta pesquisa.</p>
            </div>
        `;
        return;
    }

    tree.innerHTML = `
        <div class="gallery-tree-root">
            <div class="gallery-tree-root-row">
                <span class="gallery-tree-root-copy">
                    <strong>Processo</strong>
                    <small>Item / Fotos</small>
                </span>
            </div>
            <div class="gallery-tree-children root">
                ${galleryState.filteredProcesses
                    .map(process => {
                        const isExpanded = galleryState.expandedProcessIds.has(process.id);
                        const isProcessSelected =
                            galleryState.selected?.type === 'process' &&
                            galleryState.selected?.processId === process.id;
                        const hasSelectedFolders = [...galleryState.selectedFolders].some(
                            key => splitFolderKey(key).processId === process.id
                        );

                        const foldersMarkup = process.folders
                            .map(folder => {
                                const isFolderSelected =
                                    galleryState.selectedFolders.has(
                                        getFolderKey(process.id, folder.id)
                                    ) ||
                                    (galleryState.selected?.type === 'folder' &&
                                        galleryState.selected?.processId === process.id &&
                                        galleryState.selected?.folderId === folder.id);

                                return `
                                    <button
                                        type="button"
                                        class="gallery-tree-item child ${isFolderSelected ? 'active' : ''}"
                                        data-node-type="folder"
                                        data-process-id="${escapeAttr(process.id)}"
                                        data-folder-id="${escapeAttr(folder.id)}"
                                    >
                                        <span class="gallery-tree-icon folder">
                                            <i class="fa-solid fa-folder"></i>
                                        </span>
                                        <span class="gallery-tree-copy">
                                            <strong>${escapeHtml(folder.label)}</strong>
                                            <small>${folder.totalImages} fotos</small>
                                        </span>
                                    </button>
                                `;
                            })
                            .join('');

                        return `
                            <div class="gallery-tree-branch">
                                <div class="gallery-tree-branch-row ${isProcessSelected || hasSelectedFolders ? 'active' : ''}">
                                    <button
                                        type="button"
                                        class="gallery-tree-toggle"
                                        data-toggle-process="${escapeAttr(process.id)}"
                                        aria-label="${isExpanded ? 'Fechar' : 'Abrir'} ${escapeAttr(process.label)}"
                                    >
                                        <i class="fa-solid fa-chevron-right ${isExpanded ? 'open' : ''}"></i>
                                    </button>
                                    <button
                                        type="button"
                                        class="gallery-tree-item process ${(isProcessSelected || hasSelectedFolders) ? 'active' : ''}"
                                        data-node-type="process"
                                        data-process-id="${escapeAttr(process.id)}"
                                    >
                                        <span class="gallery-tree-icon process">
                                            <i class="fa-solid fa-diagram-project"></i>
                                        </span>
                                        <span class="gallery-tree-copy">
                                            <strong>${escapeHtml(process.label)}</strong>
                                            <small>${process.folders.length} itens</small>
                                        </span>
                                        <span class="gallery-tree-meta">${process.totalImages}</span>
                                    </button>
                                </div>
                                <div class="gallery-tree-children ${isExpanded ? '' : 'collapsed'}">
                                    ${foldersMarkup}
                                </div>
                            </div>
                        `;
                    })
                    .join('')}
            </div>
        </div>
    `;

    tree.querySelectorAll('[data-toggle-process]').forEach(button => {
        button.addEventListener('click', () => toggleProcess(button.dataset.toggleProcess));
    });

    tree.querySelectorAll('[data-node-type="process"]').forEach(button => {
        button.addEventListener('click', () => {
            galleryState.selectedFolders.clear();
            galleryState.folderSelectionAnchor = null;
            setSelection({
                type: 'process',
                processId: button.dataset.processId
            }, { expandProcess: false });
        });
    });

    tree.querySelectorAll('[data-node-type="folder"]').forEach(button => {
        button.addEventListener('click', event => {
            toggleFolderSelection(button.dataset.processId, button.dataset.folderId, {
                ctrlKey: event.ctrlKey || event.metaKey,
                shiftKey: event.shiftKey
            });
        });
    });
}

function renderExplorerList(files, selection, columns) {
    const preview = document.getElementById('gallery-preview-content');
    const downloadBtn = document.getElementById('gallery-download-btn');
    if (!preview || !downloadBtn) return;

    const title =
        selection?.type === 'process'
            ? selection.process?.label || 'Processo'
            : selection.folder?.label || 'Pasta';
    const segments = buildBreadcrumbSegments(selection);

    updatePreviewHeader({
        title,
        meta: `${files.length} imagem(ns)`,
        segments
    });

    updateGalleryActionButtons(selection);
    downloadBtn.style.display = files.length ? 'inline-flex' : 'none';

    if (!files.length) {
        preview.innerHTML = `
            <div class="gallery-empty-state">
                <i class="fa-regular fa-images"></i>
                <p>Não existem imagens nesta seleção.</p>
            </div>
        `;
        return;
    }

    preview.innerHTML = `
        <div class="gallery-grid-shell cols-${columns}">
            ${files
                .map(file => {
                    const label = escapeHtml(file.filename);
                    return `
                        <button type="button" class="gallery-grid-card" data-file-key="${escapeAttr(file.key)}">
                            <img
                                class="gallery-grid-thumb"
                                src="${escapeAttr(file.previewUrl)}"
                                alt="${escapeAttr(file.filename)}"
                                loading="lazy"
                            >
                            <span class="gallery-grid-label">${label}</span>
                        </button>
                    `;
                })
                .join('')}
        </div>
    `;

    preview.querySelectorAll('[data-file-key]').forEach(row => {
        row.addEventListener('click', () => {
            const file = files.find(item => item.key === row.dataset.fileKey);
            if (!file) return;
            setSelection({
                type: 'file',
                processId: selection.process?.id || '',
                folderId: file.folderId || selection.folder?.id || '',
                key: file.key
            });
        });
    });
}

function renderSinglePreview(selection) {
    const preview = document.getElementById('gallery-preview-content');
    const downloadBtn = document.getElementById('gallery-download-btn');
    if (!preview || !downloadBtn || !selection?.file) return;

    const { file, process, folder } = selection;

    updatePreviewHeader({
        title: file.filename,
        meta: '1 imagem',
        segments: buildBreadcrumbSegments(selection)
    });

    updateGalleryActionButtons(null);
    downloadBtn.style.display = 'inline-flex';

    preview.innerHTML = `
        <div class="gallery-grid-shell cols-1">
            <button type="button" class="gallery-grid-card single">
                <img class="gallery-grid-thumb" src="${escapeAttr(file.fullUrl)}" alt="${escapeAttr(file.filename)}">
                <span class="gallery-grid-label">${escapeHtml(file.filename)}</span>
            </button>
            <button type="button" class="gallery-back-btn" id="gallery-back-to-folder">
                Voltar
            </button>
            <div class="gallery-file-path">${escapeHtml(process?.label || '')} / ${escapeHtml(folder?.label || '')}</div>
            </div>
    `;

    document.getElementById('gallery-back-to-folder')?.addEventListener('click', () => {
        if (folder?.id) {
            setSelection({
                type: 'folder',
                processId: process?.id || '',
                folderId: folder.id
            });
            return;
        }

        if (process?.id) {
            setSelection({
                type: 'process',
                processId: process.id
            });
        }
    });
}

function renderMultiFolderPreview(selection) {
    const preview = document.getElementById('gallery-preview-content');
    const downloadBtn = document.getElementById('gallery-download-btn');
    if (!preview || !downloadBtn) return;

    const folders = selection?.folders || [];
    const files = getSelectionFiles(selection);
    const totalFolders = folders.length;
    const totalImages = files.length;

    updatePreviewHeader({
        title: `${totalFolders} pastas selecionadas`,
        meta: `${totalImages} imagem(ns)`,
        segments: [
            {
                label: 'Staging',
                selection: getDefaultSelection(galleryState.filteredProcesses)
            },
            {
                label: `${totalFolders} pastas`,
                selection: null
            }
        ]
    });

    updateGalleryActionButtons(null);
    downloadBtn.style.display = totalImages ? 'inline-flex' : 'none';

    if (!folders.length) {
        preview.innerHTML = `
            <div class="gallery-empty-state">
                <i class="fa-regular fa-images"></i>
                <p>Seleciona uma ou mais pastas para descarregar em lote.</p>
            </div>
        `;
        return;
    }

    preview.innerHTML = `
        <div class="gallery-grid-shell cols-1">
            <div class="gallery-selection-summary">
                <p class="gallery-selection-summary-title">${escapeHtml(`${totalFolders} pastas selecionadas`)}</p>
                <div class="gallery-selection-summary-list">
                    ${folders
                        .map(entry => {
                            const folderCount = entry.folder?.files?.length || 0;
                            return `
                                <div class="gallery-selection-summary-row">
                                    <strong>${escapeHtml(entry.process?.label || '')}</strong>
                                    <span>${escapeHtml(entry.folder?.label || '')}</span>
                                    <small>${folderCount} fotos</small>
                                </div>
                            `;
                        })
                        .join('')}
                </div>
            </div>
        </div>
    `;
}

function renderPreview() {
    const preview = document.getElementById('gallery-preview-content');
    const downloadBtn = document.getElementById('gallery-download-btn');
    if (!preview || !downloadBtn) return;

    const selection = resolveSelection(galleryState.filteredProcesses) || resolveSelection();

    if (selection?.type === 'multi-folder') {
        renderMultiFolderPreview(selection);
        return;
    }

    if (!selection?.type) {
        const totalImages = getAllFiles().length;
        updatePreviewHeader({
            title: 'Galeria de Imagens',
            meta: `${totalImages} imagem(ns)`,
            segments: buildBreadcrumbSegments(null)
        });
        updateGalleryActionButtons(null);
        downloadBtn.style.display = 'none';
        preview.innerHTML = `
            <div class="gallery-empty-state">
                <i class="fa-regular fa-images"></i>
                <p>Seleciona um processo na esquerda.</p>
            </div>
        `;
        return;
    }

    if (selection.type === 'file') {
        updateGalleryActionButtons(null);
        renderSinglePreview(selection);
        return;
    }

    if (selection.type === 'process') {
        const files =
            selection.process?.folders.flatMap(folder =>
                folder.files.map(file => ({
                    ...file,
                    processId: selection.process?.id || '',
                    processLabel: selection.process?.label || '',
                    folderId: folder.id,
                    folderLabel: folder.label,
                    folderArchiveLabel: folder.archiveLabel || folder.label
                }))
            ) || [];

        renderExplorerList(files, selection, 5);
        return;
    }

    if (selection.type === 'folder') {
        const files =
            selection.folder?.files.map(file => ({
                ...file,
                processId: selection.process?.id || '',
                processLabel: selection.process?.label || '',
                folderId: selection.folder?.id || '',
                folderLabel: selection.folder?.label || '',
                folderArchiveLabel: selection.folder?.archiveLabel || selection.folder?.label || ''
            })) || [];

        renderExplorerList(files, selection, 3);
    }
}

async function downloadFile(file) {
    const response = await fetch(file.fullUrl);
    if (!response.ok) {
        throw new Error('Falha ao descarregar a imagem.');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

async function downloadMany(files, archiveName) {
    if (!files.length) return;

    await ensureJsZip();
    const zip = new window.JSZip();

    for (const file of files) {
        const response = await fetch(file.fullUrl);
        if (!response.ok) continue;
        const buffer = await response.arrayBuffer();
        zip.file(buildArchivePath(file), buffer);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${archiveName || 'galeria'}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function attachGalleryEvents() {
    const search = document.getElementById('gallery-search');
    const jumpBtn = document.getElementById('gallery-jump-btn');
    const downloadBtn = document.getElementById('gallery-download-btn');

    if (search) {
        search.addEventListener('input', event => {
            galleryState.search = event.target.value.trim();
            galleryState.filteredProcesses = filterProcesses(
                galleryState.processes,
                galleryState.search
            );
            ensureSelectionVisible();
            renderGalleryTree();
            renderPreview();
        });
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            const selection = resolveSelection();
            if (!selection?.type) return;

            const originalHtml = downloadBtn.innerHTML;
            downloadBtn.disabled = true;
            downloadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> A preparar';

            try {
                if (selection.type === 'file' && selection.file) {
                    await downloadFile(selection.file);
                    return;
                }

                const files = getSelectionFiles(selection);
                const archiveName =
                    selection.type === 'folder'
                        ? selection.folder?.label
                        : selection.type === 'multi-folder'
                            ? 'pastas-selecionadas'
                            : selection.process?.label;
                await downloadMany(files, slugify(archiveName || 'galeria'));
            } catch (error) {
                console.error('Gallery download error:', error);
                alert(`Erro ao descarregar: ${error.message || error}`);
            } finally {
                downloadBtn.disabled = false;
                downloadBtn.innerHTML = originalHtml;
            }
        });
    }

    if (jumpBtn) {
        jumpBtn.addEventListener('click', async () => {
            const selection = resolveSelection(galleryState.filteredProcesses) || resolveSelection();
            if (!selection || (selection.type !== 'process' && selection.type !== 'folder')) return;

            const processLabel = selection.process?.label || '';
            const folderLabel = selection.folder?.baseLabel || selection.folder?.label || '';
            const targetFilter = selection.type === 'process' ? processLabel : folderLabel;
            const targetProductId =
                selection.type === 'folder' && selection.folder?.productId != null
                    ? Number(selection.folder.productId)
                    : null;

            state.currentFilter = targetFilter;
            state.inventoryPage = 0;
            if (searchInput) searchInput.value = targetFilter;

            try {
                await navigateTo('inventory');

                if (selection.type === 'folder' && Number.isFinite(targetProductId)) {
                    const product = state.products.find(item => Number(item.id) === targetProductId);
                    if (product) {
                        window.editProduct(product.id);
                    } else {
                        showToast('Não foi possível abrir o item selecionado.', 'warning');
                    }
                }
            } catch (error) {
                console.error('Gallery jump error:', error);
                showToast('Erro ao abrir os artigos em stock.', 'error');
            }
        });
    }
}

function renderShell() {
    views.gallery.innerHTML = `
        <div class="view-gallery">
            <aside class="gallery-sidebar">
                <div class="gallery-sidebar-header">
                    <div>
                        <h2>Galeria de Imagens</h2>
                        <p>Processo / Item / Fotos</p>
                    </div>

                    <label class="gallery-search-wrap">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <input type="text" id="gallery-search" placeholder="Pesquisar processo, pasta ou ficheiro">
                    </label>
                </div>

                <div class="gallery-tree-shell">
                    <div id="gallery-tree-container" class="gallery-tree"></div>
                </div>
            </aside>

            <section id="gallery-preview" class="gallery-preview-panel">
                <div class="gallery-preview-toolbar">
                    <div>
                        <h3 id="gallery-preview-title">Galeria de Imagens</h3>
                        <p id="gallery-preview-meta">A carregar...</p>
                    </div>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <button id="gallery-jump-btn" class="btn btn-secondary" style="display:none;">
                            <i class="fa-solid fa-arrow-right"></i>
                            Ir para processo
                        </button>
                        <button id="gallery-download-btn" class="btn btn-primary" style="display:none;">
                        <i class="fa-solid fa-download"></i>
                        Descarregar
                        </button>
                    </div>
                </div>

                <div id="gallery-preview-content"></div>
            </section>
        </div>
    `;

    attachGalleryEvents();
}

export async function loadGalleryView() {
    if (!views.gallery) return;

    renderShell();

    const tree = document.getElementById('gallery-tree-container');
    const titleNode = document.getElementById('gallery-preview-title');
    const metaNode = document.getElementById('gallery-preview-meta');

    try {
        const response = await fetch('/api/list_images');
        if (!response.ok) throw new Error('Não foi possível listar as imagens.');

        const rawList = await response.json();
        galleryState.processes = createStructuredGallery(rawList);
        galleryState.filteredProcesses = filterProcesses(
            galleryState.processes,
            galleryState.search
        );
        galleryState.expandedProcessIds = new Set();
        galleryState.selectedFolders.clear();
        galleryState.folderSelectionAnchor = null;
        galleryState.selected = getDefaultSelection(galleryState.filteredProcesses);

        renderGalleryTree();
        renderPreview();
    } catch (error) {
        console.error('Gallery load error:', error);
        if (titleNode) titleNode.textContent = 'Galeria indisponível';
        if (metaNode) metaNode.textContent = 'Falha ao carregar dados do staging';
        if (tree) {
            tree.innerHTML = `
                <div class="gallery-empty-state compact">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <p>${escapeHtml(error.message || 'Erro inesperado')}</p>
                </div>
            `;
        }
        updateStatusBar('Erro de carregamento', 'Sem ligação à galeria');
    }
}
