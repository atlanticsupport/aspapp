import { state } from './state.js';
import { supabase } from './supabase-client.js';
import { showToast } from './ui.js';
import { productForm, modal, imageContainer, imageInput, viewerOverlay, viewerImg } from './dom.js';
import { processImageForUpload, recordMovement } from './data.js';
import { closeViewer, openViewer } from './ag-grid-shim.js';
import { loadDashboard } from './dashboard.js';
import { loadInventory } from './inventory.js';
import { printSingleLabel } from './printing.js';
import { dialog } from './dialogs.js';
import { buildProductKey } from './product-key.js';
import {
    buildGalleryEntries,
    getEntityPrimaryImageUrl,
    getGallerySortOrder,
    getPrimaryGalleryEntry,
    normalizeGalleryAttachment,
    openViewerGallery,
    sortGalleryAttachments
} from './gallery.js';

/**
 * ACTIONS & MODALS
 */

export function openNewTransitModal() {
    closeModal();
    state.currentTransitId = 'new-transit'; // Simple flag
    openModal('Nova Chegada de Stock (Manual)');

    // Inject flag for saveProduct
    if (!document.getElementById('force-transit-status')) {
        const flag = document.createElement('input');
        flag.id = 'force-transit-status';
        flag.type = 'hidden';
        productForm.appendChild(flag);
    }
}

export function openModal(title = 'Adicionar Produto', resetForm = true) {
    modal.classList.add('open');
    if (document.getElementById('product-history-section'))
        document.getElementById('product-history-section').style.display = 'none';

    if (resetForm) {
        state.pendingAttachments = [];
        state.loadedAttachments = [];
        state.currentGallery = [];
        state.currentProductKey = null;
        const galleryList = document.getElementById('product-gallery-list');
        const transitList = document.getElementById('transit-attachments-list');
        if (galleryList) galleryList.innerHTML = '';
        if (transitList) transitList.innerHTML = '';
        // Removed state.currentTransitId = null; here to prevent destroying flag.
    }

    const transitSection = document.getElementById('transit-attachments-section');
    // Toggle Sections
    if (transitSection) transitSection.style.display = state.currentTransitId ? 'block' : 'none';

    if (title) document.getElementById('modal-title').textContent = title;

    // Permission Logic
    const isTransit = state.currentTransitId || state.currentPage === 'transit';
    const isEditing = !!document.getElementById('prod-id')?.value;
    const access = isTransit
        ? state.currentUser?.transit_access || ''
        : state.currentUser?.inventory_access || '';
    const canWrite =
        access === 'write' || (isEditing ? access.includes('U') : access.includes('C'));

    const submitBtn = productForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.style.display = canWrite ? 'inline-block' : 'none';

    const inputs = productForm.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
        if (input.type !== 'button' && input.type !== 'submit') {
            input.readOnly = !canWrite;
            if (input.tagName === 'SELECT') input.disabled = !canWrite;
        }
    });

    setupAttachmentEvents();
}

export function closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
    productForm.reset();
    document.getElementById('prod-id').value = '';
    document.getElementById('modal-title').textContent = 'Adicionar Produto';

    state.currentImageUrl = null;
    state.mainImageFile = null;
    state.currentProductKey = null;
    state.loadedAttachments = [];
    state.currentGallery = [];
    state.currentTransitId = null;
    state.pendingAttachments = [];

    const forceTransit = document.getElementById('force-transit-status');
    if (forceTransit) forceTransit.remove();

    imageContainer.innerHTML = '<i class="fa-solid fa-camera"></i>';
    imageContainer.classList.remove('has-image');

    const historySection = document.getElementById('product-history-section');
    if (historySection) historySection.style.display = 'none';

    closeViewer();
}

