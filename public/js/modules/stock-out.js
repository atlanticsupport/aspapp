import { state } from './state.js';
import { supabase } from './supabase-client.js';
import { showToast } from './ui.js';
import { openEditModal, openNewTransitModal } from './products.js';
import { dialog } from './dialogs.js';
import { recordMovement } from './data.js';
import { renderImageCellHTML, formatCurrency } from './ui.js';
import { views } from './dom.js';

export async function loadStockOutView() {
    console.log('Stock Out Module v.PICKING_SEARCH_V1');
    if (!supabase) return;
    const view = views['stock-out'];
    if (!view) return console.error('View [stock-out] not found in DOM.');

    view.innerHTML = `
        <header class="top-bar">
            <div class="view-header" style="margin-bottom: 0;">
                <i class="fa-solid fa-truck-pickup"></i>
                <h2>Saídas Stock</h2>
            </div>
            <div class="actions">
                <button class="btn btn-secondary" id="btn-refresh-stock-out" title="Atualizar">
                    <i class="fa-solid fa-rotate"></i>
                </button>
                ${(state.currentUser?.stock_out_access === 'write' || state.currentUser?.stock_out_access?.includes('C')) ? `
                <button class="btn btn-secondary trigger-phc-import" title="Importar Processo PHC">
                    <i class="fa-solid fa-cloud-arrow-down" style="color:#0ea5e9;"></i>
                </button>
                ` : ''}
            </div>
        </header>

        <div class="filter-bar">
            <div class="search-row" style="display:flex; gap:0.5rem; width:100%;">
                <div class="search-container" style="flex: 1;">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="text" id="stock-out-search" placeholder="Procurar por Processo, PN ou Descrição..." value="${state.stockOutFilterState.search || ''}" autocomplete="off">
                </div>
                ${(state.currentUser?.stock_out_access === 'write' || state.currentUser?.stock_out_access?.includes('C')) ? `
                <button class="trigger-phc-import show-mobile" title="Importar Processo PHC" style="border:none; background:none; color:#0ea5e9; font-size:1.1rem; cursor:pointer; padding: 0 8px;">
                    <i class="fa-solid fa-cloud-arrow-down"></i>
                </button>
                ` : ''}
            </div>

            <div class="filters-row">
                <div class="filter-group" id="group-stock-out-view">
                    <i class="fa-solid fa-filter"></i>
                    <span class="filter-label">${state.stockOutFilterState.view === 'archived' ? 'Histórico' : 'Pendentes'}</span>
                    <i class="fa-solid fa-chevron-down"></i>
                    <div class="filter-dropdown" id="dropdown-stock-out-view">
                        <div class="dropdown-item ${state.stockOutFilterState.view === 'active' ? 'selected' : ''}" data-value="active">Pendentes</div>
                        <div class="dropdown-item ${state.stockOutFilterState.view === 'archived' ? 'selected' : ''}" data-value="archived">Histórico</div>
                    </div>
                </div>
            </div>
        </div>

        <div id="stock-out-content" class="logistics-grid">
            <div class="loading-state">
                <div class="spinner"></div>
                <p>A carregar saídas stock...</p>
            </div>
        </div>
    `;

    // Bind events
    const btnRefresh = document.getElementById('btn-refresh-stock-out');
    if (btnRefresh) btnRefresh.onclick = () => fetchStockOutItems();

    const searchInput = document.getElementById('stock-out-search');
    if (searchInput) {
        searchInput.oninput = (e) => {
            state.stockOutFilterState.search = e.target.value;
            renderStockOutItems();
        };
    }

    // Dropdown Toggle
    const groupView = document.getElementById('group-stock-out-view');
    const dropdownView = document.getElementById('dropdown-stock-out-view');
    if (groupView && dropdownView) {
        groupView.onclick = (e) => {
            e.stopPropagation();
            dropdownView.classList.toggle('open');
        };

        dropdownView.querySelectorAll('.dropdown-item').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();
                const val = item.dataset.value;
                state.stockOutFilterState.view = val;

                document.querySelector('#group-stock-out-view .filter-label').textContent = item.textContent;
                dropdownView.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');

                dropdownView.classList.remove('open');
                renderStockOutItems();
            };
        });
    }

    document.addEventListener('click', () => {
        if (dropdownView) dropdownView.classList.remove('open');
    });

    // Manual Search in Picking Modal
    const modal = document.getElementById('modal-stock-out-pick');
    if (modal) {
        const sopSearchInput = modal.querySelector('#sop-manual-search');
        const sopSearchBtn = modal.querySelector('#sop-btn-search');
        const closeBtn = modal.querySelector('.close-modal');

        let debounceTimer;
        if (sopSearchInput) {
            sopSearchInput.oninput = (e) => {
                const demandId = parseInt(sopSearchBtn?.dataset.demandId);
                const query = sopSearchInput.value;
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    if (demandId) openStockOutPickModal(demandId, query);
                }, 300);
            };
            sopSearchInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    const demandId = parseInt(sopSearchBtn?.dataset.demandId);
                    if (demandId) openStockOutPickModal(demandId, sopSearchInput.value);
                }
            };
        }

        if (sopSearchBtn) {
            sopSearchBtn.onclick = () => {
                const demandId = parseInt(sopSearchBtn.dataset.demandId);
                const query = sopSearchInput?.value;
                if (demandId) openStockOutPickModal(demandId, query);
            };
        }

        if (closeBtn) closeBtn.onclick = () => modal.classList.remove('open');
    }

    await fetchStockOutItems();
}

