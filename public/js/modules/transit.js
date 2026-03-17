import { state } from './state.js';
import { supabase } from './supabase-client.js';
import { showToast } from './ui.js';
import { openEditModal, openNewTransitModal } from './products.js';
import { dialog } from './dialogs.js';
import { recordMovement } from './data.js';
import { renderImageCellHTML } from './ui.js';
import { views } from './dom.js';

export async function loadTransitView() {
    if (!supabase) return;
    
    // Debug permissions and state
    console.log('[TRANSIT] Current user permissions:', {
        transit_access: state.currentUser?.transit_access,
        role: state.currentUser?.role
    });
    
    console.log('[TRANSIT] state.currentUser:', state.currentUser);
    console.log('[TRANSIT] localStorage session:', localStorage.getItem('aspapp_session')?.substring(0, 100) + '...');

    views.transit.innerHTML = `
        <header class="top-bar">
            <div class="view-header" style="margin-bottom: 0;">
                <i class="fa-solid fa-truck-fast"></i>
                <h2>Chegadas Stock</h2>
            </div>
            <div class="actions">
                <button class="btn btn-secondary" id="btn-refresh-transit" title="Atualizar">
                    <i class="fa-solid fa-rotate"></i>
                </button>
                ${(state.currentUser?.transit_access === 'write' || state.currentUser?.transit_access?.includes('C')) ? `
                <button class="btn btn-secondary trigger-phc-import" title="Importar Processo PHC">
                    <i class="fa-solid fa-cloud-arrow-down" style="color:#0ea5e9;"></i>
                </button>
                <button class="btn btn-primary" id="btn-add-product-transit">
                    <i class="fa-solid fa-plus" style="color:white;"></i> Nova Chegada
                </button>
                ` : ''}
            </div>
        </header>

        <div class="filter-bar">
            <div class="search-row" style="display:flex; gap:0.5rem; width:100%;">
                <div class="search-container" style="flex: 1;">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="text" id="transit-search" placeholder="Procurar por Processo, PN ou Descrição..." value="${state.transitFilterState.search || ''}" autocomplete="off">
                </div>
                ${(state.currentUser?.transit_access === 'write' || state.currentUser?.transit_access?.includes('C')) ? `
                <button class="trigger-phc-import show-mobile" title="Importar Processo PHC" style="border:none; background:none; color:#0ea5e9; font-size:1.1rem; cursor:pointer; padding: 0 8px;">
                    <i class="fa-solid fa-cloud-arrow-down"></i>
                </button>
                <button id="btn-add-product-transit-mobile" class="show-mobile" title="Nova Chegada" style="border:none; background:none; color:var(--primary-color); font-size:1.1rem; cursor:pointer; padding: 0 8px;">
                    <i class="fa-solid fa-plus"></i>
                </button>
                ` : ''}
            </div>

            <div class="filters-row">
                <div class="filter-group" id="group-transit-view">
                    <i class="fa-solid fa-filter"></i>
                    <span class="filter-label">${state.transitFilterState.view === 'archived' ? 'Arquivados' : 'Ativos'}</span>
                    <i class="fa-solid fa-chevron-down"></i>
                    <div class="filter-dropdown" id="dropdown-transit-view">
                        <div class="dropdown-item ${state.transitFilterState.view === 'active' ? 'selected' : ''}" data-value="active">Ativos</div>
                        <div class="dropdown-item ${state.transitFilterState.view === 'archived' ? 'selected' : ''}" data-value="archived">Arquivados</div>
                    </div>
                </div>
            </div>
        </div>

        <div id="transit-content" class="logistics-grid">
            <div class="loading-state">
                <div class="spinner"></div>
                <p>A carregar chegadas stock...</p>
            </div>
        </div>
    `;

    // Bind events
    const btnRefresh = document.getElementById('btn-refresh-transit');
    if (btnRefresh) btnRefresh.onclick = () => fetchTransitItems();

    const btnAdd = document.getElementById('btn-add-product-transit');
    if (btnAdd) btnAdd.onclick = () => openNewTransitModal();

    const btnAddMobile = document.getElementById('btn-add-product-transit-mobile');
    if (btnAddMobile) btnAddMobile.onclick = () => openNewTransitModal();

    const searchInput = document.getElementById('transit-search');
    if (searchInput) {
        searchInput.oninput = (e) => {
            state.transitFilterState.search = e.target.value;
            renderTransitItems();
        };
    }

    // Dropdown Toggle
    const groupView = document.getElementById('group-transit-view');
    const dropdownView = document.getElementById('dropdown-transit-view');
    if (groupView && dropdownView) {
        groupView.onclick = (e) => {
            e.stopPropagation();
            dropdownView.classList.toggle('open');
        };

        dropdownView.querySelectorAll('.dropdown-item').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();
                const val = item.dataset.view || item.dataset.value;
                state.transitFilterState.view = val;

                document.querySelector('#group-transit-view .filter-label').textContent = item.textContent;
                dropdownView.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');

                dropdownView.classList.remove('open');
                renderTransitItems();
            };
        });
    }

    // Close on click away
    document.addEventListener('click', () => {
        if (dropdownView) dropdownView.classList.remove('open');
    });

    await fetchTransitItems();
}

