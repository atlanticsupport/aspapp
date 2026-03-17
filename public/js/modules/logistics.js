import { state } from './state.js';
import { supabase } from './supabase-client.js';
import { showToast } from './ui.js';
import { views } from './dom.js';
import { processImageForUpload } from './data.js';
import { dialog } from './dialogs.js';

export async function loadLogisticsView() {
    if (!supabase) return;

    views.logistics.innerHTML = `
        <header class="top-bar">
            <div class="view-header" style="margin-bottom: 0;">
                <i class="fa-solid fa-clipboard-list"></i>
                <h2>Gestão de Encomendas (Logística)</h2>
            </div>
            <div class="actions">
                <button class="btn btn-secondary" id="btn-refresh-logistics" title="Atualizar">
                    <i class="fa-solid fa-rotate"></i>
                </button>
                ${(state.currentUser?.logistics_access === 'write' || state.currentUser?.logistics_access?.includes('C')) ? `
                <button class="btn btn-secondary trigger-phc-import" title="Importar Processo PHC">
                    <i class="fa-solid fa-cloud-arrow-down" style="color:#0ea5e9;"></i>
                </button>
                ` : ''}
            </div>
        </header>

        <div class="filter-bar">
            <div class="search-row" style="display:flex; gap:0.5rem; width:100%;">
                <div class="search-container" style="flex:1;">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="text" id="logistics-search" placeholder="Procurar por Processo, PN ou Descrição..." value="${state.logisticsFilterState.search}">
                </div>
                ${(state.currentUser?.logistics_access === 'write' || state.currentUser?.logistics_access?.includes('C')) ? `
                <button class="trigger-phc-import show-mobile" title="Importar Processo PHC" style="border:none; background:none; color:#0ea5e9; font-size:1.1rem; cursor:pointer;">
                    <i class="fa-solid fa-cloud-arrow-down"></i>
                </button>
                ` : ''}
            </div>
            
            <div class="filters-row">
                <div class="filter-group" id="group-logistics-urgency">
                    <span class="filter-label">Todas as Urgências</span>
                    <i class="fa-solid fa-chevron-down" style="font-size: 0.8rem; color: var(--text-secondary);"></i>
                    <div class="filter-dropdown">
                        <div class="dropdown-item selected" data-value="all">Todas</div>
                        <div class="dropdown-item" data-value="0"><svg width="10" height="10" viewBox="0 0 10 10" style="margin-right:8px;"><circle cx="5" cy="5" r="4.5" fill="#ef4444"/></svg> Grau: 0</div>
                        <div class="dropdown-item" data-value="1"><svg width="10" height="10" viewBox="0 0 10 10" style="margin-right:8px;"><circle cx="5" cy="5" r="4.5" fill="#f97316"/></svg> Grau: 1</div>
                        <div class="dropdown-item" data-value="2"><svg width="10" height="10" viewBox="0 0 10 10" style="margin-right:8px;"><circle cx="5" cy="5" r="4.5" fill="#eab308"/></svg> Grau: 2</div>
                    </div>
                </div>

                <div class="filter-group" id="group-logistics-status">
                    <span class="filter-label">Todos os Estados</span>
                    <i class="fa-solid fa-chevron-down" style="font-size: 0.8rem; color: var(--text-secondary);"></i>
                    <div class="filter-dropdown">
                        <div class="dropdown-item selected" data-value="all">Todos os Estados</div>
                        <div class="dropdown-item" data-value="pending">Pendentes</div>
                        <div class="dropdown-item" data-value="received">Conferidos</div>
                        <div class="dropdown-item" data-value="shipped">Enviados</div>
                    </div>
                </div>
            </div>
        </div>

        <div id="logistics-content" class="logistics-grid">
            <div class="loading-state">
                <div class="spinner"></div>
                <p>A carregar encomendas...</p>
            </div>
        </div>

        <!-- Hidden file input for item photos -->
        <input type="file" id="logistics-item-photo" accept="image/*,video/*" capture="environment" style="display:none;" multiple>

        <!-- Shipping Modal -->
        <div class="modal" id="modal-shipping">
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fa-solid fa-truck-fast"></i> Dados de Envio</h2>
                    <button class="btn-icon" onclick="document.getElementById('modal-shipping').classList.remove('open')"><i class="fa-solid fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 1rem; color: var(--text-secondary);">Preencha os dados da expedição para concluir a saída.</p>
                    
                    <div class="form-group">
                        <label>Transportadora / Método</label>
                        <input type="text" id="ship-carrier" placeholder="Ex: CTT, UPS, Levantamento...">
                    </div>

                    <div class="form-group">
                        <label>Dimensões / Observações da Caixa</label>
                        <input type="text" id="ship-dimensions" placeholder="Ex: 30x30x20cm, 2kg">
                    </div>

                    <div class="form-group">
                        <label>Foto da Caixa (Opcional)</label>
                        <div class="photo-upload-area" id="ship-photo-area" onclick="document.getElementById('ship-photo-input').click()">
                            <i class="fa-solid fa-camera"></i>
                            <span>Toque para adicionar foto</span>
                            <img id="ship-photo-preview" style="display:none; width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">
                        </div>
                        <input type="file" id="ship-photo-input" accept="image/*,video/*" capture="environment" style="display:none;" multiple>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="document.getElementById('modal-shipping').classList.remove('open')">Cancelar</button>
                    <button class="btn btn-primary" id="btn-confirm-ship">Confirmar Saída</button>
                </div>
            </div>
        </div>
    `;

    // Bind events
    document.getElementById('btn-refresh-logistics').addEventListener('click', (e) => {
        e.stopPropagation();
        fetchLogisticsItems();
    });


    const searchInput = document.getElementById('logistics-search');
    searchInput.oninput = (e) => {
        state.logisticsFilterState.search = e.target.value;
        renderLogisticsItems();
    };

    // Shipping Modal Events
    const shipPhotoInput = document.getElementById('ship-photo-input');
    const shipPhotoArea = document.getElementById('ship-photo-area');
    const shipPhotoPreview = document.getElementById('ship-photo-preview');
    let currentShipPhotoFile = null;

    if (shipPhotoInput) {
        shipPhotoInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            currentShipPhotoFile = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                shipPhotoPreview.src = e.target.result;
                shipPhotoPreview.style.display = 'block';
                shipPhotoArea.querySelector('span').style.display = 'none';
                shipPhotoArea.querySelector('i').style.display = 'none';
            };
            reader.readAsDataURL(file);
        };
    }

    const confirmBtn = document.getElementById('btn-confirm-ship');
    if (confirmBtn) {
        confirmBtn.onclick = async () => {
            const processName = state.currentShippingProcess;
            if (!processName) return;

            const carrier = document.getElementById('ship-carrier').value;
            const dimensions = document.getElementById('ship-dimensions').value;

            if (!carrier) {
                showToast('Indique a transportadora.', 'warning');
                return;
            }

            try {
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'A processar...';

                // Upload photo if exists
                let publicUrl = null;
                if (currentShipPhotoFile) {
                    const optimized = await processImageForUpload(currentShipPhotoFile);
                    const fileName = `ship_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.webp`;

                    const { error: uploadError } = await supabase.storage
                        .from('product-images')
                        .upload(fileName, optimized);

                    if (uploadError) throw uploadError;

                    const { data } = supabase.storage
                        .from('product-images')
                        .getPublicUrl(fileName);
                    publicUrl = data.publicUrl;
                }

                const shipmentId = `SHIP-${Date.now()}`;

                const { error } = await supabase.rpc('secure_manage_logistics', {
                    p_user: state.currentUser.username,
                    p_pass: state.currentUser.password,
                    p_process: processName,
                    p_action: 'ship',
                    p_data: {
                        shipped_by: state.currentUser?.username || 'Expedição',
                        shipped_at: new Date().toISOString(),
                        shipment_id: shipmentId,
                        carrier: carrier,
                        box_dimensions: dimensions,
                        box_image_url: publicUrl
                    }
                });

                if (error) throw error;

                showToast(`Saída de ${processName} registada!`, 'success');
                document.getElementById('modal-shipping').classList.remove('open');
                fetchLogisticsItems();

            } catch (err) {
                console.error(err);
                showToast('Erro ao registar saída.', 'error');
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Confirmar Saída';
            }
        };
    }

    setupLogisticsFilters();
    await fetchLogisticsItems();
}