export async function fetchStockOutItems() {
    try {
        const { data, error } = await supabase.rpc('secure_fetch_inventory', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_search: '',
            p_category: 'all',
            p_location: 'all',
            p_only_stockout: true
        });

        if (error) throw error;

        console.log(`[STOCK-OUT] Total items received: ${data?.length || 0}`);
        if (data && data.length > 0) {
            console.log(`[STOCK-OUT] Sample item status: ${data[0].status}`);
            const doneCount = data.filter(i => i.status === 'stockout_done').length;
            console.log(`[STOCK-OUT] Items in 'stockout_done' state: ${doneCount}`);
        }

        const allItems = data || [];
        allItems.sort((a, b) => {
            if (a.sales_process !== b.sales_process) return (a.sales_process || '').localeCompare(b.sales_process || '');
            return a.name.localeCompare(b.name);
        });

        state.stockOutProducts = allItems;
        renderStockOutItems();
    } catch (err) {
        console.error('StockOut fetch error:', err);
        showToast('Erro ao carregar saídas stock.', 'error');
    }
}

export function renderStockOutItems() {
    const container = document.getElementById('stock-out-content');
    if (!container) return;

    const isArchived = state.stockOutFilterState.view === 'archived';
    const search = (state.stockOutFilterState.search || '').toLowerCase();

    // Group items by process
    const processGroups = {};
    state.stockOutProducts.forEach(item => {
        const proc = item.sales_process || 'Sem Processo';
        if (!processGroups[proc]) processGroups[proc] = [];
        processGroups[proc].push(item);
    });

    const filteredGroups = Object.entries(processGroups).filter(([proc, items]) => {
        const hasPending = items.some(i => i.status === 'stockout_pending');
        if (isArchived) return !hasPending;
        return hasPending;
    });

    const finalGroups = filteredGroups.filter(([proc, items]) => {
        if (!search) return true;
        const normalizedProc = (proc || '').toLowerCase();
        return normalizedProc.includes(search) ||
            items.some(i => (i.part_number || '').toLowerCase().includes(search) ||
                (i.name || '').toLowerCase().includes(search));
    });

    if (finalGroups.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:3rem; color:var(--text-secondary);">Nenhum processo ${isArchived ? 'concluído' : 'pendente'} encontrado.</div>`;
        return;
    }

    const savedOpenGroups = JSON.parse(localStorage.getItem('aspstock_stockout_open_groups') || '[]');
    const openGroups = new Set(savedOpenGroups);

    container.innerHTML = '';

    finalGroups.forEach(([process, items]) => {
        const processId = encodeURIComponent(process || 'no-process').replace(/%/g, 'X');
        const isExpanded = openGroups.has(processId);

        const first = items[0];
        const clientName = first.order_to || first.supplier || '';
        const orderDate = first.order_date ? new Date(first.order_date).toLocaleDateString('pt-PT') : '';

        const countTotal = items.length;
        const sumQty = items.reduce((acc, curr) => acc + (curr.quantity || 0), 0);
        const countPending = items.filter(i => i.status === 'stockout_pending').length;

        const folder = document.createElement('div');
        folder.id = `folder-stockout-${processId}`;
        folder.className = `logistics-folder ${countPending === 0 ? 'shipped' : ''} ${isExpanded ? 'expanded' : ''}`;

        folder.innerHTML = `
            <div class="folder-header" onclick="window.toggleStockOutFolder('${process}')">
                <div class="folder-info">
                    <i class="fa-solid fa-truck-pickup"></i>
                    <div class="folder-text">
                        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom: 4px;">
                            <h3 style="margin:0; font-size: 1.1rem; color: var(--text-primary);">${process}</h3>
                            ${clientName ? `<span style="font-size:0.75rem; font-weight:700; color:#1e40af; background:#dbeafe; padding:2px 8px; border-radius:12px; text-transform:uppercase; border: 1px solid #bfdbfe;">${clientName}</span>` : ''}
                        </div>
                        <div class="folder-meta">
                            <span><i class="fa-solid fa-list-check"></i> <strong>${countTotal}</strong> Linhas</span>
                            <span><i class="fa-solid fa-cubes"></i> <strong>${sumQty}</strong> Unidades</span>
                            ${orderDate ? `<span><i class="fa-solid fa-calendar-day"></i> ${orderDate}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="folder-actions">
                    <div style="display:flex; align-items:center; gap:8px;">
                         ${countPending > 0 ? `<span class="badge badge-warning" style="padding: 4px 10px; font-weight:600;">${countPending} Pendentes</span>` : '<span class="badge badge-success" style="padding: 4px 10px; font-weight:600;"><i class="fa-solid fa-check"></i> Concluído</span>'}
                         <button class="btn-icon-danger btn-delete-all-mobile" onclick="event.stopPropagation(); window.deleteAllStockOutItems('${process}')" title="Apagar todos os itens deste processo" style="padding: 6px 10px; background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; border-radius: 6px; cursor: pointer; transition: all 0.2s;">
                            <i class="fa-solid fa-trash"></i>
                         </button>
                    </div>
                    <i class="fa-solid fa-chevron-down toggle-icon" style="${isExpanded ? 'transform: rotate(180deg);' : ''}"></i>
                </div>
            </div>
            
            <div class="folder-items ${isExpanded ? 'open' : ''}">
                ${renderStockOutTable(items)}
            </div>
        `;
        container.appendChild(folder);
    });
}

export function toggleStockOutFolder(proc) {
    const processId = encodeURIComponent(proc || 'no-process').replace(/%/g, 'X');
    const folder = document.getElementById(`folder-stockout-${processId}`);
    if (!folder) return;

    const isExpanded = folder.classList.toggle('expanded');
    const itemsPanel = folder.querySelector('.folder-items');
    if (itemsPanel) itemsPanel.classList.toggle('open', isExpanded);

    const currentSaved = JSON.parse(localStorage.getItem('aspstock_stockout_open_groups') || '[]');
    let newSaved;
    if (isExpanded) {
        if (!currentSaved.includes(processId)) newSaved = [...currentSaved, processId];
        else newSaved = currentSaved;
    } else {
        newSaved = currentSaved.filter(id => id !== processId);
    }
    localStorage.setItem('aspstock_stockout_open_groups', JSON.stringify(newSaved));
}

function renderStockOutTable(items) {
    const headers = [
        { id: 'photo', label: 'Img', width: '50px' },
        { id: 'part_number', label: 'Part-Number', width: '12%' },
        { id: 'name', label: 'Descrição', width: '25%' },
        { id: 'cost_price', label: 'Custo', width: '10%' },
        { id: 'order_to', label: 'Fornecedor', width: '15%' },
        { id: 'quantity', label: 'Qtd', width: '8%' },
        { id: 'actions', label: 'Ações', width: 'auto' }
    ];

    return `
    <table class="data-table">
        <thead>
            <tr>
                ${headers.map(h => `<th style="width:${h.width}">${h.label}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            ${items.map(item => {
        const isDone = item.status === 'stockout_done';
        return `
                <tr class="${isDone ? 'item-checked' : ''}">
                    <td class="col-photo" style="text-align: center;">${renderImageCellHTML(item)}</td>
                    <td class="font-mono" style="font-weight:600;">${item.part_number || '---'}</td>
                    <td>
                         <div style="font-weight:500;">${item.name || 'Sem nome'}</div>

                    </td>
                    <td style="color: #10b981; font-weight: 600;">${formatCurrency(item.cost_price)}</td>
                    <td style="font-size: 0.85rem; color: var(--text-secondary);">${item.order_to || '-'}</td>
                    <td style="text-align:center; font-weight:700;">${item.quantity}</td>
                    <td style="text-align:right;">
                        <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
                            ${isDone ? `
                                <div style="display:flex; flex-direction:column; align-items:flex-end;">
                                    <span class="badge badge-success" style="margin-bottom:4px;"><i class="fa-solid fa-check"></i> Saída ok</span>
                                    ${(state.currentUser?.stock_out_access === 'write' || state.currentUser?.stock_out_access?.includes('U')) ? `
                                    <button class="btn-icon" onclick="window.undoStockOutItem(${item.id})" title="Reverter Saída" style="color:#d97706; background:#fff7ed; border:none; padding:4px 8px; border-radius:6px; font-size:0.7rem; font-weight:600;">
                                        <i class="fa-solid fa-rotate-left"></i> Reverter
                                    </button>` : ''}
                                </div>
                            ` : `
                                <button class="btn btn-primary" onclick="window.openStockOutPickModal(${item.id})" style="padding: 6px 12px; font-size: 0.8rem; border-radius:8px;">
                                    <i class="fa-solid fa-hand-pointer"></i> Picking
                                </button>
                                <button class="btn btn-icon" onclick="window.deleteStockOutItem(${item.id})" title="Remover" style="color:#ef4444; background:#fef2f2; border:none; padding:8px; border-radius:8px;">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            `}
                        </div>
                    </td>
                </tr>
            `;
    }).join('')}
        </tbody>
    </table>
    `;
}

export async function openStockOutPickModal(demandId, manualSearch = null) {
    const demand = state.stockOutProducts.find(p => p.id === demandId);
    if (!demand) return;

    const modal = document.getElementById('modal-stock-out-pick');
    const demandInfo = document.getElementById('sop-demand-info');
    const body = document.getElementById('sop-body');
    const empty = document.getElementById('sop-empty');
    const table = document.getElementById('sop-table');
    const header = document.getElementById('sop-selection-header');
    const searchInput = document.getElementById('sop-manual-search');
    const searchBtn = document.getElementById('sop-btn-search');

    if (searchBtn) searchBtn.dataset.demandId = demandId;

    if (!manualSearch) {
        if (searchInput) {
            searchInput.value = '';
            setTimeout(() => searchInput.focus(), 100);
        }
    }

    demandInfo.innerHTML = `
        <div style="flex:1;">
            <div style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase;">Necessidade</div>
            <div style="font-family:monospace; font-weight:700; font-size:1.1rem; color:var(--primary-color);">${demand.part_number}</div>
            <div style="font-size:0.85rem; color:var(--text-primary); margin-top:2px;">${demand.name}</div>
        </div>
        <div style="text-align:right;">
            <div style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase;">Qtd Pedida</div>
            <div style="font-size:1.5rem; font-weight:800; color:var(--text-primary);">${demand.quantity}</div>
        </div>
    `;

    // Only show spinner on first load or deliberate manual search click, not tiny debounced keystrokes if possible?
    // Let's keep it simple for now and keep the spinner
    body.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem;"><div class="spinner" style="margin:0 auto;"></div></td></tr>';
    empty.style.display = 'none';
    table.style.display = 'table';
    if (header) header.style.display = 'block';
    modal.classList.add('open');

    try {
        const query = manualSearch || demand.part_number;

        const { data, error } = await supabase.rpc('secure_fetch_inventory', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_search: query,
            p_only_transit: false,
            p_only_stockout: false
        });

        if (error) throw error;

        // Priority filtering: substring match on Part Number OR Name
        const physicalStock = (data || []).filter(p => {
            const isAvailable = p.status === 'available' && p.quantity > 0;
            if (!isAvailable) return false;

            const target = query.toLowerCase();
            const pnMatch = (p.part_number || '').toLowerCase().includes(target);
            const nameMatch = (p.name || '').toLowerCase().includes(target);

            return pnMatch || nameMatch;
        });

        if (physicalStock.length === 0) {
            table.style.display = 'none';
            if (header) header.style.display = 'none';
            empty.style.display = 'block';
            empty.innerHTML = `
                <i class="fa-solid fa-circle-exclamation" style="font-size: 2rem; margin-bottom: 1rem; color: #ef4444;"></i>
                <p>Nenhum item físico encontrado para "<strong>${query}</strong>".</p>
                <p style="font-size:0.8rem; color:#64748b; margin-top:4px;">Tente pesquisar manualmente por outra referência ou nome acima.</p>
            `;
        } else {
            if (header) header.style.display = 'block';

            // Pagination implementation
            let currentLimit = 5;

            const renderRows = (limit) => {
                const visible = physicalStock.slice(0, limit);
                body.innerHTML = visible.map(p => `
                    <tr>
                        <td style="padding: 1rem 0.75rem;">
                            <span class="badge" style="background:#f1f5f9; color:#475569; font-weight:700; padding:4px 10px; border-radius:6px; font-size:0.75rem; border:1px solid #e2e8f0;">
                                <i class="fa-solid fa-location-dot" style="margin-right:5px; color:var(--primary-color);"></i> Nave ${p.location || '1'}
                            </span>
                        </td>
                        <td>
                            <div style="font-weight:600; color:var(--text-primary);">${p.part_number}</div>
                            <div style="font-size:0.75rem; color:#64748b; font-weight:500;">${p.name || ''}</div>
                            <div style="font-size:0.7rem; color:#94a3b8; display:flex; flex-direction:column; gap:2px; margin-top:4px;">
                                <span><i class="fa-solid fa-pallet" style="width:14px; text-align:center;"></i> ${p.pallet || 'S/ Palete'}</span>
                                <span><i class="fa-solid fa-box-open" style="width:14px; text-align:center;"></i> ${p.box || 'S/ Caixa'}</span>
                            </div>
                        </td>
                        <td style="text-align:center;"><strong style="font-size:1.1rem; color:var(--text-primary);">${p.quantity}</strong></td>
                        <td style="text-align:right;">
                            <button class="btn btn-primary" onclick="window.executeStockOutFulfillment(${demand.id}, ${p.id})" style="padding: 6px 12px; font-size: 0.8rem; border-radius:8px;">
                                <i class="fa-solid fa-truck-ramp-box"></i> Retirar
                            </button>
                        </td>
                    </tr>
                `).join('');

                if (limit < physicalStock.length) {
                    body.insertAdjacentHTML('beforeend', `
                        <tr>
                            <td colspan="4" style="text-align:center; padding: 1rem;">
                                <a href="#" id="sop-load-more" style="color:var(--primary-color); font-weight:600; text-decoration:none; font-size:0.9rem;">
                                    <i class="fa-solid fa-plus-circle"></i> Ver mais (${physicalStock.length - limit} restantes)
                                </a>
                            </td>
                        </tr>
                    `);
                    document.getElementById('sop-load-more').onclick = (e) => {
                        e.preventDefault();
                        currentLimit += 5;
                        renderRows(currentLimit);
                    };
                }
            };

            renderRows(currentLimit);
        }
    } catch (err) {
        console.error('Fetch physical stock error:', err);
        showToast('Erro ao procurar stock disponível.', 'error');
        modal.classList.remove('open');
    }
}

export async function executeStockOutFulfillment(demandId, physicalId) {
    const demand = state.stockOutProducts.find(p => p.id === demandId);
    if (!demand) return;

    const confirmed = await dialog.confirm({
        title: 'Confirmar Retirada',
        message: `Deseja retirar ${demand.quantity} unidades desta localização?`,
        confirmText: 'Confirmar Saída'
    });

    if (!confirmed) return;

    try {
        showToast('A processar saída...', 'info');

        // Fix: Use secure_fetch_inventory to get the current physical stock safely
        const { data, error: fetchErr } = await supabase.rpc('secure_fetch_inventory', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_search: '', // We already have the ID, but let's filter after fetch or use a separate RPC
            p_category: 'all',
            p_location: 'all',
            p_only_transit: false
        });

        if (fetchErr) throw fetchErr;

        const physData = (data || []).find(p => p.id === physicalId);
        if (!physData) throw new Error('Produto físico não encontrado.');

        if (physData.quantity < demand.quantity) {
            showToast(`Stock insuficiente nesta localização (${physData.quantity} disponíveis).`, 'warning');
            return;
        }

        await recordMovement(
            physicalId,
            -demand.quantity,
            `Saída Stock (Ref: ${demand.sales_process || 'N/A'})`,
            physData.cost_price,
            demand.order_to || 'CLIENTE',
            demand.sales_process,
            null,
            'OUT'
        );

        const { error: updErr } = await supabase.rpc('secure_save_product', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_data: {
                ...demand,
                status: 'stockout_done',
                location: physData.location,
                pallet: physData.pallet,
                box: physData.box
            },
            p_event_type: 'STOCK_OUT',
            p_event_title: `Conclusão de Saída: ${demand.sales_process || 'Sem Processo'}`,
            p_event_summary: `Pedido concluído na Ref: ${physData.part_number}`
        });

        if (updErr) throw updErr;

        // NEW: Decrement physical stock quantity with explicit casting
        const physTotal = Number(physData.quantity) || 0;
        const demandTotal = Number(demand.quantity) || 0;
        const newPhysQty = physTotal - demandTotal;

        console.log(`[STOCK-OUT] Updating physical stock ID ${physicalId} from ${physTotal} to ${newPhysQty}`);

        const { error: qtyErr } = await supabase.rpc('secure_update_stock', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_id: physicalId,
            p_new_qty: newPhysQty,
            p_event_type: 'STOCK_OUT',
            p_event_title: 'Saída de Stock Física',
            p_event_summary: `Ref ${physData.part_number}: ${physTotal} → ${newPhysQty} (Proc: ${demand.sales_process || 'N/A'})`
        });

        if (qtyErr) throw qtyErr;

        showToast('Saída efetuada com sucesso!', 'success');
        document.getElementById('modal-stock-out-pick').classList.remove('open');

        // Final refresh and inventory cache clear
        console.log('[STOCK-OUT] Refreshing views...');
        state.dashboardProducts = []; // Clear dashboard cache
        state.products = []; // Clear products cache

        await fetchStockOutItems();

        // Force global inventory refresh
        const { fetchProducts } = await import('./data.js');
        await fetchProducts();
    } catch (err) {
        console.error('Fulfillment error:', err);
        showToast('Erro ao processar saída física.', 'error');
    }
}

