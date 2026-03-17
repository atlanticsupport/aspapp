import { state } from './state.js';
import { supabase } from './supabase-client.js';
import { showToast, renderPagination, renderImageCellHTML, formatCurrency } from './ui.js';
import { views, inventoryContent } from './dom.js';
import { fetchProducts, recordMovement } from './data.js';
import { openEditModal } from './products.js';
import { loadDashboard } from './dashboard.js';
import { printPalletLabel } from './printing.js';

// Global Handlers
export function toggleSearchConfig() {
    const modal = document.getElementById('search-config-modal');
    if (!modal) return;

    const list = document.getElementById('search-fields-list');
    const fields = {
        id: 'ID Sistema',
        part_number: 'PN / Ref.',
        name: 'Designação',
        maker: 'Fabricante',
        brand: 'Marca',
        sales_process: 'Processo/PO',
        location: 'Nave',
        box: 'Caixa',
        pallet: 'Palete',
        category: 'Modelo',
        description: 'Comentários'
    };

    list.innerHTML = Object.entries(fields).map(([key, label]) => `
        <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; cursor:pointer; padding:4px;">
            <input type="checkbox" onchange="window.updateSearchField('${key}', this.checked)" ${state.searchFields[key] ? 'checked' : ''}>
            <span>${label}</span>
        </label>
    `).join('');

    modal.classList.add('open');
}

export function updateSearchField(key, checked) {
    state.searchFields[key] = checked;
    localStorage.setItem('searchFields', JSON.stringify(state.searchFields));
    if (state.currentFilter) {
        state.inventoryPage = 0;
        loadInventory();
    }
}

export function handleSort(column) {
    const current = state.sortState;
    if (current.column === column) {
        current.ascending = !current.ascending;
    } else {
        state.sortState = { column, ascending: true };
    }
    state.inventoryPage = 0;
    loadInventory();
}

export async function loadInventory(options = {}) {
    const titleEl = document.getElementById('page-title');
    const title = options.lowStockOnly ? 'Stock Crítico' : 'Inventário';
    if (titleEl) titleEl.textContent = title;

    if (!options.skipRefetch) {
        inventoryContent.innerHTML = `<div class="loading-state"><p><i class="fa-solid fa-spinner fa-spin"></i> A carregar...</p></div>`;

        // OPTIMIZATION: If we already have the "all" products from dashboard and no searching, reuse it
        const hasDashboardData = state.dashboardProducts && state.dashboardProducts.length > 0;
        const noFiltersActive = state.filterState.category === 'all' && state.filterState.location === 'all' &&
            state.filterState.box === 'all' && state.filterState.pallet === 'all' && !state.currentFilter;

        if (hasDashboardData && noFiltersActive && !options.lowStockOnly) {
            console.log('[PERF] Reusing dashboard products for inventory view');
            state.products = [...state.dashboardProducts];
            state.totalInventoryCount = state.products.length;
        } else {
            if (options.lowStockOnly) state.filterState.status = 'low';
            await fetchProducts();
        }
        updateFilterOptions();
    }
    renderProducts(state.products);
}