function setupLogisticsFilters() {
    const filters = [
        { id: 'group-logistics-status', key: 'status' },
        { id: 'group-logistics-urgency', key: 'urgency' }
    ];

    filters.forEach(f => {
        const group = document.getElementById(f.id);
        if (!group) return;

        // Toggle Dropdown
        group.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = group.querySelector('.filter-dropdown');
            document.querySelectorAll('.filter-dropdown').forEach(d => {
                if (d !== dropdown) d.classList.remove('open');
            });
            dropdown.classList.toggle('open');
        });

        // Handle Items
        group.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = item.dataset.value;
                const dropdown = group.querySelector('.filter-dropdown');
                dropdown.classList.remove('open');

                // Initialize state if needed (though state.js should have it, we ensure safety)
                if (!state.logisticsFilterState) state.logisticsFilterState = {};
                state.logisticsFilterState[f.key] = value;

                // UI Update
                group.querySelector('.filter-label').textContent = item.textContent;
                group.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                group.querySelector('.filter-dropdown').classList.remove('open');

                renderLogisticsItems();
            });
        });

        // Restore Initial State Label
        if (state.logisticsFilterState) {
            const currentVal = state.logisticsFilterState[f.key] || 'all';
            const activeItem = group.querySelector(`.dropdown-item[data-value="${currentVal}"]`);
            if (activeItem) {
                group.querySelector('.filter-label').textContent = activeItem.textContent;
                group.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
                activeItem.classList.add('selected');
            }
        }
    });

    // Global click to close
    document.addEventListener('click', () => {
        document.querySelectorAll('.filter-dropdown').forEach(d => d.classList.remove('open'));
    });
}

