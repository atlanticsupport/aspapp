import { state } from '../core/state.js';
import { supabase } from '../supabase-client.js';
import { showToast } from '../core/ui.js';
import { dialog } from '../ui/dialogs-original.js';
import { getDetectedPhcItems, setDetectedPhcItems } from './phc-core.js';
import { renderPhcPreview } from './phc-ui.js';

// Fetch PHC data from Cloudflare D1 via RPC
export async function handlePhcFetch(processId) {
    // Supabase client is actually a Cloudflare D1 proxy, always available
    if (!supabase) {
        showToast('Cliente de base de dados não disponível.', 'error');
        return;
    }

    const btn = document.getElementById('btn-phc-fetch');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> A procurar...';

    try {
        // Search in PHC table via SECURE RPC
        const { data, error } = await supabase.rpc('secure_search_phc', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_search: processId
        });

        if (error) throw error;

        if (!data || data.length === 0) {
            // Fallback: maybe the process was already imported into products
            const { data: existingFallback, error: existErr } = await supabase.rpc('secure_fetch_inventory', {
                p_user: state.currentUser.username,
                p_pass: state.currentUser.password,
                p_search: processId
            });

            if (existErr) {
                console.error('PHC search fallback error', existErr);
                showToast('Processo não encontrado no PHC (Supabase).', 'warning');
                return;
            }

            if (existingFallback && existingFallback.length > 0) {
                showToast('Processo não encontrado no PHC, mas existe no Inventário (já importado).', 'info');
                // Optionally open the existing item
                const existingItem = existingFallback[0];
                const modal = document.getElementById('product-modal');
                if (modal) {
                    document.getElementById('prod-id').value = existingItem.id;
                    document.getElementById('prod-name').value = existingItem.name || '';
                    document.getElementById('prod-part-number').value = existingItem.part_number || '';
                    document.getElementById('prod-qty').value = existingItem.quantity || 0;
                    document.getElementById('prod-location').value = existingItem.location || '';
                    document.getElementById('prod-pallet').value = existingItem.pallet || '';
                    document.getElementById('prod-box').value = existingItem.box || '';
                    document.getElementById('prod-brand').value = existingItem.brand || '';
                    document.getElementById('prod-category').value = existingItem.category || '';
                    document.getElementById('prod-cost-price').value = existingItem.cost_price || 0;
                    document.getElementById('prod-desc').value = existingItem.description || '';
                    document.getElementById('prod-process').value = existingItem.sales_process || '';

                    modal.classList.add('open');
                }
                return;
            }

            showToast('Processo não encontrado no PHC (Supabase).', 'warning');
            return;
        }

        const record = data[0];

        // Check if this process already exists in OUR products table
        const isStockOutView = state.currentPage === 'stock-out';

        const { data: existing, error: existError } = await supabase.rpc('secure_fetch_inventory', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_search: record.processo_id,
            p_only_transit: !isStockOutView,
            p_only_stockout: isStockOutView
        });

        if (existing && existing.length > 0) {
            const choice = await dialog.choice({
                title: 'Processo já Importado',
                message: `O processo "${record.processo_id}" já foi importado anteriormente. O que deseja fazer?`,
                choices: [
                    { value: 'open', label: 'Ver Existente', class: 'primary' },
                    { value: 'duplicate', label: 'Criar Duplicado', class: 'secondary' },
                    { value: 'cancel', label: 'Cancelar', class: 'ghost' }
                ]
            });

            if (choice === 'open') {
                // Open existing item
                const existingItem = existing[0];
                const modal = document.getElementById('product-modal');
                if (modal) {
                    // Fill modal with existing data
                    document.getElementById('prod-id').value = existingItem.id;
                    document.getElementById('prod-name').value = existingItem.name || '';
                    document.getElementById('prod-part-number').value = existingItem.part_number || '';
                    document.getElementById('prod-qty').value = existingItem.quantity || 0;
                    document.getElementById('prod-location').value = existingItem.location || '';
                    document.getElementById('prod-pallet').value = existingItem.pallet || '';
                    document.getElementById('prod-box').value = existingItem.box || '';
                    document.getElementById('prod-brand').value = existingItem.brand || '';
                    document.getElementById('prod-category').value = existingItem.category || '';
                    document.getElementById('prod-cost-price').value = existingItem.cost_price || 0;
                    document.getElementById('prod-desc').value = existingItem.description || '';
                    document.getElementById('prod-process').value = existingItem.sales_process || '';

                    modal.classList.add('open');
                }
                const triggerModal = document.getElementById('phc-import-modal');
                if (triggerModal) triggerModal.classList.remove('open');
            } else if (choice === 'duplicate') {
                showToast('A criar duplicado...', 'info');
            } else {
                return;
            }
        }

        // Parse JSON data
        let docs = [];
        try {
            docs = typeof record.dados_json === 'string' ? JSON.parse(record.dados_json) : record.dados_json;
        } catch (e) {
            console.error('JSON Parse Error', e);
            showToast('Erro ao ler dados JSON do PHC.', 'error');
            return;
        }

        if (!Array.isArray(docs)) {
            docs = [docs];
        }

        // Filter documents based on current view
        const filteredDocs = filterDocuments(docs, state.currentPage, record);

        if (filteredDocs.length === 0) {
            const msg = state.currentPage === 'logistics' || state.currentPage === 'stock-out' ?
                'Nenhum documento de Venda correspondente encontrado.' :
                'Nenhum documento de Compra correspondente encontrado.';
            showToast(msg, 'warning');
            btn.disabled = false;
            btn.innerHTML = originalText;
            return;
        }

        // Process and merge items
        const mergedItems = processAndMergeItems(filteredDocs, record);
        setDetectedPhcItems(mergedItems);

        // Update UI meta fields
        updateMetaFields(record, mergedItems);

        // Render preview
        renderPhcPreview();
        showToast(`Encontrados ${mergedItems.length} itens no processo ${record.processo_id}.`, 'success');

        // Show preview section
        document.getElementById('phc-input-section').style.display = 'none';
        document.getElementById('phc-preview-container').style.display = 'block';

    } catch (err) {
        console.error('PHC Fetch Error', err);
        showToast('Erro ao procurar processo.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Filter documents based on view
function filterDocuments(docs, currentPage, record) {
    const isLogistics = currentPage === 'logistics';
    const isStockOut = currentPage === 'stock-out';

    const normalize = (value) => String(value || '').trim().toUpperCase();

    const getDocType = (info) => normalize(
        info.tipo ||
        info.doc_type ||
        info.document_type ||
        info.tipo_documento ||
        info.type
    );

    const getDocCategory = (info) => normalize(info.categoria || info.category || info.type_category);

    const isPurchaseLikeDocument = (docType, docCategory, info) => {
        const combined = `${docType} ${docCategory} ${normalize(info.referencia)} ${normalize(info.documento)} ${normalize(info.descricao)}`;

        return (
            combined.includes('PURCHASE ORDER') ||
            combined.includes('COMPRA') ||
            combined.includes('ENCOMENDA') ||
            combined.includes('PURCHASE') ||
            combined.includes('BUY')
        );
    };

    const isSaleLikeDocument = (docType, docCategory, info) => {
        const combined = `${docType} ${docCategory} ${normalize(info.referencia)} ${normalize(info.documento)} ${normalize(info.descricao)}`;

        return (
            combined.includes('QUOTATION') ||
            combined.includes('ORDER CONFIRMATION') ||
            combined.includes('VENDA') ||
            combined.includes('SALE') ||
            combined.includes('PBS')
        );
    };

    return docs.filter(d => {
        const info = d.info || d.dossier_info || d;
        const type = getDocType(info);
        const category = getDocCategory(info);
        const isPO = isPurchaseLikeDocument(type, category, info);
        const isSale = isSaleLikeDocument(type, category, info);

        // Detect if this is STOCK fulfillment
        const isStockClient =
            normalize(info.entidade).includes('STOCK') ||
            normalize(info.client_name).includes('STOCK') ||
            normalize(info.client).includes('STOCK') ||
            normalize(info.pagamento).includes('STOCK') ||
            normalize(record.cliente_principal).includes('STOCK') ||
            normalize(record.cliente_final).includes('STOCK') ||
            (d.items && Array.isArray(d.items) && d.items.some(it =>
                normalize(it.prazo) === 'STOCK' ||
                normalize(it.status) === 'STOCK'
            ));

        if (isLogistics) return isSale;
        if (isStockOut) return isSale && isStockClient;
        return isPO && !isStockClient;
    });
}

// Process and merge items from documents
function processAndMergeItems(filteredDocs, record) {
    const collated = [];

    filteredDocs.forEach(doc => {
        const info = doc.info || doc.dossier_info || doc;
        const docItems = doc.items || [];

        docItems.forEach(item => {
            const pn = (item.pn || item.part_number || '').trim().toUpperCase();
            const desc = (item.desc || item.description || '').trim().toUpperCase();
            const isChargeLine =
                ['PACKING', 'PORTES', 'FRETE-IMP', 'FRETE-EXP', 'DELIVERY'].includes(pn) ||
                desc.includes('PACKING') ||
                desc.includes('HANDLING') ||
                desc.includes('FRETE') ||
                desc.includes('DELIVERY COST') ||
                desc.includes('PORTES');
            if (isChargeLine) return;

            const qty = parseFloat(item.qty || item.quantity || 0);

            // Calculate price
            let price = parseFloat(
                item.uprice || item.unit_price || item.epu || item.puni ||
                item.preco || (item.venda > 0 ? item.venda : item.custo) || 0
            );

            const total = parseFloat(item.total || item.lin_total || item.stotal || item.vliquido || 0);
            if (price === 0 && total > 0 && qty > 0) {
                price = total / qty;
            }

            collated.push({ item, info, docType: info.tipo, extractedPrice: price });
        });
    });

    // Merge duplicates
    const merged = new Map();
    collated.forEach(({ item, info, docType, extractedPrice }) => {
        const pn = (item.pn || item.part_number || '').trim();
        const orderTo = (info.entidade || '').trim();
        const key = `${pn}_${orderTo}`;
        const qty = parseFloat(item.qty || item.quantity || 0);

        if (merged.has(key)) {
            merged.get(key).quantity += qty;
        } else {
            merged.set(key, {
                part_number: pn,
                name: item.desc || item.description || '',
                quantity: qty,
                min_quantity: 0,
                description: '',
                cost_price: extractedPrice,
                unit_price: extractedPrice,
                maker: info.maker || record.maker || '',
                brand: info.maker || record.maker || '',
                equipment: info.equip || info.equipment || record.equipment || '',
                ship_plant: info.ship || info.ship_pplant || record.ship || '',
                order_to: info.entidade || record.cliente_final || '',
                sales_process: record.processo_id,
                category: item.categoria || record.engine_type || '',
                status: 'available',
                delivery_time: item.prazo || item.lead_time || item.delivery_time || ''
            });
        }
    });

    return Array.from(merged.values());
}

// Update meta fields in UI
function updateMetaFields(record, items) {
    const getMostCommon = (field) => {
        const values = items.map(item => item[field]).filter(Boolean);
        if (values.length === 0) return '';
        const counts = values.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
        return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    };

    const isLogistics = state.currentPage === 'logistics';

    if (document.getElementById('phc-meta-po'))
        document.getElementById('phc-meta-po').value = record.processo_id || '';
    if (document.getElementById('phc-meta-maker'))
        document.getElementById('phc-meta-maker').value = record.maker || getMostCommon('maker') || '';
    if (document.getElementById('phc-meta-ship'))
        document.getElementById('phc-meta-ship').value = record.ship || getMostCommon('ship_plant') || '';
    if (document.getElementById('phc-meta-equipment'))
        document.getElementById('phc-meta-equipment').value = record.equipment || getMostCommon('equipment') || '';
    if (document.getElementById('phc-meta-engine-type'))
        document.getElementById('phc-meta-engine-type').value = record.engine_type || getMostCommon('category') || '';

    // Manage "Cliente Final" visibility
    const clientFinalGroup = document.getElementById('phc-meta-client-final')?.parentElement;
    if (clientFinalGroup) {
        clientFinalGroup.style.display = isLogistics ? 'block' : 'none';
    }

    if (document.getElementById('phc-meta-client-final'))
        document.getElementById('phc-meta-client-final').value = isLogistics ? (record.cliente_final || getMostCommon('order_to') || '') : '';
}

// Make function available globally
window.handlePhcFetch = handlePhcFetch;
