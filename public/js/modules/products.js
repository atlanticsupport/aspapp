import { state } from './state.js';
import { supabase } from './supabase-client.js';
import { showToast } from './ui.js';
import { productForm, modal, imageContainer, imageInput, viewerOverlay, viewerImg } from './dom.js';
import { processImageForUpload, recordMovement } from './data.js';
import { closeViewer, openViewer } from './ag-grid-shim.js';
import { loadDashboard } from './dashboard.js';
import { loadInventory } from './inventory.js';
import { printSingleLabel } from './printing.js';

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
    if (document.getElementById('product-history-section')) document.getElementById('product-history-section').style.display = 'none';

    if (resetForm) {
        state.pendingAttachments = [];
        state.loadedAttachments = [];
        state.currentGallery = [];
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
    const access = isTransit ? (state.currentUser?.transit_access || '') : (state.currentUser?.inventory_access || '');
    const canWrite = access === 'write' || (isEditing ? access.includes('U') : access.includes('C'));

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
    state.loadedAttachments = [];
    state.currentGallery = [];
    state.currentTransitId = null;
    state.pendingAttachments = [];

    const forceTransit = document.getElementById('force-transit-status');
    if (forceTransit) forceTransit.remove();

    imageContainer.innerHTML = `<i class="fa-solid fa-camera"></i>`;
    imageContainer.classList.remove('has-image');

    const historySection = document.getElementById('product-history-section');
    if (historySection) historySection.style.display = 'none';

    closeViewer();
}

export function openEditModal(product) {
    state.currentProductId = product.id;
    openModal(null, true);

    document.getElementById('prod-id').value = product.id;
    document.getElementById('prod-part-number').value = product.part_number || '';
    document.getElementById('prod-name').value = product.name;
    document.getElementById('prod-brand').value = product.brand || product.maker || '';

    // Population
    if (document.getElementById('prod-equipment')) document.getElementById('prod-equipment').value = product.equipment || '';
    if (document.getElementById('prod-ship-plant')) document.getElementById('prod-ship-plant').value = product.ship_plant || '';
    if (document.getElementById('prod-order-to')) document.getElementById('prod-order-to').value = product.order_to || '';
    if (document.getElementById('prod-order-date')) document.getElementById('prod-order-date').value = product.order_date || '';
    if (document.getElementById('prod-del-time')) document.getElementById('prod-del-time').value = product.delivery_time || '';
    if (document.getElementById('prod-maker')) document.getElementById('prod-maker').value = product.maker || '';
    document.getElementById('prod-qty').value = product.quantity;
    document.getElementById('prod-min-qty').value = product.min_quantity;
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
    const access = isTransit ? (state.currentUser?.transit_access || '') : (state.currentUser?.inventory_access || '');
    const canSave = access === 'write' || access.includes('U');

    const submitBtn = productForm.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.style.display = canSave ? 'inline-block' : 'none';
        submitBtn.textContent = state.currentTransitId ? 'Confirmar Receção' : (product.id ? 'Guardar Produto' : 'Adicionar Produto');
    }

    if (product.image_url) updateHeaderImage(product.image_url);
    else {
        state.currentImageUrl = null;
        imageContainer.innerHTML = `<i class="fa-solid fa-camera"></i>`;
        imageContainer.classList.remove('has-image');
    }

    loadHistory(product.id);
    loadProductAttachments(product.id);
}

/**
 * ATTACHMENTS LOGIC
 */

function setupAttachmentEvents() {
    const galleryInput = document.getElementById('gallery-upload');
    const transitInput = document.getElementById('transit-media-upload');

    if (galleryInput) {
        galleryInput.onchange = (e) => handleAttachmentSelection(e, 'product');
    }
    if (transitInput) {
        transitInput.onchange = (e) => handleAttachmentSelection(e, 'reception');
    }
}
    