export async function fetchLogisticsItems() {
    try {
        const { data, error } = await supabase.rpc('secure_fetch_logistics', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password
        });

        if (error) throw error;

        state.logisticsProducts = data || [];
        renderLogisticsItems();
    } catch (err) {
        console.error('Logistics fetch error:', err);
        showToast('Erro ao carregar encomendas.', 'error');
    }
}

function renderLogisticsItems() {
    const container = document.getElementById('logistics-content');
    if (!container) return;

    let filtered = state.logisticsProducts;
    const search = state.logisticsFilterState.search.toLowerCase();
    const statusFilter = state.logisticsFilterState.status;
    const urgencyFilter = state.logisticsFilterState.urgency;

    // 1. Search Filter
    if (search) {
        filtered = filtered.filter(p =>
            (p.sales_process?.toLowerCase() || '').includes(search) ||
            (p.part_number?.toLowerCase() || '').includes(search) ||
            (p.name?.toLowerCase() || '').includes(search)
        );
    }

    // 2. Status Filter
    if (statusFilter && statusFilter !== 'all') {
        filtered = filtered.filter(p => p.status === statusFilter);
    }

    // 3. Urgency Filter
    if (urgencyFilter && urgencyFilter !== 'all') {
        const uVal = parseInt(urgencyFilter);
        filtered = filtered.filter(p => (p.urgency_level ?? 1) === uVal);
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1; padding: 4rem; text-align: center; color: var(--text-secondary);">
                <i class="fa-solid fa-folder-open" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                <p>Nenhuma encomenda encontrada.</p>
            </div>
        `;
        return;
    }

    // Group by Sales Process (using ALL items to calculate correct status and process urgency)
    const allGroups = {};
    state.logisticsProducts.forEach(item => {
        const proc = item.sales_process || 'Sem Processo';
        if (!allGroups[proc]) allGroups[proc] = [];
        allGroups[proc].push(item);
    });

    const groups = {};
    filtered.forEach(item => {
        const proc = item.sales_process || 'Sem Processo';
        if (!groups[proc]) groups[proc] = [];
        groups[proc].push(item);
    });

    const savedOpenGroups = JSON.parse(localStorage.getItem('aspstock_logistics_open_groups') || '[]');
    const openGroups = new Set(savedOpenGroups);

    const savedOpenShipments = JSON.parse(localStorage.getItem('aspstock_logistics_open_shipments') || '[]');
    const openShipments = new Set(savedOpenShipments);

    container.innerHTML = '';

    Object.keys(groups).forEach(process => {
        const visibleFilterItems = groups[process];
        const allItems = allGroups[process]; // Use full context for process status/urgency

        // Calculate Process Urgency (Min value = Max Urgency)
        // Default to 1 if no items or no urgency set
        const urgencies = allItems.map(i => i.urgency_level ?? 1);
        const maxUrgency = Math.min(...urgencies);

        const urgencyColors = ['#ef4444', '#f97316', '#eab308'];
        const urgencyColor = urgencyColors[maxUrgency] || '#64748b';
        const urgencyDot = `<svg width="10" height="10" viewBox="0 0 10 10" style="margin-right:6px;"><circle cx="5" cy="5" r="4.5" fill="${urgencyColor}"/></svg>`;

        const urgencyBadge = `<span class="urgency-badge level-${maxUrgency}" style="pointer-events: auto !important; position: relative; z-index: 10;" onclick="event.stopPropagation(); window.changeProcessUrgency(event, '${process.replace(/'/g, "\\'")}', ${maxUrgency})" title="Alterar Urgência">${urgencyDot} Grau: ${maxUrgency} <i class="fa-solid fa-chevron-down" style="font-size: 0.6rem; margin-left: 2px;"></i></span>`;

        const countTotal = allItems.length;
        const countReceived = allItems.filter(i => i.status === 'received').length;
        const countShipped = allItems.filter(i => i.status === 'shipped').length;
        const countPending = allItems.filter(i => i.status === 'pending').length;

        const isFullyShipped = countShipped === countTotal;
        const isPartiallyShipped = countShipped > 0 && countShipped < countTotal;
        const hasReceivables = countReceived > 0;

        const activeItems = visibleFilterItems.filter(i => i.status !== 'shipped');
        const shippedItems = visibleFilterItems.filter(i => i.status === 'shipped');

        const shipmentGroups = {};
        shippedItems.forEach(item => {
            const shipId = item.shipment_id || 'legacy';
            if (!shipmentGroups[shipId]) shipmentGroups[shipId] = [];
            shipmentGroups[shipId].push(item);
        });

        const processId = process.replace(/[^a-zA-Z0-9]/g, '-');
        const isExpanded = openGroups.has(processId);

        const folder = document.createElement('div');
        folder.className = `logistics-folder ${isFullyShipped ? 'shipped' : ''} ${isExpanded ? 'expanded' : ''}`;
        folder.id = `folder-${processId}`;

        let actionButtonsHtml = '';

        const canWriteLog = state.currentUser?.logistics_access === 'write' || state.currentUser?.logistics_access?.includes('U');

        if (hasReceivables) {
            actionButtonsHtml = canWriteLog ? `
                ${isPartiallyShipped ? `<span class="badge badge-warning" style="margin-right:8px;">Parcial</span>` : ''}
                <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); window.shipLogisticsOrder('${process}')" title="Dar saída aos itens conferidos">
                    <i class="fa-solid fa-truck-ramp-box"></i> Enviar (${countReceived})
                </button>
            ` : `<span class="badge badge-warning">Conferido (${countReceived})</span>`;
        } else if (isFullyShipped) {
            actionButtonsHtml = `<span class="badge badge-success"><i class="fa-solid fa-check-double"></i> Tudo Enviado</span>`;
        } else if (isPartiallyShipped) {
            actionButtonsHtml = `<span class="badge badge-warning">Parcialmente Enviado</span>`;
        } else {
            actionButtonsHtml = `<span class="badge badge-warning">Pendente</span>`;
        }

        if (canWriteLog || (state.currentUser?.logistics_access?.includes('D'))) {
            actionButtonsHtml += `
                <button class="btn-delete-process" onclick="event.stopPropagation(); window.deleteLogisticsProcess('${process}')" title="Apagar Processo">
                    <i class="fa-solid fa-trash"></i>
                </button>
            `;
        }

        let activeTableHtml = '';
        if (activeItems.length > 0) {
            activeTableHtml = renderItemsTable(activeItems, false);
        }

        let groupsHtml = '';
        Object.keys(shipmentGroups).sort().reverse().forEach(shipId => {
            const groupItems = shipmentGroups[shipId];
            const first = groupItems[0];
            const dateStr = first.shipped_at ? new Date(first.shipped_at).toLocaleString('pt-PT') : 'Data desconhecida';
            const carrier = first.carrier || 'N/D';
            const dims = first.box_dimensions || 'N/D';
            const photoUrl = first.box_image_url;

            // Unique ID for this shipment group
            const shipmentUniqueId = `ship-${shipId}-${processId}`;
            const isShipmentExpanded = openShipments.has(shipmentUniqueId);

            groupsHtml += `
                <div class="shipment-subfolder" id="${shipmentUniqueId}">
                    <div class="shipment-header" onclick="window.toggleShipmentFolder('${shipmentUniqueId}')" style="cursor: pointer;">
                        <div class="ship-info">
                            <i class="fa-solid fa-box-open"></i>
                            <div>
                                <strong>Envio: ${dateStr}</strong>
                                <span class="text-muted" style="font-size:0.85rem; display:block;">Via: ${carrier} • Dim: ${dims} - ${first.shipped_by || 'Expedição'}</span>
                            </div>
                        </div>
                        <div class="ship-actions">
                             <i class="fa-solid fa-chevron-down toggle-icon" style="margin-right: 10px; transform: ${isShipmentExpanded ? 'rotate(180deg)' : 'rotate(0deg)'};"></i>
                             ${photoUrl ? `
                                <img src="${photoUrl}" class="ship-thumb" onclick="event.stopPropagation(); window.viewGenericImage('${photoUrl}')">
                             ` : ''}
                             <button class="btn-icon-small" onclick="event.stopPropagation(); window.undoShipLogisticsOrder('${process}', '${shipId}')" title="Reverter este envio">
                                <i class="fa-solid fa-rotate-left"></i>
                             </button>
                        </div>
                    </div>
                    <div class="shipment-items ${isShipmentExpanded ? 'open' : ''}">
                        ${renderItemsTable(groupItems, true)}
                    </div>
                </div>
            `;
        });

        // ... existing group logic
        const firstItem = visibleFilterItems[0] || {};
        const clientName = firstItem.order_to || '';
        const shipPlant = firstItem.ship_plant || '';
        const orderDate = firstItem.order_date ? new Date(firstItem.order_date).toLocaleDateString('pt-PT') : '';

        // ... existing HTML construction
        folder.innerHTML = `
            <div class="folder-header" onclick="window.toggleLogisticsFolder('${processId}')">
                <div class="folder-info">
                    <i class="fa-solid fa-folder"></i>
                    <div class="folder-text">
                        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
                            <h3 style="margin:0;">${process}</h3>
                            ${clientName ? `<span style="font-size:0.8rem; font-weight:600; color:#1e40af; background:#dbeafe; padding:2px 8px; border-radius:4px;">${clientName}</span>` : ''}
                            ${urgencyBadge}
                        </div>
                        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-top:4px;">
                            ${shipPlant ? `<span style="font-size:0.8rem; color:var(--text-secondary); display:flex; align-items:center; gap:4px;"><i class="fa-solid fa-industry" style="font-size:0.75rem; color:#94a3b8; background:none; padding:0;"></i> ${shipPlant}</span>` : ''}
                            <span style="font-size:0.8rem; color:var(--text-secondary); display:flex; align-items:center; gap:4px;"><i class="fa-solid fa-box" style="font-size:0.75rem; color:#94a3b8; background:none; padding:0;"></i> ${countTotal} itens</span>
                            ${orderDate ? `<span style="font-size:0.8rem; color:var(--text-secondary); display:flex; align-items:center; gap:4px;"><i class="fa-solid fa-calendar" style="font-size:0.75rem; color:#94a3b8; background:none; padding:0;"></i> ${orderDate}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="folder-actions" style="display:flex; align-items:center; gap:12px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${actionButtonsHtml}
                    </div>
                    <i class="fa-solid fa-chevron-down toggle-icon" style="color:#94a3b8; transition: transform 0.2s; ${isExpanded ? 'transform: rotate(180deg);' : ''}"></i>
                </div>
            </div>
            
            <div class="folder-items ${isExpanded ? 'open' : ''}">
                ${activeTableHtml}
                ${groupsHtml}
            </div>
        `;

        container.appendChild(folder);
    });
}

export function handleLogisticsSort(column) {
    const current = state.logisticsSortState;
    if (current.column === column) {
        current.ascending = !current.ascending;
    } else {
        state.logisticsSortState = { column, ascending: true };
    }
    renderLogisticsItems();
}

function renderItemsTable(items, isShipped) {
    const access = state.currentUser?.logistics_access || '';
    const canWriteLog = access === 'write' || access.includes('U');
    const canDeleteLog = access === 'write' || access.includes('D');
    const sort = state.logisticsSortState;

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
        { id: 'part_number', label: 'PN / Ref', width: '15%', sortable: true },
        { id: 'name', label: 'Descrição / Detalhes', width: '35%', sortable: true },
        { id: 'maker', label: 'Maker', width: '10%', sortable: true },
        { id: 'equipment', label: 'Equip.', width: '10%', sortable: true },
        { id: 'quantity', label: 'Qtd', width: '8%', sortable: true, align: 'center' },
        { id: 'status', label: 'Conferência', width: '12%', sortable: true },
        { id: 'actions', label: 'Ações', width: 'auto', sortable: false, align: 'right' }
    ];

    return `
    <table class="data-table" style="${isShipped ? 'background:#f8fafc;' : ''}">
        <thead>
            <tr>
                ${headers.map(h => {
        if (!h.sortable) return `<th style="width:${h.width}; text-align:${h.align || 'left'};">${h.label}</th>`;
        const isSorted = sort.column === h.id;
        const icon = isSorted ? (sort.ascending ? ' <i class="fa-solid fa-sort-up"></i>' : ' <i class="fa-solid fa-sort-down"></i>') : '';
        return `<th style="width:${h.width}; text-align:${h.align || 'left'}; cursor:pointer;" onclick="window.handleLogisticsSort('${h.id}')">
                        ${h.label}${icon}
                    </th>`;
    }).join('')}
            </tr>
        </thead>
        <tbody>
            ${sorted.map(item => `
                <tr class="${item.status !== 'pending' ? 'item-checked' : ''}">
                    <td class="font-mono" style="font-weight:600;">${item.part_number}</td>
                    <td>
                        <div style="font-weight:500;">${item.name}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">
                            ${item.delivery_time ? `<span style="margin-right:8px;"><i class="fa-regular fa-clock"></i> ${item.delivery_time}</span>` : ''}
                            ${item.category ? `<span>${item.category}</span>` : ''}
                        </div>
                    </td>
                    <td style="font-size:0.85rem;">${item.maker || item.brand || '-'}</td>
                    <td style="font-size:0.85rem;">${item.equipment || '-'}</td>
                    <td style="text-align:center; font-weight:600;">${item.quantity}</td>
                    <td>
                        ${item.status === 'pending' ?
            '<span class="text-muted"><i class="fa-regular fa-clock"></i> Aguardando...</span>' :
            `<div class="check-info">
                                <span class="check-user"><i class="fa-solid fa-user-check"></i> ${item.received_by || 'Sistema'}</span>
                                <span class="check-date">${new Date(item.received_at).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                             </div>`
        }
                    </td>
                    <td style="text-align:right;">
                        <!-- Actions as before -->
                        <div style="display:flex; justify-content:flex-end; gap:8px;">
                            ${item.image_url ? `
                                <div style="position: relative; display: inline-block;">
                                    <img src="${item.image_url}" 
                                         onclick="event.stopPropagation(); window.viewGenericImage('${item.image_url}')"
                                         style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px; border: 1px solid #cbd5e1; cursor: pointer;"
                                         title="Ver foto">
                                </div>
                            ` : ''}
                            ${canWriteLog && item.status === 'pending' ? `
                                <button class="btn-check-custom" onclick="window.checkLogisticsItem('${item.id}')" title="Conferir Item">
                                    <i class="fa-solid fa-check"></i>
                                </button>
                            ` : canWriteLog && item.status === 'received' ? `
                                <button class="btn-check-custom checked" onclick="window.undoCheckLogisticsItem('${item.id}')" title="Reverter">
                                    <i class="fa-solid fa-rotate-left"></i>
                                </button>
                            ` : item.status === 'shipped' ? `
                                <i class="fa-solid fa-check-double" style="color:#0f766e; font-size:1.2rem;" title="Enviado"></i>
                            ` : '<i class="fa-solid fa-clock" style="color:#94a3b8;" title="Pendente"></i>'}

                            ${canDeleteLog && item.status !== 'shipped' ? `
                                <button class="btn-icon" onclick="window.deleteLogisticsItem('${item.id}', '${item.part_number}')" title="Eliminar" style="color:#ef4444;">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `).join('')}
        </tbody>
    </table>`;
}

// Global actions shim
export async function checkLogisticsItem(id) {
    const fileInput = document.getElementById('logistics-item-photo');
    if (!fileInput) return;

    // Reset input
    fileInput.value = '';

    // We'll use a listener once to handle the upload after selection
    fileInput.onchange = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        try {
            showToast(`A processar ${files.length} ficheiro(s)...`, 'info');

            for (const file of files) {
                let uploadFile = file;
                let fileType = file.type.startsWith('video/') ? 'video' : 'image';

                if (fileType === 'image') {
                    uploadFile = await import('./data.js').then(m => m.processImageForUpload(file));
                }

                const fileName = `logistics_${id}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.webp`;

                const { error: uploadError } = await supabase.storage
                    .from('product-images')
                    .upload(fileName, uploadFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('product-images')
                    .getPublicUrl(fileName);

                // Use the attachment system for logistics receipts as well
                await supabase.rpc('secure_add_attachment', {
                    p_user: state.currentUser.username,
                    p_pass: state.currentUser.password,
                    p_data: {
                        product_id: parseInt(id),
                        url: publicUrl,
                        file_type: fileType,
                        category: 'reception'
                    }
                });

                // Update main item status
                await supabase.rpc('secure_update_logistics_item', {
                    p_user: state.currentUser.username,
                    p_pass: state.currentUser.password,
                    p_id: parseInt(id),
                    p_data: {
                        status: 'received',
                        image_url: publicUrl, // Keep last one as main preview
                        received_by: state.currentUser?.username || 'Armazém',
                        received_at: new Date().toISOString()
                    }
                });
            }

            showToast('Item(s) conferidos com sucesso!', 'success');
            fetchLogisticsItems();
        } catch (err) {
            console.error(err);
            showToast('Erro ao processar recepção.', 'error');
        }
    };

    // Ask if they want to take a photo or just check
    const confirmed = await dialog.confirm({
        title: 'Conferir Item',
        message: 'Deseja tirar uma foto do material recebido para prova de recepção?',
        confirmText: 'Sim, Tirar Foto',
        cancelText: 'Pular Foto (Só Check)',
        type: 'primary'
    });

    if (confirmed === null) return; // User closed without choosing

    if (confirmed) {
        fileInput.click();
    } else {
        // Just check
        try {
            const { error: updateError } = await supabase.rpc('secure_update_logistics_item', {
                p_user: state.currentUser.username,
                p_pass: state.currentUser.password,
                p_id: id,
                p_data: {
                    status: 'received',
                    received_by: state.currentUser?.username || 'Armazém',
                    received_at: new Date().toISOString()
                }
            });

            if (updateError) throw updateError;
            showToast('Item conferido!', 'success');
            fetchLogisticsItems();
        } catch (err) {
            console.error(err);
            showToast('Erro ao atualizar item.', 'error');
        }
    }
}

export async function undoCheckLogisticsItem(id) {
    const confirmed = await dialog.confirm({
        title: 'Reverter Conferência',
        message: 'Deseja marcar este item como pendente novamente?',
        confirmText: 'Sim, Reverter',
        type: 'warning'
    });

    if (!confirmed) return;

    try {
        const { error } = await supabase.rpc('secure_update_logistics_item', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_id: parseInt(id),
            p_data: {
                status: 'pending',
                received_by: null,
                received_at: null,
                image_url: null
            }
        });

        if (error) throw error;
        showToast('Item revertido para pendente.', 'success');
        fetchLogisticsItems();
    } catch (err) {
        console.error(err);
        showToast('Erro ao reverter item.', 'error');
    }
}

window.shipLogisticsOrder = async (processName) => {
    state.currentShippingProcess = processName;
    const modal = document.getElementById('modal-shipping');

    // Reset form
    document.getElementById('ship-carrier').value = '';
    document.getElementById('ship-dimensions').value = '';
    document.getElementById('ship-photo-preview').style.display = 'none';
    document.getElementById('ship-photo-area').querySelector('span').style.display = 'block';
    document.getElementById('ship-photo-area').querySelector('i').style.display = 'block';

    if (modal) modal.classList.add('open');
};

window.undoShipLogisticsOrder = async (processName, shipmentId) => {
    const msg = shipmentId ?
        'Deseja reverter este envio específico?\nOs itens voltarão ao estado "Recebido".' :
        'Deseja reverter o envio deste processo?';

    const confirmed = await dialog.confirm({
        title: 'Reverter Saída',
        message: msg,
        confirmText: 'Sim, Reverter Envio',
        type: 'warning'
    });

    if (!confirmed) return;

    try {
        const { error } = await supabase.rpc('secure_manage_logistics', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_process: processName,
            p_action: 'undo_ship',
            p_data: {
                shipment_id: (shipmentId === 'legacy' ? null : shipmentId)
            }
        });

        if (error) throw error;

        showToast(`Envio de ${processName} revertido!`, 'success');
        fetchLogisticsItems();
    } catch (err) {
        console.error(err);
        showToast('Erro ao reverter saída.', 'error');
    }
};

window.deleteLogisticsProcess = async (processName) => {
    const confirmed = await dialog.confirm({
        title: 'Apagar Processo',
        message: `Tem a certeza que deseja apagar o processo "${processName}" e todos os seus itens?\nEsta ação é irreversível.`,
        confirmText: 'Sim, Apagar Tudo',
        type: 'danger'
    });

    if (!confirmed) return;

    try {
        const { error } = await supabase.rpc('secure_manage_logistics', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_process: processName,
            p_action: 'delete_process'
        });

        if (error) throw error;

        showToast(`Processo ${processName} apagado com sucesso.`, 'success');
        fetchLogisticsItems();
    } catch (err) {
        console.error(err);
        showToast('Erro ao apagar processo.', 'error');
    }
};