export function openEditModal(product) {
    state.currentProductId = product.id;
    openModal(null, true);
    state.currentProductKey = product.product_key || buildProductKey(product);

    document.getElementById('prod-id').value = product.id;
    document.getElementById('prod-part-number').value = product.part_number || '';
    document.getElementById('prod-name').value = product.name;
    document.getElementById('prod-brand').value = product.brand || product.maker || '';

    // Population
    if (document.getElementById('prod-equipment'))
        document.getElementById('prod-equipment').value = product.equipment || '';
    if (document.getElementById('prod-ship-plant'))
        document.getElementById('prod-ship-plant').value = product.ship_plant || '';
    if (document.getElementById('prod-order-to'))
        document.getElementById('prod-order-to').value = product.order_to || '';
    if (document.getElementById('prod-order-date'))
        document.getElementById('prod-order-date').value = product.order_date || '';
    if (document.getElementById('prod-del-time'))
        document.getElementById('prod-del-time').value = product.delivery_time || '';
    if (document.getElementById('prod-maker'))
        document.getElementById('prod-maker').value = product.maker || '';
    document.getElementById('prod-qty').value = product.quantity;
    const estadoSelect = document.getElementById('prod-estado');
    if (estadoSelect) estadoSelect.value = product.qty_color || '#92D050';
    document.getElementById('prod-min-qty').value = product.min_quantity ?? 0;
    document.getElementById('prod-desc').value = product.description || '';
    document.getElementById('prod-process').value = product.sales_process || '';
    document.getElementById('prod-category').value = product.category || '';

    let locValue = product.location || '';
    if (!locValue && !!state.currentTransitId) locValue = '1';
    document.getElementById('prod-location').value = locValue;
    document.getElementById('prod-pallet').value = product.pallet || '';
    document.getElementById('prod-box').value = product.box || product.box_number || '';
    document.getElementById('prod-cost-price').value = product.cost_price || '';

    // Hide cost price input if no permission
    const costPriceInput = document.getElementById('prod-cost-price');
    if (costPriceInput && costPriceInput.parentElement) {
        if (!state.currentUser?.can_view_prices && state.currentUser?.role !== 'admin') {
            costPriceInput.parentElement.style.display = 'none';
        } else {
            costPriceInput.parentElement.style.display = 'block';
        }
    }

    if (product.id) {
        document.getElementById('modal-title').innerHTML = `
            <div style="display:flex; flex-direction:column; line-height:1.2;">
                <span style="font-weight:700;">${product.name}</span>
                <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 500;">PN: ${product.part_number || '-'}</span>
            </div>
        `;
    }

    // Permission Logic for Save Button
    const isTransit = state.currentTransitId || state.currentPage === 'transit';
    const access = isTransit
        ? state.currentUser?.transit_access || ''
        : state.currentUser?.inventory_access || '';
    const canSave = access === 'write' || access.includes('U');

    const submitBtn = productForm.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.style.display = canSave ? 'inline-block' : 'none';
        submitBtn.textContent = state.currentTransitId
            ? 'Confirmar Receção'
            : product.id
              ? 'Guardar Produto'
              : 'Adicionar Produto';
    }

    if (product.image_url) updateHeaderImage(product.image_url);
    else {
        state.currentImageUrl = null;
        imageContainer.innerHTML = '<i class="fa-solid fa-camera"></i>';
        imageContainer.classList.remove('has-image');
    }

    loadHistory(product.id);
    loadProductAttachments(product.id);
}

/**
 * ATTACHMENTS LOGIC
 */

function isImageAttachment(att) {
    const type = att?.type || att?.file_type;
    return (att?.category || 'product') === 'product' && type === 'image';
}

function getCurrentProductId() {
    const rawId = document.getElementById('prod-id')?.value || state.currentProductId;
    return rawId ? parseInt(rawId, 10) : null;
}

function normalizeAttachment(att) {
    return normalizeGalleryAttachment(att, 'product');
}

function getAttachmentOrderValue(att, fallback = Number.MAX_SAFE_INTEGER) {
    return getGallerySortOrder(att, fallback);
}

function sortProductImagesByOrder(list = []) {
    return sortGalleryAttachments(list);
}

function shiftProductImageSortOrders(offset) {
    if (!offset) return;

    state.loadedAttachments = (state.loadedAttachments || []).map(att => {
        const normalized = normalizeAttachment(att);
        if (!isImageAttachment(normalized)) return normalized;
        return {
            ...normalized,
            sort_order: getAttachmentOrderValue(normalized, 0) + offset
        };
    });

    state.pendingAttachments = (state.pendingAttachments || []).map(att => {
        const normalized = normalizeAttachment(att);
        if (!isImageAttachment(normalized)) return normalized;
        return {
            ...normalized,
            sort_order: getAttachmentOrderValue(normalized, 0) + offset
        };
    });
}

function syncProductAttachmentsReference(productId = getCurrentProductId()) {
    if (!productId) return;
    const attachments = sortProductImagesByOrder(
        (state.loadedAttachments || [])
            .map(normalizeAttachment)
            .filter(att => att && att.product_id === productId)
    );

    const collections = [
        'products',
        'dashboardProducts',
        'transitProducts',
        'stockOutProducts',
        'logisticsProducts'
    ];
    collections.forEach(key => {
        const list = state[key];
        if (!Array.isArray(list)) return;
        const product = list.find(item => item.id === productId);
        if (product) product.attachments = attachments;
    });
}