export async function undoStockOutItem(id) {
    const demand = state.stockOutProducts.find(p => p.id === id);
    if (!demand) return;

    const confirmed = await dialog.confirm({
        title: 'Reverter Saída',
        message: `Deseja anular esta saída de ${demand.quantity} unidades e devolver ao stock?`,
        confirmText: 'Sim, Reverter',
        type: 'warning'
    });

    if (!confirmed) return;

    try {
        showToast('A reverter saída...', 'info');

        // 1. Fetch available stock to find where to return
        // We look for a product with SAME PN, Location, Pallet, Box
        const { data, error: fetchErr } = await supabase.rpc('secure_fetch_inventory', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_search: demand.part_number,
            p_category: 'all',
            p_location: 'all', // Search everywhere
            p_only_transit: false
        });

        if (fetchErr) throw fetchErr;

        // Try to find the exact matching physical record
        const physicalItem = (data || []).find(p =>
            p.part_number === demand.part_number &&
            p.location === demand.location &&
            p.pallet === demand.pallet &&
            p.box === demand.box
        );

        if (physicalItem) {
            // Restore quantity
            const newQty = Number(physicalItem.quantity) + Number(demand.quantity);
            const { error: qtyErr } = await supabase.rpc('secure_update_stock', {
                p_user: state.currentUser.username,
                p_pass: state.currentUser.password,
                p_id: physicalItem.id,
                p_new_qty: newQty
            });
            if (qtyErr) throw qtyErr;

            await recordMovement(
                physicalItem.id,
                demand.quantity,
                `Reversão de Saída (Ref: ${demand.sales_process || 'N/A'})`,
                physicalItem.cost_price,
                demand.order_to || 'CLIENTE',
                demand.sales_process,
                null,
                'IN'
            );
        } else {
            // If physical record was somehow deleted or changed, we might need to alert
            // But usually it should be there.
            console.warn('[STOCK-OUT] Physical record not found for reversal. Item will be set to pending but stock not updated.');
        }

        // 2. Revert demand status
        const { error: updErr } = await supabase.rpc('secure_save_product', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_data: {
                ...demand,
                status: 'stockout_pending',
                location: null,
                pallet: null,
                box: null
            }
        });

        if (updErr) throw updErr;

        showToast('Saída revertida com sucesso!', 'success');

        await fetchStockOutItems();
        const { fetchProducts } = await import('./data.js');
        await fetchProducts();

    } catch (err) {
        console.error('Undo fulfillment error:', err);
        showToast('Erro ao reverter saída.', 'error');
    }
}