// No events to bind currently as actions are dynamic

export async function fetchTransitItems() {
    // Check if user is logged in
    if (!state.currentUser) {
        console.error('[TRANSIT] No current user found, cannot fetch items');
        showToast('Utilizador não autenticado.', 'error');
        return;
    }
    
    try {
        const { data, error } = await supabase.rpc('secure_fetch_inventory', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_search: '',
            p_category: 'all',
            p_location: 'all',
            p_only_transit: true
        });

        if (error) throw error;

        const allItems = data || [];

        allItems.sort((a, b) => {
            if (a.sales_process !== b.sales_process) return (a.sales_process || '').localeCompare(b.sales_process || '');
            return a.name.localeCompare(b.name);
        });

        state.transitProducts = allItems;
        renderTransitItems();
    } catch (err) {
        console.error('Transit fetch error:', err);
        showToast('Erro ao carregar chegadas stock.', 'error');
    }
}

export function renderTransitItems() {
    const container = document.getElementById('transit-content');
    if (!container) return;

    // Intelligent local grouping and filtering
    const isArchived = state.transitFilterState.view === 'archived';
    const search = (state.transitFilterState.search || '').toLowerCase();

    // 1. Group ALL items by process first
    const processGroups = {};
    state.transitProducts.forEach(item => {
        const proc = item.sales_process || 'Sem Processo';
        if (!processGroups[proc]) processGroups[proc] = [];
        processGroups[proc].push(item);
    });

    // 2. Filter groups based on View (Active vs Archived)
    const filteredGroups = Object.entries(processGroups).filter(([proc, items]) => {
        // A process is "Pending" (Active) if it has at least one item that is NOT 'available'
        const hasPending = items.some(i => i.status !== 'available');

        if (isArchived) return !hasPending;
        return hasPending;
    });

    // 3. Further filter by Search term
    const finalGroups = filteredGroups.filter(([proc, items]) => {
        if (!search) return true;
        const normalizedProc = (proc || '').toLowerCase();
        return normalizedProc.includes(search) ||
            items.some(i => (i.part_number || '').toLowerCase().includes(search) ||
                (i.name || '').toLowerCase().includes(search));
    });

    if (finalGroups.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:3rem; color:var(--text-secondary);">Nenhum processo ${isArchived ? 'arquivado' : 'ativo'} encontrado.</div>`;
        return;
    }

    const savedOpenGroups = JSON.parse(localStorage.getItem('aspstock_transit_open_groups') || '[]');
    const openGroups = new Set(savedOpenGroups);

    container.innerHTML = ''; // Clear

    finalGroups.forEach(([process, items]) => {
        // Safe ID for DOM: handles slashes, dots and spaces
        const processId = encodeURIComponent(process || 'no-process').replace(/%/g, 'X');
        const isExpanded = openGroups.has(processId);

        // Meta from first item
        const first = items[0];
        const clientName = first.order_to || first.supplier || '';
        const orderDate = first.order_date ? new Date(first.order_date).toLocaleDateString('pt-PT') : '';
        const shipPlant = first.ship_plant || '';
        const author = first.author || '';
        const createdAt = first.created_at ? new Date(first.created_at).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

        const countTotal = items.length;
        const sumQty = items.reduce((acc, curr) => acc + (curr.quantity || 0), 0);
        const countPending = items.filter(i => i.status === 'transit').length;

        const folder = document.createElement('div');
        folder.id = `folder-transit-${processId}`;
        folder.className = `logistics-folder ${countPending === 0 ? 'shipped' : ''} ${isExpanded ? 'expanded' : ''}`;

        folder.innerHTML = `
            <div class="folder-header" onclick="window.toggleTransitFolder('${process}')">
                <div class="folder-info">
                    <i class="fa-solid fa-truck-ramp-box"></i>
                    <div class="folder-text">
                        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom: 4px;">
                            <h3 style="margin:0; font-size: 1.1rem; color: var(--text-primary);">${process}</h3>
                            ${clientName ? `<span style="font-size:0.75rem; font-weight:700; color:#1e40af; background:#dbeafe; padding:2px 8px; border-radius:12px; text-transform:uppercase; border: 1px solid #bfdbfe;">${clientName}</span>` : ''}
                        </div>
                        <div class="folder-meta">
                            <span><i class="fa-solid fa-list-check"></i> <strong>${countTotal}</strong><span class="meta-label"> Linhas</span></span>
                            <span><i class="fa-solid fa-cubes"></i> <strong>${sumQty}</strong><span class="meta-label"> Unidades</span></span>
                            ${orderDate ? `<span><i class="fa-solid fa-calendar-day"></i> ${orderDate}</span>` : ''}
                            ${author ? `<span><i class="fa-solid fa-user-pen"></i> ${author}</span>` : ''}
                            ${shipPlant ? `<span title="Planta de Embarque"><i class="fa-solid fa-industry"></i> ${shipPlant}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="folder-actions">
                    <div style="display:flex; align-items:center; gap:8px;">
                         ${countPending > 0 ? `<span class="badge badge-warning" style="padding: 4px 10px; font-weight:600;">${countPending} por Confirmar</span>` : `<span class="badge badge-success" style="padding: 4px 10px; font-weight:600;"><i class="fa-solid fa-check-double"></i> Concluído</span>`}
                         <button class="btn-icon-danger btn-delete-all-mobile" onclick="event.stopPropagation(); window.deleteAllTransitItems('${process}')" title="Apagar todos os itens deste processo" style="padding: 6px 10px; background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; border-radius: 6px; cursor: pointer; transition: all 0.2s;">
                            <i class="fa-solid fa-trash"></i>
                         </button>
                    </div>
                    <i class="fa-solid fa-chevron-down toggle-icon" style="color:#94a3b8; transition: transform 0.2s; ${isExpanded ? 'transform: rotate(180deg);' : ''}"></i>
                </div>
            </div>
            
            <div class="folder-items ${isExpanded ? 'open' : ''}">
                ${renderTransitTable(items)}
            </div>
        `;

        container.appendChild(folder);
    });
}

export function toggleTransitFolder(proc) {
    const processId = encodeURIComponent(proc || 'no-process').replace(/%/g, 'X');
    const folder = document.getElementById(`folder-transit-${processId}`);
    if (!folder) return;

    const isExpanded = folder.classList.toggle('expanded');
    const itemsPanel = folder.querySelector('.folder-items');
    if (itemsPanel) {
        itemsPanel.classList.toggle('open', isExpanded);
    }

    // Update Persistence
    const currentSaved = JSON.parse(localStorage.getItem('aspstock_transit_open_groups') || '[]');
    let newSaved;

    if (isExpanded) {
        if (!currentSaved.includes(processId)) newSaved = [...currentSaved, processId];
        else newSaved = currentSaved;
    } else {
        newSaved = currentSaved.filter(id => id !== processId);
    }

    localStorage.setItem('aspstock_transit_open_groups', JSON.stringify(newSaved));
}

export function handleTransitSort(column) {
    const current = state.transitSortState;
    if (current.column === column) {
        current.ascending = !current.ascending;
    } else {
        state.transitSortState = { column, ascending: true };
    }
    renderTransitItems();
}

function renderTransitTable(items) {
    const sort = state.transitSortState;
    const sorted = [...items].sort((a, b) => {
        let valA = a[sort.column] || '';
        let valB = b[sort.column] || '';
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sort.ascending ? -1 : 1;
        if (valA > valB) return sort.ascending ? 1 : -1;
        return 0;
    });

    const headers = [
        { id: 'photo', label: 'Img', width: '50px', sortable: false },
        { id: 'part_number', label: 'Referência', width: '12%', sortable: true },
        { id: 'name', label: 'Designação / Detalhes', width: '30%', sortable: true },
        { id: 'maker', label: 'Maker', width: '10%', sortable: true },
        { id: 'quantity', label: 'Qtd', width: '6%', sortable: true },
        { id: 'delivery_time', label: 'Del. Time', width: '10%', sortable: true },
        { id: 'order_to', label: 'Fornecedor / Proc.', width: '15%', sortable: true },
        { id: 'actions', label: 'Ações', width: 'auto', sortable: false }
    ];

    return `
    <table class="data-table">
        <thead>
            <tr>
                ${headers.map(h => {
        if (!h.sortable) return `<th style="width:${h.width}">${h.label}</th>`;
        const isSorted = sort.column === h.id;
        const icon = isSorted ? (sort.ascending ? ' <i class="fa-solid fa-sort-up"></i>' : ' <i class="fa-solid fa-sort-down"></i>') : '';
        return `<th style="width:${h.width}; cursor:pointer;" onclick="window.handleTransitSort('${h.id}')">
                        ${h.label}${icon}
                    </th>`;
    }).join('')}
            </tr>
        </thead>
        <tbody>
            ${sorted.map(item => `
                <tr class="${item.status === 'available' ? 'item-checked' : ''}">
                    <td class="col-photo" style="padding: 1rem 0.5rem; text-align: center;">${renderImageCellHTML(item)}</td>
                    <td class="font-mono" style="font-weight:600;">${item.part_number || '---'}</td>
                    <td>
                        <div style="font-weight:500;">${item.name || 'Sem nome'}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">
                            <span><i class="fa-solid fa-location-dot" style="font-size:0.7rem;"></i> ${item.location || '-'} ${item.pallet ? ` • ${item.pallet}` : ''} ${item.box ? ` • ${item.box}` : ''}</span>
                        </div>
                    </td>
                    <td style="font-size:0.85rem;">${item.maker || item.brand || '-'}</td>
                    <td style="text-align:center; font-weight:700;">${item.quantity}</td>
                    <td style="font-size:0.8rem; font-weight:500; color:var(--primary-color);">${item.delivery_time || '-'}</td>
                    <td>
                         <div style="font-weight:500; font-size:0.85rem;">${item.order_to || item.supplier || '-'}</div>
                         <div style="font-size:0.7rem; color:var(--text-secondary);">${item.sales_process || ''}</div>
                    </td>
                    <td style="text-align:right;">
                        <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
                            ${item.status === 'available' ? `
                                <div class="check-info" style="display:flex; flex-direction:column; align-items:flex-end;">
                                    <span class="check-user" style="color:#166534;"><i class="fa-solid fa-check"></i> Recebido</span>
                                    <span class="check-date">${item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '-'} • ${item.author || '---'}</span>
                                    ${(state.currentUser?.transit_access === 'write' || state.currentUser?.transit_access?.includes('U')) ? `
                                    <button class="btn-icon" onclick="window.undoTransitArrival(${item.id})" title="Reverter Receção" style="color:#d97706; background:#fff7ed; border:none; padding:2px 6px; border-radius:4px; font-size:0.65rem; font-weight:600; margin-top:4px;">
                                        <i class="fa-solid fa-rotate-left"></i> Reverter
                                    </button>` : ''}
                                </div>
                            ` : ((state.currentUser?.transit_access === 'write' || state.currentUser?.transit_access?.includes('U')) ? `
                                <button class="btn-check-custom" onclick="window.confirmArrival(${item.id})" title="Confirmar Receção">
                                    <i class="fa-solid fa-check"></i>
                                </button>
                                ${(state.currentUser?.transit_access?.includes('D')) ? `
                                <button class="btn-icon" onclick="window.deleteTransitItem(${item.id})" title="Eliminar" style="color:#dc2626;">
                                    <i class="fa-solid fa-trash"></i>
                                </button>` : ''}
                            ` : `<span class="badge badge-warning">A aguardar...</span>`)}
                        </div>
                    </td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    `;
}

async function confirmArrival(id) {
    const item = state.transitProducts.find(p => p.id === id);
    if (!item) return;

    state.currentTransitId = id;
    openEditModal(item);

    // Change modal title to signal confirmation
    document.getElementById('modal-title').innerHTML = `
        <div style="display:flex; flex-direction:column; line-height:1.2;">
            <span style="font-weight:700; color:var(--primary-color);">Confirmar Receção</span>
            <span style="font-size: 0.85rem; font-weight: 500;">${item.name}</span>
        </div>
    `;
    showToast(`Sugestões carregadas para o processo ${item.sales_process} `, 'info');
}

async function deleteTransitItem(id) {
    if (!(state.currentUser?.transit_access === 'write' || state.currentUser?.transit_access?.includes('D'))) return showToast('Sem permissão para apagar itens.', 'error');

    const confirmed = await dialog.confirm({
        title: 'Eliminar Item',
        message: 'Tem a certeza que deseja eliminar este item das chegadas?',
        confirmText: 'Sim, Eliminar',
        type: 'danger'
    });
    if (!confirmed) return;

    try {
        const item = state.transitProducts.find(p => p.id === id);

        if (item) {
            await recordMovement(
                id,
                -item.quantity,
                `Eliminado de Chegadas Stock: ${item.sales_process || 'Sem Processo'}`,
                item.cost_price,
                item.supplier,
                item.sales_process,
                null,
                'OUT'
            );
        }

        const { error } = await supabase.rpc('secure_delete_product', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_id: id
        });

        if (error) throw error;

        showToast('Item removido com sucesso!', 'success');
        fetchTransitItems();
    } catch (err) {
        console.error('Delete Transit error:', err);
        showToast('Erro ao remover: ' + err.message, 'error');
    }
}
async function undoTransitArrival(id) {
    const item = state.transitProducts.find(p => p.id === id);
    if (!item) return;

    const confirmed = await dialog.confirm({
        title: 'Reverter Receção',
        message: `Deseja anular o recebimento de ${item.quantity} unidades e voltar a colocar em trânsito?`,
        confirmText: 'Sim, Reverter',
        type: 'warning'
    });

    if (!confirmed) return;

    try {
        showToast('A reverter...', 'info');

        // Restore status to transit
        const { error: updErr } = await supabase.rpc('secure_save_product', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_data: {
                ...item,
                status: 'transit',
                updated_at: new Date().toISOString()
            }
        });

        if (updErr) throw updErr;

        // Register movement (OUT of available stock)
        await recordMovement(
            id,
            -item.quantity,
            `Reversão de Receção: ${item.sales_process || 'Sem Processo'}`,
            item.cost_price,
            item.supplier,
            item.sales_process,
            null,
            'OUT'
        );

        showToast('Receção revertida com sucesso!', 'success');
        fetchTransitItems();

        // Refresh inventory
        const { fetchProducts } = await import('./data.js');
        await fetchProducts();
    } catch (err) {
        console.error('Undo Transit error:', err);
        showToast('Erro ao reverter: ' + err.message, 'error');
    }
}

async function deleteAllTransitItems(process) {
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
        if (!state.transitProducts || !Array.isArray(state.transitProducts)) {
            showToast('Nenhum item encontrado para apagar.', 'warning');
            return;
        }
        
        const itemsToDelete = state.transitProducts.filter(item => item.sales_process === process);
        
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
        fetchTransitItems();
    } catch (err) {
        console.error('Delete All Transit error:', err);
        showToast('Erro ao apagar itens: ' + err.message, 'error');
    }
}

// Attach to window for dynamic HTML
window.handleTransitSort = handleTransitSort;
window.confirmArrival = confirmArrival;
window.deleteAllTransitItems = deleteAllTransitItems;
window.undoTransitArrival = undoTransitArrival;
window.deleteTransitItem = deleteTransitItem;
window.toggleTransitFolder = toggleTransitFolder;