function buildProductImageEntries() {
    return buildGalleryEntries({
        attachments: state.loadedAttachments || [],
        pendingAttachments: state.pendingAttachments || [],
        currentImageUrl: state.currentImageUrl,
        attachmentCategory: 'product',
        acceptedTypes: ['image']
    });
}

function getTransitMediaEntries() {
    return buildGalleryEntries({
        attachments: state.loadedAttachments || [],
        pendingAttachments: state.pendingAttachments || [],
        attachmentCategory: 'reception',
        acceptedTypes: ['image', 'video'],
        fallbackOnlyWhenEmpty: false
    });
}

function getPrimaryImageEntry(preferredUrl = null) {
    return getPrimaryGalleryEntry({
        attachments: state.loadedAttachments || [],
        pendingAttachments: state.pendingAttachments || [],
        currentImageUrl: state.currentImageUrl,
        attachmentCategory: 'product',
        acceptedTypes: ['image']
    });
}

function renderAttachmentPreview(item) {
    if ((item.type || item.file_type) === 'video') {
        return `
            <video src="${item.url}"></video>
            <div class="video-indicator"><i class="fa-solid fa-play"></i></div>
        `;
    }

    const badge = item.isPrimary
        ? '<div class="video-indicator" style="background:rgba(16,185,129,0.9);"><i class="fa-solid fa-star"></i></div>'
        : '';
    return `<img src="${item.url}" alt="Anexo">${badge}`;
}

function renderAllAttachmentItems() {
    const transitList = document.getElementById('transit-attachments-list');
    if (transitList) transitList.innerHTML = '';

    getTransitMediaEntries().forEach(entry => renderAttachmentItem(entry));
}

export function openCurrentProductGallery(preferredUrl = null) {
    const entries = buildProductImageEntries();
    if (!openViewerGallery(entries, preferredUrl)) {
        showToast('Sem imagens disponíveis.', 'info');
        return false;
    }
    return true;
}

export function setProductImagesState(product, attachments = []) {
    if (product?.id) state.currentProductId = product.id;
    state.currentProductKey = product?.product_key || buildProductKey(product || {});
    state.loadedAttachments = sortProductImagesByOrder(
        (attachments || []).map(normalizeAttachment)
    );
    state.currentImageUrl = getEntityPrimaryImageUrl(
        {
            attachments: state.loadedAttachments,
            image_url: product?.image_url || null
        },
        {
            attachmentCategory: 'product',
            acceptedTypes: ['image']
        }
    );
    state.mainImageFile = null;
    syncProductAttachmentsReference(product?.id || getCurrentProductId());
    syncProductImageReference(state.currentImageUrl);
}

function applyProductImageOrder(entries) {
    const normalizedEntries = entries.map((entry, index) => ({
        ...entry,
        sort_order: index,
        isPrimary: index === 0
    }));

    state.loadedAttachments = (state.loadedAttachments || []).map(att => {
        const normalized = normalizeAttachment(att);
        const match = normalizedEntries.find(entry => entry.attachmentId === normalized.id);
        return match ? { ...normalized, sort_order: match.sort_order } : normalized;
    });

    state.pendingAttachments = (state.pendingAttachments || []).map(att => {
        const normalized = normalizeAttachment(att);
        const match = normalizedEntries.find(entry => entry.pendingId === normalized.id);
        return match ? { ...normalized, sort_order: match.sort_order } : normalized;
    });

    state.currentImageUrl = normalizedEntries[0]?.url || null;
    state.mainImageFile = normalizedEntries[0]?.pendingId
        ? normalizedEntries[0].file || null
        : null;

    return normalizedEntries;
}

async function persistAttachmentOrder(productId, entries) {
    if (!productId) return;
    const items = entries
        .filter(entry => entry.attachmentId)
        .map(entry => ({
            id: entry.attachmentId,
            sort_order: entry.sort_order
        }));

    if (!items.length) return;

    const { error } = await supabase.rpc('secure_reorder_attachments', {
        p_user: state.currentUser.username,
        p_pass: state.currentUser.password,
        p_product_id: productId,
        p_items: items
    });

    if (error) throw error;
}