export async function deleteLogisticsItem(id, pn) {
    const confirmed = await dialog.confirm({
        title: 'Apagar Item',
        message: `Tem a certeza que deseja apagar o item "${pn}"?\nEsta ação é irreversível.`,
        confirmText: 'Sim, Apagar',
        type: 'danger'
    });

    if (!confirmed) return;

    try {
        const { error } = await supabase.rpc('secure_manage_logistics', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_process: '',
            p_action: 'delete_item',
            p_data: { id: id }
        });

        if (error) throw error;

        showToast(`Item ${pn} apagado com sucesso.`, 'success');
        fetchLogisticsItems();
    } catch (err) {
        console.error(err);
        showToast('Erro ao apagar item.', 'error');
    }
}

export async function changeProcessUrgency(event, processName, currentLevel) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    const access = state.currentUser?.logistics_access || '';
    const canUpdateUrgency = state.currentUser?.role === 'admin' || access === 'write' || access.includes('U');

    if (!canUpdateUrgency) {
        showToast('Acesso negado para modificar urgência.', 'error');
        return;
    }

    // Remove any existing dropdowns
    document.querySelectorAll('.urgency-dropdown').forEach(el => el.remove());

    const targetBadge = event.currentTarget || event.target;
    const rect = targetBadge.getBoundingClientRect();

    const dropdown = document.createElement('div');
    dropdown.className = 'urgency-dropdown';
    dropdown.style.top = `${rect.bottom + window.scrollY + 8}px`;
    dropdown.style.left = `${rect.left + window.scrollX}px`;

    const choices = [
        { value: 0, label: 'Grau: 0 (Crítico)', color: '#ef4444' },
        { value: 1, label: 'Grau: 1 (Alta)', color: '#f97316' },
        { value: 2, label: 'Grau: 2 (Média)', color: '#eab308' }
    ];

    let itemsHtml = '';
    choices.forEach(c => {
        const isSelected = c.value === currentLevel;
        const dot = `<svg width="10" height="10" viewBox="0 0 10 10" style="margin-right:8px;"><circle cx="5" cy="5" r="4.5" fill="${c.color}"/></svg>`;
        itemsHtml += `<div class="urgency-item ${isSelected ? 'selected' : ''}" data-value="${c.value}">
            ${dot} ${c.label} ${isSelected ? '<i class="fa-solid fa-check" style="margin-left:auto; color:var(--primary-color);"></i>' : ''}
        </div>`;
    });

    dropdown.innerHTML = itemsHtml;
    document.body.appendChild(dropdown);

    // Fade in animation
    requestAnimationFrame(() => dropdown.classList.add('visible'));

    // Handle selection
    const handleSelect = async (e) => {
        const item = e.target.closest('.urgency-item');
        if (!item) return;

        const newLevel = parseInt(item.dataset.value);
        closeDropdown();

        if (newLevel === currentLevel) return;

        try {
            const { error } = await supabase.rpc('secure_manage_logistics', {
                p_user: state.currentUser.username,
                p_pass: state.currentUser.password,
                p_process: processName,
                p_action: 'update_urgency',
                p_data: { urgency_level: newLevel }
            });

            if (error) throw error;

            showToast(`Urgência do processo ${processName} atualizada!`, 'success');
            fetchLogisticsItems();
        } catch (err) {
            console.error(err);
            showToast('Erro ao atualizar urgência.', 'error');
        }
    };

    dropdown.addEventListener('click', handleSelect);

    // Handle outside click to close
    const closeDropdown = () => {
        dropdown.classList.remove('visible');
        setTimeout(() => dropdown.remove(), 200);
        document.removeEventListener('click', closeDropdownOutside);
    };

    const closeDropdownOutside = (e) => {
        if (!dropdown.contains(e.target) && e.target !== targetBadge) {
            closeDropdown();
        }
    };

    // Delay adding the outside listener so the current click doesn't trigger it
    setTimeout(() => {
        document.addEventListener('click', closeDropdownOutside);
    }, 10);
}