export function renderProducts(products, options = {}) {
    if (!products || products.length === 0) {
        inventoryContent.innerHTML = `
            <div class="inventory-container" style="padding: 3rem; text-align: center; color: var(--text-secondary);">
                <i class="fa-solid fa-box-open" style="font-size: 2.5rem; margin-bottom: 1rem; color: #cbd5e1;"></i>
                <p>Nenhum produto encontrado.</p>
            </div>
        `;
        return;
    }

    // Apply client-side filters (for box, pallet, status)
    let filtered = products.filter(p => {
        const matchesStatus = state.filterState.status === 'all' || (state.filterState.status === 'low' && p.quantity <= p.min_quantity && p.quantity > 0) || (state.filterState.status === 'out' && p.quantity === 0);
        const matchesCategory = state.filterState.category === 'all' || p.category === state.filterState.category;
        const matchesBox = state.filterState.box === 'all' || p.box === state.filterState.box;
        const matchesPallet = state.filterState.pallet === 'all' || p.pallet === state.filterState.pallet;
        return matchesStatus && matchesCategory && matchesBox && matchesPallet;
    });

    state.totalInventoryCount = filtered.length;

    if (filtered.length === 0) {
        inventoryContent.innerHTML = `
            <div class="inventory-container" style="padding: 3rem; text-align: center; color: var(--text-secondary);">
                <i class="fa-solid fa-filter" style="font-size: 2.5rem; margin-bottom: 1rem; color: #cbd5e1;"></i>
                <p>Nenhum produto corresponde aos filtros selecionados.</p>
            </div>
        `;
        return;
    }

    // Apply local sorting
    const sort = state.sortState;
    const sortedProducts = [...filtered].sort((a, b) => {
        let valA = a[sort.column];
        let valB = b[sort.column];

        // Handle nulls
        if (valA === null || valA === undefined) valA = '';
        if (valB === null || valB === undefined) valB = '';

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sort.ascending ? -1 : 1;
        if (valA > valB) return sort.ascending ? 1 : -1;
        return 0;
    });

    // Handle pagination locally for now or keep current approach?
    // The current pagination seems to be based on server-side count?
    // Actually, state.products currently holds ALL filtered items from secure_fetch_inventory.
    const start = state.inventoryPage * state.PAGE_SIZE;
    const paginated = sortedProducts.slice(start, start + state.PAGE_SIZE);

    const showCol = (col) => {
        if (col === 'cost_price' && !state.currentUser?.can_view_prices && state.currentUser?.role !== 'admin') return false;
        return state.columnSettings[col] !== false;
    };
    const container = document.createElement('div');

    const columns = [
        { id: 'photo', label: 'Img', width: '50px', render: p => renderImageCellHTML(p) },
        { id: 'id', label: 'ID', width: '60px', render: p => `<span style="font-size:0.75rem; color:var(--text-secondary); font-family:monospace;">#${p.id}</span>` },
        {
            id: 'sales_process', label: 'Processo/PO', width: '12%', className: 'col-po', render: p => `
            <div style="font-size:0.8rem;">
                <span class="badge-po" style="background:#eff6ff; color:#1d4ed8; padding:3px 8px; border-radius:4px; font-weight:600;">${p.sales_process || '-'}</span>
            </div>`
        },
        { id: 'part_number', label: 'PN / Ref.', width: '150px', className: 'col-pn', render: p => `<span style="font-family: monospace; font-weight: 600; color: var(--text-primary);">${p.part_number || '-'}</span>` },
        { id: 'name', label: 'Designação', width: '250px', render: p => `<div style="font-weight: 500; font-size: 0.9rem;">${p.name}</div>` },
        { id: 'brand', label: 'Brand', width: '100px', render: p => `<span style="font-size:0.85rem;">${p.brand || '-'}</span>` },
        { id: 'maker', label: 'Maker', width: '100px', render: p => `<span style="font-size:0.85rem;">${p.maker || '-'}</span>` },
        { id: 'category', label: 'Tipo', width: '100px', render: p => `<span style="font-size:0.8rem; background:#f1f5f9; padding:2px 6px; border-radius:4px;">${p.category || '-'}</span>` },
        { id: 'location', label: 'Nave', width: '70px', render: p => `<span style="font-weight:600; color:#52525b; font-size:0.85rem;">${p.location || '-'}</span>` },
        {
            id: 'pallet_box',
            label: 'Palete / Caixa',
            width: '130px',
            render: p => {
                let html = '<div style="display:flex; flex-direction:column; gap:4px; align-items: flex-start;">';
                let hasSomething = false;
                if (p.pallet && showCol('pallet')) {
                    html += `<span style="background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:700; white-space:nowrap;">P: ${p.pallet}</span>`;
                    hasSomething = true;
                }
                if (p.box && showCol('box')) {
                    html += `<span style="background:#fef9c3; color:#854d0e; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight:600; white-space:nowrap;">CX: ${p.box}</span>`;
                    hasSomething = true;
                }
                html += '</div>';
                return hasSomething ? html : '-';
            }
        },
        { id: 'cost_price', label: 'U.Price', width: '90px', render: p => `<span style="font-weight:600; color:#10b981; font-size:0.85rem;">${formatCurrency(p.cost_price)}</span>` },
        {
            id: 'quantity', label: 'Qtd', width: '120px', align: 'center', render: p => (state.currentUser?.inventory_access === 'write' || state.currentUser?.inventory_access?.includes('U')) ? `
            <div class="quick-stock-actions" onclick="event.stopPropagation()">
                <button class="btn-stock-adjust minus" onclick="window.updateStock(${p.id}, -1)"><i class="fa-solid fa-minus"></i></button>
                <span class="stock-value" id="stock-val-${p.id}">${p.quantity}</span>
                <button class="btn-stock-adjust plus" onclick="window.updateStock(${p.id}, 1)"><i class="fa-solid fa-plus"></i></button>
            </div>` : `<span style="font-weight:700;">${p.quantity}</span>`
        },
        {
            id: 'actions', label: 'Ações', width: '100px', align: 'right', render: p => `
            <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
                ${(state.currentUser?.inventory_access === 'write' || state.currentUser?.inventory_access?.includes('U')) ? `
                <button class="btn btn-secondary" style="padding:4px 8px;" onclick="event.stopPropagation(); window.editProduct(${p.id})"><i class="fa-solid fa-pen-to-square"></i></button>
                ` : `<button class="btn btn-secondary" style="padding:4px 8px;" onclick="event.stopPropagation(); window.editProduct(${p.id})"><i class="fa-solid fa-eye"></i></button>`}
                ${(state.currentUser?.inventory_access === 'write' || state.currentUser?.inventory_access?.includes('D')) ? `<button class="btn btn-danger" style="padding:4px 8px;" onclick="event.stopPropagation(); window.deleteProduct(${p.id}, '${p.name.replace(/'/g, "\\'")}')"><i class="fa-solid fa-trash"></i></button>` : ''}
            </div>`
        }
    ];

    const visibleCols = columns.filter(c => showCol(c.id));
    container.className = 'inventory-container';
    container.innerHTML = `
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        ${visibleCols.map(c => {
        const isSorted = state.sortState.column === c.id;
        const icon = isSorted ? (state.sortState.ascending ? ' <i class="fa-solid fa-sort-up"></i>' : ' <i class="fa-solid fa-sort-down"></i>') : '';
        return `<th class="${c.className || ''}" style="width:${c.width}; text-align:${c.align || 'left'}; cursor:pointer;" onclick="window.handleSort('${c.id}')">
                                ${c.label}${icon}
                            </th>`;
    }).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${paginated.map(p => `
                        <tr onclick="window.editProduct(${p.id})">
                            ${visibleCols.map(c => `<td class="${c.className || ''}" style="text-align:${c.align || 'left'};">${c.render(p)}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ${renderPagination(state.inventoryPage, state.totalInventoryCount, 'window.inventoryPrev()', 'window.inventoryNext()')}
    `;

    inventoryContent.innerHTML = '';
    inventoryContent.appendChild(container);
}

export function updateFilterOptions() {
    const optionsCat = document.getElementById('options-category');
    const optionsBox = document.getElementById('options-box');
    const optionsPallet = document.getElementById('options-pallet');
    if (!optionsCat || !optionsBox) return;

    let source = (state.dashboardProducts && state.dashboardProducts.length > 0) ? state.dashboardProducts : (state.products || []);
    const categories = [...new Set(source.map(p => p.category).filter(Boolean))].sort();
    const boxes = [...new Set(source.map(p => p.box).filter(Boolean))].sort();
    const pallets = [...new Set(source.map(p => p.pallet).filter(Boolean))].sort();

    // Ensure Print Buttons visibility is correct
    const btnPrintPallet = document.getElementById('btn-print-pallet');
    if (btnPrintPallet) {
        btnPrintPallet.style.display = (state.filterState.pallet && state.filterState.pallet !== 'all') ? 'inline-flex' : 'none';
    }

    const btnPrintBox = document.getElementById('btn-print-box');
    if (btnPrintBox) {
        btnPrintBox.style.display = (state.filterState.box && state.filterState.box !== 'all') ? 'inline-flex' : 'none';
    }


    const renderItems = (items, current, allLabel) => {
        let html = `<div class="dropdown-item ${current === 'all' ? 'selected' : ''}" data-value="all">${allLabel}</div>`;
        html += items.map(item => `<div class="dropdown-item ${current === item ? 'selected' : ''}" data-value="${item}">${item}</div>`).join('');
        return html;
    };

    optionsCat.innerHTML = renderItems(categories, state.filterState.category, 'Todos os Modelos');
    optionsBox.innerHTML = renderItems(boxes, state.filterState.box, 'Todas as Caixas');
    if (optionsPallet) optionsPallet.innerHTML = renderItems(pallets, state.filterState.pallet, 'Todas as Paletes');
    setupDropdownItemClicks();
}

export function setupDropdownItemClicks() {
    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.onclick = (e) => {
            e.stopPropagation();
            const group = item.closest('.filter-group');
            const type = group.id.replace('group-', '');
            state.filterState[type] = item.dataset.value;
            group.querySelector('.filter-label').textContent = item.textContent;
            group.querySelector('.filter-dropdown').classList.remove('open');

            // Show/Hide Print Buttons
            const btnPrintPallet = document.getElementById('btn-print-pallet');
            if (btnPrintPallet) {
                if (type === 'pallet' && item.dataset.value !== 'all') {
                    btnPrintPallet.style.display = 'inline-flex';
                } else if (type === 'pallet') {
                    btnPrintPallet.style.display = 'none';
                }
            }

            const btnPrintBox = document.getElementById('btn-print-box');
            if (btnPrintBox) {
                if (type === 'box' && item.dataset.value !== 'all') {
                    btnPrintBox.style.display = 'inline-flex';
                } else if (type === 'box') {
                    btnPrintBox.style.display = 'none';
                }
            }

            state.inventoryPage = 0;
            loadInventory();
        };
    });
}

function getStockStatus(product) {
    if (product.status === 'transit') return { class: 'status-transit', label: 'Chegada Stock' };
    if (product.quantity === 0) return { class: 'status-out', label: 'Esgotado' };
    if (product.quantity <= product.min_quantity) return { class: 'status-low', label: 'Baixo' };
    return { class: 'status-ok', label: 'OK' };
}

export function editProduct(id) {
    const product = state.products.find(p => p.id === id);
    if (product) openEditModal(product);
}

export async function inventoryNext() {
    if ((state.inventoryPage + 1) * state.PAGE_SIZE < state.totalInventoryCount) {
        state.inventoryPage++;
        await loadInventory();
    }
}
export async function inventoryPrev() {
    if (state.inventoryPage > 0) {
        state.inventoryPage--;
        await loadInventory();
    }
}

export async function updateStock(id, change) {
    if (!(state.currentUser?.inventory_access === 'write' || state.currentUser?.inventory_access?.includes('U'))) return showToast('Sem permissão para editar stock.', 'error');
    const product = state.products.find(p => p.id == id);
    if (!product) return;

    const newQty = Math.max(0, product.quantity + change);

    try {
        const { error } = await supabase.rpc('secure_update_stock', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_id: id,
            p_new_qty: newQty
        });

        if (error) throw error;

        await recordMovement(id, change, change > 0 ? 'Correção de Lote (+)' : 'Consumo / Saída', product.cost_price, null, product.sales_process);
        product.quantity = newQty;
        loadInventory({ skipRefetch: true });

    } catch (err) {
        showToast('Erro ao atualizar stock: ' + err.message, 'error');
    }
}

export async function deleteProduct(id, name) {
    if (!(state.currentUser?.inventory_access === 'write' || state.currentUser?.inventory_access?.includes('D'))) return showToast('Sem permissão para apagar produtos.', 'error');
    if (!confirm(`Tem a certeza que deseja APAGAR o produto "${name}"?`)) return;

    try {
        const productToDelete = state.products.find(p => p.id === id);
        if (productToDelete) {
            await recordMovement(id, -productToDelete.quantity, `Produto Removido: ${productToDelete.name}`, productToDelete.cost_price, null, productToDelete.sales_process, null, 'OUT');
        }

        const { error } = await supabase.rpc('secure_delete_product', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_id: id
        });

        if (error) throw error;

        showToast('Produto removido com sucesso!', 'success');
        await loadInventory();

    } catch (err) {
        showToast('Erro ao apagar: ' + err.message, 'error');
    }
}
// Attach to window for inline onclicks
window.handleSort = handleSort;
window.editProduct = editProduct;
window.inventoryNext = inventoryNext;
window.inventoryPrev = inventoryPrev;
window.updateStock = updateStock;
window.deleteProduct = deleteProduct;
window.toggleSearchConfig = toggleSearchConfig;
window.updateSearchField = updateSearchField;