export async function moveProductImage(entry, direction) {
    const entries = buildProductImageEntries();
    const currentIndex = entries.findIndex(item => item.key === entry.key);
    const targetIndex = currentIndex + direction;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= entries.length) return;

    const reorderedEntries = [...entries];
    const [movedEntry] = reorderedEntries.splice(currentIndex, 1);
    reorderedEntries.splice(targetIndex, 0, movedEntry);

    const normalizedEntries = applyProductImageOrder(reorderedEntries);
    const productId = getCurrentProductId();

    try {
        if (productId) {
            await persistAttachmentOrder(productId, normalizedEntries);
        }

        await reconcileProductImages({
            preferredUrl: normalizedEntries[targetIndex]?.url || state.currentImageUrl,
            keepViewerSelection: true
        });
    } catch (err) {
        console.error('Error reordering images:', err);
        await loadProductAttachments(productId);
        showToast('Erro ao alterar a ordem das imagens.', 'error');
        return;
    }

    showToast('Ordem das imagens atualizada.', 'success');
}

async function reconcileProductImages(options = {}) {
    const { preferredUrl = null, keepViewerSelection = false } = options;

    const productId = getCurrentProductId();
    const { entries, primary } = getPrimaryImageEntry(preferredUrl);

    state.currentImageUrl = primary?.url || null;
    state.mainImageFile = primary?.pendingId ? primary.file || null : null;

    syncProductAttachmentsReference(productId);
    renderAllAttachmentItems();
    await updateHeaderImage(state.currentImageUrl);

    if (keepViewerSelection && viewerOverlay?.classList.contains('open')) {
        if (entries.length > 0) {
            openCurrentProductGallery(preferredUrl || state.currentImageUrl);
        } else {
            closeViewer();
        }
    }
}

function setupAttachmentEvents() {
    const galleryInput = document.getElementById('gallery-upload');
    const transitInput = document.getElementById('transit-media-upload');

    if (galleryInput) {
        galleryInput.onchange = e => handleAttachmentSelection(e, 'product');
    }
    if (transitInput) {
        transitInput.onchange = e => handleAttachmentSelection(e, 'reception');
    }
}

window.handleMultipleFiles = async function (files, category, targetListId = null, options = {}) {
    if (!files || files.length === 0) return;

    const { promoteFirstImage = false } = options;
    const productId = getCurrentProductId();
    const shouldAutoSave = !!productId;
    const productImageCount = files.filter(file => file.type.startsWith('image/')).length;
    if (category === 'product' && promoteFirstImage && productImageCount > 0) {
        shiftProductImageSortOrders(productImageCount);
    }
    const existingMaxSortOrder = buildProductImageEntries().reduce(
        (max, entry) => Math.max(max, getAttachmentOrderValue(entry, -1)),
        -1
    );

    const preparedAttachments = await Promise.all(
        files.map(
            (file, index) =>
                new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = ev => {
                        resolve({
                            id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                            file,
                            url: ev.target.result,
                            category,
                            type: file.type.startsWith('video/') ? 'video' : 'image',
                            isNew: true,
                            targetListId,
                            insertedAt: Date.now() + index,
                            persistState: 'queued',
                            sort_order:
                                category === 'product' && promoteFirstImage
                                    ? index
                                    : existingMaxSortOrder + index + 1
                        });
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                })
        )
    );

    preparedAttachments.forEach(attachment => {
        state.pendingAttachments.push(attachment);
    });

    const firstProductImage = preparedAttachments.find(
        attachment => attachment.category === 'product' && attachment.type === 'image'
    );
    if (firstProductImage && (promoteFirstImage || !state.currentImageUrl)) {
        state.currentImageUrl = firstProductImage.url;
        state.mainImageFile = firstProductImage.file;
    }

    await reconcileProductImages({
        preferredUrl: firstProductImage?.url || state.currentImageUrl,
        keepViewerSelection: true
    });

    if (shouldAutoSave) {
        try {
            for (const attachment of preparedAttachments) {
                await autoSaveAttachment(attachment, productId);
            }
            await loadProductAttachments(productId);
            showToast(`${files.length} imagem(ns) guardada(s).`, 'success');
        } catch (err) {
            console.error('Error during auto-save:', err);
            showToast('Erro ao guardar imagens.', 'error');
        }
    } else {
        showToast(`${files.length} imagem(ns) adicionada(s).`, 'success');
    }
};

window.handleAttachmentSelectionFiles = async function (files, category, options = {}) {
    window.handleMultipleFiles(files, category, null, options);
};

async function handleAttachmentSelection(e, category) {
    const files = Array.from(e.target.files);
    window.handleAttachmentSelectionFiles(files, category);
    e.target.value = '';
}