export async function deleteStockOutItem(id) {
    const confirmed = await dialog.confirm({
        title: 'Remover Saída',
        message: 'Tem a certeza que deseja remover este item desta lista de saídas?',
        confirmText: 'Sim, Remover',
        type: 'danger'
    });
    if (!confirmed) return;

    try {
        const { error } = await supabase.rpc('secure_delete_product', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_id: id
        });
        if (error) throw error;
        showToast('Item removido.', 'success');
        fetchStockOutItems();
    } catch (err) {
        console.error('Delete StockOut error:', err);
        showToast('Erro ao remover.', 'error');
    }
}

async function deleteAllStockOutItems(process) {
    const confirmed = await dialog.confirm({
        title: 'Apagar Todos os Itens',
        message: `Tem a certeza que deseja apagar TODOS os itens do processo "${process}"?\n\nEsta ação é irreversível.`,
        confirmText: 'Sim, Apagar Tudo',
        cancelText: 'Cancelar',
        type: 'danger'
    });

    if (!confirmed) return;

    try {
        // Get all items for this process
        if (!state.stockOutProducts || !Array.isArray(state.stockOutProducts)) {
            showToast('Nenhum item encontrado para apagar.', 'warning');
            return;
        }

        const itemsToDelete = state.stockOutProducts.filter(item => item.sales_process === process);

        if (itemsToDelete.length === 0) {
            showToast('Nenhum item encontrado para apagar.', 'warning');
            return;
        }

        showToast(`A apagar ${itemsToDelete.length} itens...`, 'info');

        // Delete each item
        for (const item of itemsToDelete) {
            const { error } = await supabase.rpc('secure_delete_product', {
                p_user: state.currentUser.username,
                p_pass: state.currentUser.password,
                p_id: item.id
            });
            if (error) throw error;
        }

        showToast(`${itemsToDelete.length} itens apagados com sucesso.`, 'success');
        fetchStockOutItems();
    } catch (err) {
        console.error('Delete All StockOut error:', err);
        showToast('Erro ao apagar itens: ' + err.message, 'error');
    }
}

window.toggleStockOutFolder = toggleStockOutFolder;
window.openStockOutPickModal = openStockOutPickModal;
window.deleteAllStockOutItems = deleteAllStockOutItems;
window.executeStockOutFulfillment = executeStockOutFulfillment;
window.undoStockOutItem = undoStockOutItem;
window.deleteStockOutItem = deleteStockOutItem;