export function toggleLogisticsFolder(processId) {
    const folder = document.getElementById(`folder-${processId}`);
    if (!folder) return;

    const isExpanded = folder.classList.toggle('expanded');
    const itemsPanel = folder.querySelector('.folder-items');
    if (itemsPanel) {
        // The CSS uses .expanded .folder-items to show, but we might want the .open class too for consistency
        itemsPanel.classList.toggle('open', isExpanded);
    }

    // Rotate of chevron is handled by CSS on .expanded .toggle-icon

    // Persist
    const openGroups = JSON.parse(localStorage.getItem('aspstock_logistics_open_groups') || '[]');
    if (isExpanded) {
        if (!openGroups.includes(processId)) openGroups.push(processId);
    } else {
        const idx = openGroups.indexOf(processId);
        if (idx > -1) openGroups.splice(idx, 1);
    }
    localStorage.setItem('aspstock_logistics_open_groups', JSON.stringify(openGroups));
}

export function toggleShipmentFolder(shipmentId) {
    const el = document.getElementById(shipmentId);
    if (!el) return;

    const items = el.querySelector('.shipment-items');
    const chevron = el.querySelector('.toggle-icon');

    if (!items) return;

    const isOpen = items.classList.toggle('open');
    if (chevron) {
        chevron.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    }

    // Persist
    const openShipments = JSON.parse(localStorage.getItem('aspstock_logistics_open_shipments') || '[]');
    if (isOpen) {
        if (!openShipments.includes(shipmentId)) openShipments.push(shipmentId);
    } else {
        const idx = openShipments.indexOf(shipmentId);
        if (idx > -1) openShipments.splice(idx, 1);
    }
    localStorage.setItem('aspstock_logistics_open_shipments', JSON.stringify(openShipments));
}
// Attach to window for dynamic HTML onclicks
window.handleLogisticsSort = handleLogisticsSort;
window.toggleLogisticsFolder = toggleLogisticsFolder;
window.toggleShipmentFolder = toggleShipmentFolder;
window.checkLogisticsItem = checkLogisticsItem;
window.undoCheckLogisticsItem = undoCheckLogisticsItem;
window.deleteLogisticsItem = deleteLogisticsItem;
window.changeProcessUrgency = changeProcessUrgency;