window.handleAttachmentSelection = handleAttachmentSelection;

function renderAttachmentItem(att) {
    const target = att.category === 'product' ? null : 'transit-attachments-list';
    if (!target) return;
    const list = document.getElementById(target);
    if (!list) return;

    const item = document.createElement('div');
    item.className = 'attachment-item';
    item.id = `att-${att.key || att.id}`;
    item.innerHTML = renderAttachmentPreview(att);

    item.onclick = () => {
        if (att.category === 'product') {
            openCurrentProductGallery(att.url);
        } else {
            window.viewGenericImage(att.url);
        }
    };

    if (att.category === 'product') {
        const controls = document.createElement('div');
        controls.className = 'attachment-controls';

        const moveLeftBtn = document.createElement('button');
        moveLeftBtn.className = 'attachment-action-btn move-left-btn';
        moveLeftBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        moveLeftBtn.setAttribute('type', 'button');
        moveLeftBtn.disabled = !att.canMoveLeft;
        moveLeftBtn.title = 'Mover para a esquerda';
        moveLeftBtn.onclick = async e => {
            e.stopPropagation();
            e.preventDefault();
            await moveProductImage(att, -1);
        };

        const moveRightBtn = document.createElement('button');
        moveRightBtn.className = 'attachment-action-btn move-right-btn';
        moveRightBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        moveRightBtn.setAttribute('type', 'button');
        moveRightBtn.disabled = !att.canMoveRight;
        moveRightBtn.title = 'Mover para a direita';
        moveRightBtn.onclick = async e => {
            e.stopPropagation();
            e.preventDefault();
            await moveProductImage(att, 1);
        };

        controls.appendChild(moveLeftBtn);
        controls.appendChild(moveRightBtn);
        item.appendChild(controls);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.setAttribute('type', 'button');
    removeBtn.onclick = e => {
        e.stopPropagation();
        e.preventDefault();
        if (att.category === 'product') {
            removeProductImage(att);
        } else if (att.pendingId || att.isNew) {
            const pendingId = att.pendingId || att.id;
            state.pendingAttachments = state.pendingAttachments.filter(a => a.id !== pendingId);
            renderAllAttachmentItems();
        } else {
            removeAttachment(att);
        }
    };
    item.appendChild(removeBtn);
    list.appendChild(item);
}

async function removeAttachment(att) {
    const confirmed = await dialog.confirm({
        title: 'Remover Anexo',
        message: 'Deseja eliminar este anexo permanentemente?',
        confirmText: 'Remover',
        cancelText: 'Cancelar',
        type: 'danger'
    });
    if (!confirmed) return;
    try {
        const { error } = await supabase.rpc('secure_delete_attachment', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_id: att.id
        });
        if (error) throw error;

        state.loadedAttachments = (state.loadedAttachments || []).filter(a => a.id !== att.id);
        renderAllAttachmentItems();
        showToast('Imagem removida.', 'success');
    } catch (err) {
        console.error('Error removing attachment:', err);
        showToast('Erro ao remover imagem.', 'error');
    }
}

async function autoSaveMainImage(productId) {
    if (!state.mainImageFile || !productId) return;

    try {
        const fileName = `main-${Date.now()}.webp`;
        const optimized = await processImageForUpload(state.mainImageFile);
        const { error: uploadErr } = await supabase.storage
            .from('product-images')
            .upload(fileName, optimized);

        if (uploadErr) {
            console.error('Main image upload failed:', uploadErr);
            showToast('Erro ao guardar imagem principal.', 'error');
            return;
        }

        const {
            data: { publicUrl }
        } = supabase.storage.from('product-images').getPublicUrl(fileName);

        // Update product with new image URL
        const { error: updateErr } = await supabase.rpc('secure_update_product_field', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_product_id: parseInt(productId),
            p_field: 'image_url',
            p_value: publicUrl
        });

        if (updateErr) {
            console.error('Main image DB update failed:', updateErr);
            showToast('Erro ao atualizar imagem na base de dados.', 'error');
        } else {
            state.currentImageUrl = publicUrl;
            state.mainImageFile = null;
            showToast('Imagem principal guardada automaticamente.', 'success');
        }
    } catch (err) {
        console.error('Auto-save main image error:', err);
        showToast('Erro ao guardar imagem principal.', 'error');
    }
}