window.handleMultipleFiles = async function (files, category, targetListId = null) {
    if (!files || files.length === 0) return;

    const targetId = targetListId || (category === 'product' ? 'product-gallery-list' : 'transit-attachments-list');
    const list = document.getElementById(targetId);

    // Use state.currentProductId instead of DOM element
    const productId = state.currentProductId;
    const shouldAutoSave = !!productId;

    const uploadPromises = [];

    for (const file of files) {
        const id = 'new-' + Math.random().toString(36).substr(2, 9);
        const reader = new FileReader();

        const uploadPromise = new Promise((resolve, reject) => {
            reader.onload = async (ev) => {
                try {
                    const data = {
                        id: id,
                        file: file,
                        url: ev.target.result,
                        category: category,
                        type: file.type.startsWith('video/') ? 'video' : 'image',
                        isNew: true,
                        targetListId: targetId
                    };

                    state.pendingAttachments.push(data);

                    // Only render if we have a target list in the DOM (e.g. inside product modal)
                    if (list) {
                        renderAttachmentItem(data);
                    }

                    // Automatically set main image if empty and we are in product context
                    if (category === 'product' && !state.currentImageUrl && !state.mainImageFile && data.type === 'image') {
                        state.mainImageFile = file;
                        updateHeaderImage(ev.target.result);
                    }

                    // Update Viewer if open
                    if (viewerOverlay && viewerOverlay.classList.contains('open')) {
                        if (!state.currentGallery) state.currentGallery = [];
                        if (!state.currentGallery.includes(ev.target.result)) {
                            state.currentGallery.push(ev.target.result);
                        }
                        state.galleryIndex = state.currentGallery.indexOf(ev.target.result);
                        if (window.updateViewerFromGallery) window.updateViewerFromGallery();
                    }

                    // AUTO-SAVE: Upload immediately if editing existing product
                    if (shouldAutoSave) {
                        await autoSaveAttachment(data, productId);
                    }
                    resolve();
                } catch (err) {
                    console.error('Error processing file:', err);
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        uploadPromises.push(uploadPromise);
    }
    
    // Wait for all uploads to complete
    if (shouldAutoSave) {
        try {
            await Promise.all(uploadPromises);
            // Reload attachments from DB
            await loadProductAttachments(productId);
            showToast(`${files.length} imagem(ns) guardada(s).`, 'success');
        } catch (err) {
            console.error('Error during auto-save:', err);
            showToast('Erro ao guardar imagens.', 'error');
        }
    } else {
        await Promise.all(uploadPromises);
        showToast(`${files.length} imagem(ns) adicionada(s).`, 'success');
    }
};

window.handleAttachmentSelectionFiles = async function (files, category) {
    window.handleMultipleFiles(files, category);
};

async function handleAttachmentSelection(e, category) {
    const files = Array.from(e.target.files);
    window.handleAttachmentSelectionFiles(files, category);
    e.target.value = '';
}

window.handleAttachmentSelection = handleAttachmentSelection;

function renderAttachmentItem(att) {
    const target = att.category === 'product' ? 'product-gallery-list' : 'transit-attachments-list';
    const list = document.getElementById(target);
    if (!list) {
        console.error('Target list element not found:', target);
        return;
    }

    const item = document.createElement('div');
    item.className = 'attachment-item';
    item.id = `att-${att.id}`;

    if (att.type === 'video') {
        item.innerHTML = `
            <video src="${att.url}"></video>
            <div class="video-indicator"><i class="fa-solid fa-play"></i></div>
        `;
    } else {
        item.innerHTML = `<img src="${att.url}" alt="Anexo">`;
    }

    item.onclick = () => window.viewGenericImage(att.url);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.setAttribute('type', 'button');
    removeBtn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (att.isNew) {
            state.pendingAttachments = state.pendingAttachments.filter(a => a.id !== att.id);
            item.remove();
            handleAttachmentRemoved(att);
        } else {
            removeAttachment(att, item);
        }
    };
    item.appendChild(removeBtn);
    list.appendChild(item);
}

async function removeAttachment(att, element) {
    if (!confirm('Deseja eliminar este anexo permanentemente?')) return;
    try {
        const { error } = await supabase.rpc('secure_delete_attachment', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_id: att.id
        });
        if (error) throw error;
        
        element.remove();
        state.loadedAttachments = (state.loadedAttachments || []).filter(a => a.id !== att.id);
        handleAttachmentRemoved(att);
        
        // Reload attachments from DB
        if (state.currentProductId) {
            await loadProductAttachments(state.currentProductId);
        }
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
        const { error: uploadErr } = await supabase.storage.from('product-images').upload(fileName, optimized);
        
        if (uploadErr) {
            console.error('Main image upload failed:', uploadErr);
            showToast('Erro ao guardar imagem principal.', 'error');
            return;
        }
        
        const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
        
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
        const fileName = `${att.category}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage.from('product-images').upload(fileName, att.file);

        if (uploadErr) {
            console.error('Auto-save upload failed:', uploadErr);
            throw new Error(`Upload failed: ${uploadErr.message}`);
        }

        const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
        const { data: rpcData, error: dbErr } = await supabase.rpc('secure_add_attachment', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_data: {
                product_id: parseInt(productId),
                url: publicUrl,
                file_type: att.type,
                category: att.category
            }
        });

        if (dbErr) {
            console.error('Auto-save DB insert failed:', dbErr);
            throw new Error(`DB insert failed: ${dbErr.message}`);
        }
        
        // Update attachment with DB data
        if (rpcData) {
            att.id = rpcData.id;
            att.isNew = false;
            att.url = publicUrl;
            state.loadedAttachments = state.loadedAttachments || [];
            state.loadedAttachments.push(rpcData);
        }
        
        // Remove from pending
        state.pendingAttachments = state.pendingAttachments.filter(a => a.id !== att.id);
    } catch (err) {
        console.error('Auto-save error:', err);
        throw err;
    }
}

async function loadProductAttachments(productId) {
    if (!productId) return;

    const galleryList = document.getElementById('product-gallery-list');
    const transitList = document.getElementById('transit-attachments-list');
    if (galleryList) galleryList.innerHTML = '';
    if (transitList) transitList.innerHTML = '';

    try {
        const { data, error } = await supabase.rpc('secure_fetch_any', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_table: 'attachments',
            p_params: { eq: { product_id: productId } }
        });
        if (error) throw error;
        state.loadedAttachments = data || [];
        (data || []).forEach(att => renderAttachmentItem(att));
        if (!state.currentImageUrl && !state.mainImageFile) {
            trySetFallbackImage({ preferExistingOnly: true });
        }
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

    const isTransit = !!document.getElementById('force-transit-status') || state.currentPage === 'transit';
    const access = isTransit ? (state.currentUser?.transit_access || '') : (state.currentUser?.inventory_access || '');
    const canWrite = access === 'write' || (isEditing ? access.includes('U') : access.includes('C'));

    if (!canWrite) {
        console.warn('DEBUG: No write permission for this module');
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
        image_url: state.currentImageUrl,
        status: document.getElementById('force-transit-status') ? 'transit' : 'available',
        order_to: document.getElementById('prod-order-to')?.value || '',
        order_date: document.getElementById('prod-order-date')?.value || null,
        ship_plant: document.getElementById('prod-ship-plant')?.value || '',
        equipment: document.getElementById('prod-equipment')?.value || '',
        maker: document.getElementById('prod-maker')?.value || document.getElementById('prod-brand').value,
        delivery_time: document.getElementById('prod-del-time')?.value || ''
    };

    const mainFile = state.mainImageFile;
    const btn = productForm.querySelector('button[type="submit"]');

    if (btn) { btn.disabled = true; btn.textContent = 'A guardar...'; }

    try {
        // 1. Upload Main Header Image
        if (mainFile) {
            const fileName = `main-${Date.now()}.webp`;
            const optimized = await processImageForUpload(mainFile);
            const { error: upErr } = await supabase.storage.from('product-images').upload(fileName, optimized);
            if (!upErr) {
                const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
                productData.image_url = publicUrl;
            }
        }

        // 2. Upsert Product
        if (isEditing) productData.id = parseInt(id);
        const { data: savedId, error: upsertErr } = await supabase.rpc('secure_save_product', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_data: productData
        });

        if (upsertErr) {
            console.error('DEBUG: Upsert error:', upsertErr);
            throw upsertErr;
        }
        const finalId = productData.id || savedId;

        // 3. Upload Gallery/Transit Attachments
        if (state.pendingAttachments.length > 0) {
            let failCount = 0;
            for (const att of state.pendingAttachments) {
                const fileName = `${att.category}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                const { error: attErr } = await supabase.storage.from('product-images').upload(fileName, att.file);

                if (attErr) {
                    console.error('Attachment upload failed for file:', att.file.name, attErr);
                    failCount++;
                    continue;
                }

                const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
                const { error: insErr } = await supabase.rpc('secure_add_attachment', {
                    p_user: state.currentUser.username,
                    p_pass: state.currentUser.password,
                    p_data: {
                        product_id: finalId,
                        url: publicUrl,
                        file_type: att.type,
                        category: att.category
                    }
                });

                if (insErr) console.error('Database insert failed:', insErr);
            }
            if (failCount > 0) showToast(`${failCount} imagens não foram guardadas (Erro Storage).`, 'warning');
        }

        // 4. Movement Recording
        await recordProductMovement(finalId, productData, isEditing);

        // Automatically promote another available image
        if (state.mainImageFile) {
            const pendingCandidate = getPendingProductImages()[0];
            if (pendingCandidate) {
                state.mainImageFile = pendingCandidate.file || null;
                updateHeaderImage(pendingCandidate.url);
            } else {
                const existingCandidate = getLoadedProductImages()[0];
                if (existingCandidate) {
                    state.mainImageFile = null;
                    updateHeaderImage(existingCandidate.url);
                }
            }
        }

        showToast('Guardado com sucesso!', 'success');
        closeModal();
        await loadDashboard({ forceFetch: true });
        await loadInventory();
        if (state.currentPage === 'transit') import('./transit.js').then(m => m.loadTransitView());

    } catch (err) {
        console.error(err);
        showToast('Erro ao guardar: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
    }
}

async function recordProductMovement(id, data, isEditing) {
    if (state.currentTransitId) {
        await recordMovement(id, data.quantity, `Receção de Stock: ${data.sales_process || 'N/A'}`, data.cost_price, null, data.sales_process, null, 'IN');
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
    historyList.innerHTML = '<p style="font-size:0.8rem; color:var(--text-secondary);">A carregar...</p>';

    supabase.rpc('secure_fetch_any', {
        p_user: state.currentUser.username,
        p_pass: state.currentUser.password,
        p_table: 'movements',
        p_params: { eq: { product_id: productId }, order: { column: 'created_at', ascending: false }, limit: 5 }
    })
        .then(({ data }) => {
            if (!data || !data.length) historyList.innerHTML = '<p style="font-size:0.8rem; color:var(--text-secondary);">Sem histórico.</p>';
            else historyList.innerHTML = data.map(m => `
                <div style="font-size:0.75rem; padding:4px 0; border-bottom:1px dashed #eee; display:flex; justify-content:space-between;">
                    <span><b>${m.type}</b>: ${m.quantity}</span>
                    <span style="color:var(--text-secondary);">${new Date(m.created_at).toLocaleDateString()}</span>
                </div>
            `).join('');
        });
}

export async function updateHeaderImage(src, autoSave = false) {
    state.currentImageUrl = src || null;
    if (src) {
        imageContainer.innerHTML = `<img src="${src}" style="width:100%; height:100%; object-fit:cover;">`;
        imageContainer.classList.add('has-image');
    } else {
        imageContainer.innerHTML = `<i class="fa-solid fa-camera"></i>`;
        imageContainer.classList.remove('has-image');
    }
    syncProductImageReference(state.currentImageUrl);
    
    // Auto-save if editing existing product and autoSave flag is true
    if (autoSave && state.mainImageFile) {
        const productId = document.getElementById('prod-id')?.value;
        if (productId) {
            await autoSaveMainImage(productId);
        }
    }
}

export async function removeMainImage() {
    const currentViewerUrl = state.currentGallery && state.currentGallery[state.galleryIndex];
    
    if (!currentViewerUrl || !state.currentProductId) {
        showToast('Nenhuma imagem para remover.', 'info');
        return;
    }
    
    const currentAttachment = state.loadedAttachments?.find(att => att.url === currentViewerUrl);
    if (!currentAttachment) {
        showToast('Imagem não encontrada.', 'error');
        return;
    }
    
    try {
        // If it's the main image (first in gallery)
        if (currentAttachment.isMainImage) {
            await supabase.rpc('secure_update_product_field', {
                p_user: state.currentUser.username,
                p_pass: state.currentUser.password,
                p_product_id: parseInt(state.currentProductId),
                p_field: 'image_url',
                p_value: null
            });
        } else {
            // It's a gallery attachment
            await supabase.rpc('secure_delete_attachment', {
                p_user: state.currentUser.username,
                p_pass: state.currentUser.password,
                p_id: currentAttachment.id
            });
        }
        
        // Close viewer and reload to get fresh data from DB
        const viewerOverlay = document.getElementById('viewer-overlay');
        if (viewerOverlay) viewerOverlay.classList.remove('open');
        
        showToast('Imagem removida.', 'success');
    } catch (err) {
        console.error('Error removing image:', err);
        showToast('Erro ao remover imagem.', 'error');
    }
}

function handleAttachmentRemoved(att) {
    const matchesFile = att.file && state.mainImageFile === att.file;
    const matchesUrl = att.url && state.currentImageUrl === att.url;
    if (!matchesFile && !matchesUrl) return;
    state.mainImageFile = null;
    state.currentImageUrl = null;
    if (!trySetFallbackImage()) {
        updateHeaderImage(null);
    }
}

function trySetFallbackImage(options = {}) {
    const { preferExistingOnly = false } = options;
    if (!preferExistingOnly) {
        const pendingCandidate = getPendingProductImages()[0];
        if (pendingCandidate) {
            state.mainImageFile = pendingCandidate.file || null;
            updateHeaderImage(pendingCandidate.url);
            return true;
        }
    }

    const existingCandidate = getLoadedProductImages()[0];
    if (existingCandidate) {
        state.mainImageFile = null;
        updateHeaderImage(existingCandidate.url);
        return true;
    }

    return false;
}

function getPendingProductImages() {
    return (state.pendingAttachments || []).filter(att => att.category === 'product' && att.type === 'image');
}

function getLoadedProductImages() {
    return (state.loadedAttachments || []).filter(att => (att.category || 'product') === 'product' && att.file_type === 'image');
}

function syncProductImageReference(newUrl) {
    const idInput = document.getElementById('prod-id');
    const rawId = idInput?.value || state.currentProductId;
    const productId = rawId ? parseInt(rawId, 10) : null;
    if (!productId) return;
    const collections = ['products', 'dashboardProducts', 'transitProducts', 'stockOutProducts', 'logisticsProducts'];
    collections.forEach(key => {
        const list = state[key];
        if (!Array.isArray(list)) return;
        const item = list.find(p => p.id === productId);
        if (item) item.image_url = newUrl;
    });
}

export function printCurrentProduct() {
    const id = document.getElementById('prod-id').value;
    if (!id) return;
    printSingleLabel({
        id,
        name: document.getElementById('prod-name').value,
        part_number: document.getElementById('prod-part-number').value,
        brand: document.getElementById('prod-brand').value
    });
}
