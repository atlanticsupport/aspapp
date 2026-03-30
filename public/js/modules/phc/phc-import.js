import { state } from '../core/state.js';
import { supabase } from '../supabase-client.js';
import { showToast, showGlobalLoading, hideGlobalLoading } from '../core/ui.js';
import { loadInventory } from '../inventory.js';
import { resetPhcImport } from './phc-core.js';

// Table column cache
const tableColumnCache = {};

// Get valid columns for a table
async function getValidColumns(tableName) {
    if (tableColumnCache[tableName]) return tableColumnCache[tableName];

    try {
        const { data, error } = await supabase.rpc('get_table_columns', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_table_name: tableName
        });

        if (data && !error) {
            tableColumnCache[tableName] = data.map(c => c.column_name);
            return tableColumnCache[tableName];
        }

        return null;
    } catch (e) {
        console.error('Error fetching table columns', e);
        return null;
    }
}

function getPhcBatchConfig(destLayout, targetTable, globalPo, itemCount, batchId = null) {
    const destinationLabels = {
        inventory: 'Inventario',
        transit: 'Transito',
        'stock-out': 'Saidas de Stock',
        logistics: 'Encomendas / Chegadas'
    };

    return {
        batchId: batchId || `BATCH-PHC-${destLayout.toUpperCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        label: `Importacao Processo PHC (${destinationLabels[destLayout] || 'Inventario'})`,
        summary: `${itemCount} itens importados via processo PHC para ${destinationLabels[destLayout] || targetTable}`,
        details: {
            source: 'phc_process',
            source_label: 'Processo PHC',
            destination: destLayout,
            destination_label: destinationLabels[destLayout] || targetTable,
            process: globalPo || null,
            table: targetTable
        }
    };
}

// Confirm and execute PHC import
export async function confirmPhcImport() {
    const btn = document.getElementById('btn-confirm-phc-import');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> A importar...';

    try {
        // Get global meta values
        const globalPo = document.getElementById('phc-meta-po').value;
        const globalMaker = document.getElementById('phc-meta-maker').value;
        const globalShip = document.getElementById('phc-meta-ship').value;
        const globalEquip = document.getElementById('phc-meta-equipment').value;
        const globalType = document.getElementById('phc-meta-engine-type').value;
        const globalClient = document.getElementById('phc-meta-client-final').value;

        const rows = document.querySelectorAll('#phc-preview-table tbody tr');
        let count = 0;

        // Determine destination
        const curPage = state.currentPage;
        const destLayout = curPage === 'logistics' ? 'logistics' :
            curPage === 'transit' ? 'transit' :
                curPage === 'stock-out' ? 'stock-out' : 'inventory';
        const targetTable = (destLayout === 'logistics') ? 'logistics_items' : 'products';
        const allItems = [];

        // Get valid columns
        const validColumns = await getValidColumns(targetTable);
        if (!validColumns) {
            throw new Error(`Não foi possível obter colunas da tabela ${targetTable}`);
        }

        const batchId = `BATCH-PHC-${destLayout.toUpperCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

        // Process each row
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const inputs = row.querySelectorAll('.phc-edit-field');
            const itemData = {};

            // Collect data from inputs
            inputs.forEach(input => {
                const col = input.dataset.key;
                let val = input.value;
                if (col === 'quantity') val = parseInt(val) || 0;
                if (col === 'cost_price') val = parseFloat(val) || 0;
                itemData[col] = val;

                // Sync Brand if Maker is edited
                if (col === 'maker' && validColumns.includes('brand')) itemData.brand = val;
            });

            // Apply meta fields
            if (globalPo && validColumns.includes('sales_process')) itemData.sales_process = globalPo;
            if (globalMaker) {
                if (validColumns.includes('maker')) itemData.maker = globalMaker;
                if (validColumns.includes('brand')) itemData.brand = globalMaker;
            }
            if (globalShip && validColumns.includes('ship_plant')) itemData.ship_plant = globalShip;
            if (globalEquip && validColumns.includes('equipment')) itemData.equipment = globalEquip;
            if (globalType && validColumns.includes('category')) itemData.category = globalType;
            if (globalClient && destLayout === 'logistics' && validColumns.includes('order_to')) itemData.order_to = globalClient;

            // Set required fields
            itemData.quantity = parseInt(itemData.quantity) || 0;
            itemData.min_quantity = parseInt(itemData.min_quantity) || 0;
            if (itemData.cost_price === undefined || itemData.cost_price === '') itemData.cost_price = 0;

            if (validColumns.includes('location')) itemData.location = (itemData.location || '1').trim();
            if (validColumns.includes('pallet')) itemData.pallet = itemData.pallet || '';
            if (validColumns.includes('box')) itemData.box = itemData.box || '';

            if (validColumns.includes('author')) itemData.author = state.currentUser ? state.currentUser.username : 'Unknown';
            if (validColumns.includes('is_deleted')) itemData.is_deleted = false;

            // Set status based on destination
            if (destLayout === 'logistics') {
                itemData.status = 'pending';
            } else if (destLayout === 'stock-out') {
                itemData.status = 'stockout_pending';
            } else {
                itemData.status = (destLayout === 'transit') ? 'transit' : 'available';
            }

            // Filter to only valid columns
            const filteredData = {};
            validColumns.forEach(col => {
                if (itemData[col] !== undefined) {
                    filteredData[col] = itemData[col];
                }
            });

            // Force critical values
            filteredData.is_deleted = false;
            if (targetTable === 'products') filteredData.qty_color = filteredData.qty_color || '#92D050';
            if (destLayout === 'logistics') filteredData.status = 'pending';
            else if (destLayout === 'stock-out') filteredData.status = 'stockout_pending';
            else filteredData.status = (destLayout === 'transit') ? 'transit' : 'available';
            filteredData.batch_id = batchId;
            allItems.push(filteredData);
        }

        if (allItems.length > 0) {
            showGlobalLoading(`A importar ${allItems.length} itens...`);

            try {
                const batchConfig = getPhcBatchConfig(destLayout, targetTable, globalPo, allItems.length, batchId);
                const { data: insertedCount, error } = await supabase.rpc('secure_batch_import', {
                    p_user: state.currentUser.username,
                    p_pass: state.currentUser.password,
                    p_target: targetTable,
                    p_items: allItems,
                    p_label: batchConfig.label,
                    p_summary: batchConfig.summary,
                    p_details: batchConfig.details
                });

                if (error) throw error;

                hideGlobalLoading();
                count = insertedCount || allItems.length;

                // Handle photo uploads if needed
                await handlePhotoUploads(destLayout, count);

                // Show success message
                showToast(`Importação concluída! ${count} itens criados.`, 'success');
                document.getElementById('phc-import-modal').classList.remove('open');

                // Clear search in transit
                if (state.currentPage === 'transit') {
                    state.transitFilterState.search = '';
                    const searchInput = document.getElementById('transit-search');
                    if (searchInput) searchInput.value = '';
                }

                // Refresh autocomplete
                import('../data.js').then(m => m.fetchAllProcesses());

                // Refresh view
                await refreshView(curPage);

                // Reset form
                resetPhcImport();

            } catch (error) {
                console.error('Import Error:', error);
                showToast('Erro na importação: ' + error.message, 'error');
                hideGlobalLoading();
            }
        }

    } catch (error) {
        console.error('Import Error:', error);
        showToast('Erro na importação: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar Importação';
    }
}

// Handle photo uploads after import
async function handlePhotoUploads(destLayout, itemCount) {
    const photosInput = document.getElementById('phc-bulk-photos');
    if (!photosInput || !photosInput.files.length || itemCount === 0) return;

    // Note: In a real implementation, you would need to fetch the inserted IDs
    // from the import_items table to associate photos with correct products
    const results = []; // Placeholder for inserted IDs

    if (results.length === 0) return;

    const files = Array.from(photosInput.files);
    showToast(`A carregar ${files.length} fotos para ${results.length} itens...`, 'info');

    const { processImageForUpload } = await import('../data.js');

    for (const productId of results) {
        for (const file of files) {
            try {
                let uploadFile = file;
                const fileType = file.type.startsWith('video/') ? 'video' : 'image';

                if (fileType === 'image') {
                    uploadFile = await processImageForUpload(file);
                }

                const fileName = `phc_batch_${productId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.webp`;
                const { error: uploadError } = await supabase.storage
                    .from('product-images')
                    .upload(fileName, uploadFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('product-images')
                    .getPublicUrl(fileName);

                await supabase.rpc('secure_add_attachment', {
                    p_user: state.currentUser.username,
                    p_pass: state.currentUser.password,
                    p_data: {
                        product_id: parseInt(productId),
                        url: publicUrl,
                        file_type: fileType,
                        category: (destLayout === 'transit' ? 'reception' : 'product')
                    }
                });
            } catch (uploadErr) {
                console.error(`Failed to upload photo for product ${productId}:`, uploadErr);
            }
        }
    }
}

// Refresh the appropriate view
async function refreshView(page) {
    switch (page) {
    case 'logistics':
        const { fetchLogisticsItems } = await import('../logistics.js');
        await fetchLogisticsItems();
        break;
    case 'transit':
        const { fetchTransitItems } = await import('../transit.js');
        await fetchTransitItems();
        break;
    case 'stock-out':
        const { fetchStockOutItems } = await import('../stock-out.js');
        await fetchStockOutItems();
        break;
    default:
        state.products = [];
        await loadInventory();
    }
}

// Make function available globally
window.confirmPhcImport = confirmPhcImport;