async function autoSaveAttachment(att, productId) {
    try {
        if (!att || att.persistState === 'saving' || att.persistState === 'saved') {
            return;
        }

        att.persistState = 'saving';
        const localPreviewUrl = att.url;
        const shouldBecomePrimary =
            att.category === 'product' &&
            att.type === 'image' &&
            (!state.currentImageUrl || state.currentImageUrl === localPreviewUrl);

        const extension = att.type === 'image' ? 'webp' : att.file.name.split('.').pop() || 'bin';
        const fileName = `${att.category}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}.${extension}`;
        const uploadFile = att.type === 'image' ? await processImageForUpload(att.file) : att.file;
        const { error: uploadErr } = await supabase.storage
            .from('product-images')
            .upload(fileName, uploadFile);

        if (uploadErr) {
            console.error('Auto-save upload failed:', uploadErr);
            att.persistState = 'queued';
            throw new Error(`Upload failed: ${uploadErr.message}`);
        }

        if (!state.pendingAttachments.some(candidate => candidate.id === att.id)) {
            return;
        }

        const {
            data: { publicUrl }
        } = supabase.storage.from('product-images').getPublicUrl(fileName);
        const { data: rpcData, error: dbErr } = await supabase.rpc('secure_add_attachment', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_data: {
                product_id: parseInt(productId),
                url: publicUrl,
                file_type: att.type,
                category: att.category,
                sort_order: att.sort_order
            }
        });

        if (dbErr) {
            console.error('Auto-save DB insert failed:', dbErr);
            att.persistState = 'queued';
            throw new Error(`DB insert failed: ${dbErr.message}`);
        }

        att.persistState = 'saved';
        state.pendingAttachments = state.pendingAttachments.filter(a => a.id !== att.id);

        if (rpcData) {
            state.loadedAttachments = state.loadedAttachments || [];
            state.loadedAttachments.push(normalizeAttachment(rpcData));
        }

        if (shouldBecomePrimary) {
            state.currentImageUrl = publicUrl;
            state.mainImageFile = null;
        }

        await reconcileProductImages({
            preferredUrl: shouldBecomePrimary ? publicUrl : state.currentImageUrl,
            keepViewerSelection: true
        });
    } catch (err) {
        console.error('Auto-save error:', err);
        if (att) att.persistState = 'queued';
        throw err;
    }
}

async function loadProductAttachments(productId) {
    if (!productId) return;

    try {
        const { data, error: idError } = await supabase.rpc('secure_fetch_any', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_table: 'attachments',
            p_params: {
                eq: { product_id: productId },
                order: { column: 'sort_order', ascending: true }
            }
        });
        if (idError) throw idError;
        state.loadedAttachments = sortProductImagesByOrder((data || []).map(normalizeAttachment));
        await reconcileProductImages({
            keepViewerSelection: true
        });
    } catch (err) {
        console.error('Error loading attachments:', err);
    }
}

/**
 * CORE DATA LOGIC
 */

export async function saveProduct() {
    const id = document.getElementById('prod-id').value;
    const isEditing = !!id;

    const isTransit =
        !!document.getElementById('force-transit-status') || state.currentPage === 'transit';
    const access = isTransit
        ? state.currentUser?.transit_access || ''
        : state.currentUser?.inventory_access || '';
    const canWrite =
        access === 'write' || (isEditing ? access.includes('U') : access.includes('C'));

    if (!canWrite) {
        return showToast('Sem permissão para gravar.', 'error');
    }

    const productData = {
        part_number: (document.getElementById('prod-part-number').value || '').trim().toUpperCase(),
        name: document.getElementById('prod-name').value,
        brand: document.getElementById('prod-brand').value,
        quantity: parseInt(document.getElementById('prod-qty').value) || 0,
        min_quantity: parseInt(document.getElementById('prod-min-qty').value) || 0,
        description: document.getElementById('prod-desc').value,
        sales_process: document.getElementById('prod-process').value,
        category: document.getElementById('prod-category').value,
        location: document.getElementById('prod-location').value,
        pallet: document.getElementById('prod-pallet').value,
        box: document.getElementById('prod-box').value,
        cost_price: parseFloat(document.getElementById('prod-cost-price').value) || 0,
        qty_color: document.getElementById('prod-estado')?.value || '#92D050',
        image_url:
            state.currentImageUrl && !String(state.currentImageUrl).startsWith('data:')
                ? state.currentImageUrl
                : null,
        status: document.getElementById('force-transit-status') ? 'transit' : 'available',
        order_to: document.getElementById('prod-order-to')?.value || '',
        order_date: document.getElementById('prod-order-date')?.value || null,
        ship_plant: document.getElementById('prod-ship-plant')?.value || '',
        equipment: document.getElementById('prod-equipment')?.value || '',
        maker:
            document.getElementById('prod-maker')?.value ||
            document.getElementById('prod-brand').value,
        delivery_time: document.getElementById('prod-del-time')?.value || ''
    };
    productData.product_key = buildProductKey(productData);

    const btn = productForm.querySelector('button[type="submit"]');

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'A guardar...';
    }

    try {
        // 1. Upsert Product
        if (isEditing) productData.id = parseInt(id);
        const { data: savedId, error: upsertErr } = await supabase.rpc('secure_save_product', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_data: productData
        });

        if (upsertErr) {
            throw upsertErr;
        }
        const finalId = productData.id || savedId;
        state.currentProductId = finalId;
        state.currentProductKey = productData.product_key;

        // 2. Upload Gallery/Transit Attachments
        const pendingQueue = sortProductImagesByOrder(
            (state.pendingAttachments || []).filter(
                att => att.persistState !== 'saving' && att.persistState !== 'saved'
            )
        );
        pendingQueue.forEach(att => {
            att.persistState = 'saving';
        });

        if (pendingQueue.length > 0) {
            let failCount = 0;
            let firstProductImageUrl = productData.image_url;

            for (const att of pendingQueue) {
                const extension =
                    att.type === 'image' ? 'webp' : att.file.name.split('.').pop() || 'bin';
                const fileName = `${att.category}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}.${extension}`;
                const uploadFile =
                    att.type === 'image' ? await processImageForUpload(att.file) : att.file;
                const { error: attErr } = await supabase.storage
                    .from('product-images')
                    .upload(fileName, uploadFile);

                if (attErr) {
                    console.error('Attachment upload failed for file:', att.file.name, attErr);
                    att.persistState = 'queued';
                    failCount++;
                    continue;
                }

                const {
                    data: { publicUrl }
                } = supabase.storage.from('product-images').getPublicUrl(fileName);
                const { data: savedAttachment, error: insErr } = await supabase.rpc(
                    'secure_add_attachment',
                    {
                        p_user: state.currentUser.username,
                        p_pass: state.currentUser.password,
                        p_data: {
                            product_id: finalId,
                            url: publicUrl,
                            file_type: att.type,
                            category: att.category,
                            sort_order: att.sort_order
                        }
                    }
                );

                if (insErr) console.error('Database insert failed:', insErr);
                if (savedAttachment) {
                    att.persistState = 'saved';
                    state.loadedAttachments.push(normalizeAttachment(savedAttachment));
                } else {
                    att.persistState = 'queued';
                }
                if (!firstProductImageUrl && att.category === 'product' && att.type === 'image') {
                    firstProductImageUrl = publicUrl;
                }
            }

            state.pendingAttachments = (state.pendingAttachments || []).filter(
                att => att.persistState !== 'saved'
            );

            if (firstProductImageUrl !== productData.image_url) {
                state.currentImageUrl = firstProductImageUrl || null;
            }
            if (failCount > 0)
                showToast(`${failCount} imagens não foram guardadas (Erro Storage).`, 'warning');
        }

        await reconcileProductImages();

        // 3. Movement Recording
        await recordProductMovement(finalId, productData, isEditing);

        showToast('Guardado com sucesso!', 'success');
        closeModal();
        await loadDashboard({ forceFetch: true });
        await loadInventory();
        if (state.currentPage === 'transit') import('./transit.js').then(m => m.loadTransitView());
    } catch (err) {
        console.error(err);
        showToast('Erro ao guardar: ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Guardar';
        }
    }
}

async function recordProductMovement(id, data, isEditing) {
    if (state.currentTransitId) {
        await recordMovement(
            id,
            data.quantity,
            `Receção de Stock: ${data.sales_process || 'N/A'}`,
            data.cost_price,
            null,
            data.sales_process,
            null,
            'IN'
        );
    } else if (!isEditing) {
        await recordMovement(id, data.quantity, 'Criação Manual', data.cost_price);
    }
    // (Other movement logic can go here for qty changes)
}

/**
 * HELPERS
 */

function loadHistory(productId) {
    const historySection = document.getElementById('product-history-section');
    const historyList = document.getElementById('product-history-list');
    if (!historySection || !historyList) return;

    historySection.style.display = 'block';
    historyList.innerHTML =
        '<p style="font-size:0.8rem; color:var(--text-secondary);">A carregar...</p>';

    supabase
        .rpc('secure_fetch_any', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_table: 'movements',
            p_params: {
                eq: { product_id: productId },
                order: { column: 'created_at', ascending: false },
                limit: 5
            }
        })
        .then(({ data }) => {
            if (!data || !data.length)
                historyList.innerHTML =
                    '<p style="font-size:0.8rem; color:var(--text-secondary);">Sem histórico.</p>';
            else
                historyList.innerHTML = data
                    .map(
                        m => `
                <div style="font-size:0.75rem; padding:4px 0; border-bottom:1px dashed #eee; display:flex; justify-content:space-between;">
                    <span><b>${m.type}</b>: ${m.quantity}</span>
                    <span style="color:var(--text-secondary);">${new Date(m.created_at).toLocaleDateString()}</span>
                </div>
            `
                    )
                    .join('');
        });
}

export async function updateHeaderImage(src, autoSave = false) {
    state.currentImageUrl = src || null;
    if (src) {
        imageContainer.innerHTML = `<img src="${src}" style="width:100%; height:100%; object-fit:cover;">`;
        imageContainer.classList.add('has-image');
    } else {
        imageContainer.innerHTML = '<i class="fa-solid fa-camera"></i>';
        imageContainer.classList.remove('has-image');
    }
    syncProductImageReference(state.currentImageUrl);
    if (autoSave) {
        await reconcileProductImages({
            keepViewerSelection: true
        });
    }
}

export async function removeMainImage() {
    const currentViewerItem = state.currentGallery && state.currentGallery[state.galleryIndex];
    const currentViewerUrl =
        typeof currentViewerItem === 'string' ? currentViewerItem : currentViewerItem?.url;

    if (!currentViewerUrl) {
        showToast('Nenhuma imagem para remover.', 'info');
        return;
    }

    const currentEntry = buildProductImageEntries().find(entry => entry.url === currentViewerUrl);
    if (!currentEntry) return showToast('Imagem não encontrada.', 'error');

    await removeProductImage(currentEntry);
}

async function removeProductImage(entry) {
    const confirmed = await dialog.confirm({
        title: 'Remover Imagem',
        message: 'Deseja eliminar esta imagem permanentemente?',
        confirmText: 'Remover',
        cancelText: 'Cancelar',
        type: 'danger'
    });
    if (!confirmed) return;

    const productId = getCurrentProductId();
    const removingPrimary = state.currentImageUrl === entry.url;

    try {
        if (entry.attachmentId) {
            const { error } = await supabase.rpc('secure_delete_attachment', {
                p_user: state.currentUser.username,
                p_pass: state.currentUser.password,
                p_id: entry.attachmentId
            });
            if (error) throw error;
            state.loadedAttachments = (state.loadedAttachments || []).filter(
                att => att.id !== entry.attachmentId
            );
        }

        if (entry.pendingId) {
            state.pendingAttachments = (state.pendingAttachments || []).filter(
                att => att.id !== entry.pendingId
            );
        }

        if (removingPrimary) {
            const remainingEntries = buildProductImageEntries().filter(
                item => item.url !== entry.url
            );
            const nextPrimaryUrl = remainingEntries[0]?.url || null;
            state.currentImageUrl = nextPrimaryUrl;
            state.mainImageFile = remainingEntries[0]?.pendingId
                ? remainingEntries[0].file || null
                : null;
        }

        await reconcileProductImages({
            keepViewerSelection: true
        });
        showToast('Imagem removida.', 'success');
    } catch (err) {
        console.error('Error removing image:', err);
        showToast('Erro ao remover imagem.', 'error');
    }
}

function syncProductImageReference(newUrl) {
    const productId = getCurrentProductId();
    if (!productId) return;
    const collections = [
        'products',
        'dashboardProducts',
        'transitProducts',
        'stockOutProducts',
        'logisticsProducts'
    ];
    collections.forEach(key => {
        const list = state[key];
        if (!Array.isArray(list)) return;
        const item = list.find(p => p.id === productId);
        if (item) item.image_url = newUrl;
    });

    if (state.currentPage === 'inventory') {
        loadInventory({ skipRefetch: true });
    }
}

export function printCurrentProduct() {
    const id = document.getElementById('prod-id').value;
    if (!id) return;
    printSingleLabel({
        id,
        name: document.getElementById('prod-name').value,
        part_number: document.getElementById('prod-part-number').value,
        brand: document.getElementById('prod-brand').value,
        maker: document.getElementById('prod-maker')?.value || document.getElementById('prod-brand').value,
        order_to: document.getElementById('prod-order-to')?.value || ''
    });
}
