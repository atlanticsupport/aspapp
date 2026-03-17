import { state } from './state.js';
import { supabase } from './supabase-client.js';
import { showToast, renderPagination, showGlobalLoading, hideGlobalLoading } from './ui.js';
import { views } from './dom.js';
import { dialog } from './dialogs.js';

export async function fetchHistory() {
    if (!supabase || !state.currentUser) return [];

    const limit = 50;
    const offset = Math.max(0, state.historyPage || 0) * limit;

    try {
        const { data, error } = await supabase.rpc('secure_fetch_app_events', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_limit: limit,
            p_offset: offset
        });

        if (error) throw error;

        const movements = (data || []).map(ev => {
            let details = {};
            try { details = typeof ev.details === 'string' ? JSON.parse(ev.details) : ev.details; } catch (e) { }

            const isBatch = ev.event_type === 'BATCH_IMPORT';

            // Map event type to UI type badges
            let uiType = 'UPDATE';
            if (isBatch) uiType = 'BATCH';
            else if (ev.event_type === 'STOCK_ADJUST') uiType = 'OUT'; // Use colors for visual help
            else if (ev.event_type === 'PRODUCT_DELETE') uiType = 'DELETE';
            else if (ev.event_type === 'PRODUCT_CREATE') uiType = 'IN';

            return {
                id: ev.id,
                is_batch: isBatch,
                batch_id: ev.target_id,
                type: uiType,
                event_type: ev.event_type,
                date: new Date(ev.created_at),
                author: ev.user_name,
                title: ev.title,
                summary: ev.summary,
                details: ev.summary,
                is_reverted: !!ev.reverted_at,
                revertido_por: ev.reverted_by,
                revertido_em: ev.reverted_at,
                raw_details: details,
                target_id: ev.target_id
            };
        });

        state.historyMovements = movements;
        // Simple approximation for pagination
        state.totalHistoryCount = (state.historyPage * limit) + movements.length + (movements.length === limit ? limit : 0);

        return movements;
    } catch (err) {
        showToast('Erro ao carregar histórico: ' + err.message, 'error');
        return [];
    }
}

export async function loadHistory(options = {}) {
    if (options.refresh) state.historyPage = 0;

    views.history.innerHTML = `
        <header class="top-bar">
            <div class="view-header" style="margin-bottom:0;">
                <i class="fa-solid fa-clock-rotate-left"></i>
                <h2>Histórico de Atividade</h2>
            </div>
            <div class="actions">
                <button class="btn btn-secondary" onclick="window.loadHistory({refresh:true})">
                    <i class="fa-solid fa-rotate"></i>
                </button>
            </div>
        </header>

        <div class="loading-state">
            <div class="spinner"></div>
            <p>A carregar atividades recentes...</p>
        </div>
    `;

    const movements = await fetchHistory();
    renderHistory(movements);
}

function renderHistory(movements) {
    const search = (state.historyFilterState?.search || '').toLowerCase();

    const filtered = movements.filter(m => {
        if (!search) return true;
        return m.title.toLowerCase().includes(search) ||
            m.author.toLowerCase().includes(search) ||
            m.summary.toLowerCase().includes(search) ||
            (m.batch_id && m.batch_id.toLowerCase().includes(search));
    });

    const html = `
        <header class="top-bar">
            <div class="view-header" style="margin-bottom:0;">
                <i class="fa-solid fa-clock-rotate-left"></i>
                <h2>Histórico de Atividade</h2>
            </div>
            <div class="actions">
                <button class="btn btn-secondary" onclick="window.loadHistory({refresh:true})">
                    <i class="fa-solid fa-rotate"></i>
                </button>
            </div>
        </header>

        <div class="filter-bar">
            <div class="search-container" style="flex:1;">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="history-search-input" placeholder="Pesquisar por ação, utilizador ou lote..." value="${state.historyFilterState?.search || ''}">
            </div>
        </div>

        <div class="inventory-container" style="padding: 1rem;">
            <div class="table-wrapper" style="max-height: calc(100vh - 270px); overflow-y: auto; position: relative;">
                <table class="data-table">
                    <thead style="position: sticky; top: 0; z-index: 10; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                        <tr>
                            <th style="width:140px;">Data / Hora</th>
                            <th style="width:120px;">Utilizador</th>
                            <th style="width:100px;">Tipo</th>
                            <th>Ação / Referência</th>
                            <th style="width:100px; text-align:center;">Qtd/Info</th>
                            <th>Detalhes do Evento</th>
                            <th style="text-align:right; width:120px;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.length === 0 ? '<tr><td colspan="7" style="text-align:center; padding:3rem; color:var(--text-secondary);">Nenhum registo encontrado.</td></tr>' : ''}
                        ${filtered.map(m => renderHistoryRow(m)).join('')}
                    </tbody>
                </table>
            </div>
            
            <div style="margin-top: 1.5rem;">
                ${renderPagination(state.historyPage, state.totalHistoryCount, 'window.historyPrev()', 'window.historyNext()', 50)}
            </div>
        </div>
    `;

    views.history.innerHTML = html;

    const input = document.getElementById('history-search-input');
    if (input) {
        input.oninput = (e) => {
            state.historyFilterState.search = e.target.value;
            renderHistory(movements);
        };
    }
}

function renderHistoryRow(m) {
    const dateStr = m.date.toLocaleDateString('pt-PT');
    const timeStr = m.date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    const isReverted = m.is_reverted;

    let typeBadge = '';
    const badgeStyle = "padding: 4px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; display: inline-flex; align-items: center; gap: 4px;";

    if (isReverted) {
        typeBadge = `<span style="${badgeStyle} background: #e2e8f0; color: #64748b;"><i class="fa-solid fa-rotate-left"></i> Anulado</span>`;
    } else {
        switch (m.type) {
            case 'IN': typeBadge = `<span style="${badgeStyle} background: #f0fdf4; color: #166534;"><i class="fa-solid fa-arrow-down"></i> Entrada</span>`; break;
            case 'OUT': typeBadge = `<span style="${badgeStyle} background: #fef2f2; color: #991b1b;"><i class="fa-solid fa-arrow-up"></i> Saída</span>`; break;
            case 'BATCH': typeBadge = `<span style="${badgeStyle} background: #f0f9ff; color: #0369a1;"><i class="fa-solid fa-layer-group"></i> Lote</span>`; break;
            case 'DELETE': typeBadge = `<span style="${badgeStyle} background: #fef2f2; color: #dc2626;"><i class="fa-solid fa-trash"></i> Apagado</span>`; break;
            default: typeBadge = `<span style="${badgeStyle} background: #f8fafc; color: #475569;"><i class="fa-solid fa-pen"></i> Edição</span>`;
        }
    }

    const rowStyle = isReverted ? 'opacity: 0.6; background: #f8fafc;' : '';

    if (m.is_batch) {
        const itemCount = m.raw_details?.count || m.summary.split(' ')[0] || '?';
        return `
            <tr style="${rowStyle}">
                <td><div style="font-weight:600;">${dateStr}</div><div style="font-size:0.75rem; color:var(--text-secondary);">${timeStr}</div></td>
                <td><span class="badge-po">${m.author}</span></td>
                <td>${typeBadge}</td>
                <td onclick="window.toggleHistoryBatch('${m.batch_id}')" style="cursor:pointer;">
                    <div style="font-weight:700; color:var(--primary-color);">${m.title}</div>
                    <div style="font-size:0.75rem; color:#64748b;">ID: ${m.batch_id || 'N/A'} <i class="fa-solid fa-chevron-down" style="font-size:0.6rem; margin-left:4px;"></i></div>
                </td>
                <td style="text-align:center; font-weight:700;">${itemCount}</td>
                <td><div style="font-size:0.85rem; color:var(--text-secondary);">${m.summary}</div></td>
                <td style="text-align:right;">
                    ${isReverted ? renderReversionInfo(m) : `
                        <button class="btn btn-secondary btn-sm" onclick="window.revertBatch('${m.batch_id}')" title="Reverter Lote">
                            <i class="fa-solid fa-rotate-left"></i> Reverter
                        </button>
                    `}
                </td>
            </tr>
            <tr id="batch-items-${m.batch_id}" style="display:none; background:#fff;">
                <td colspan="7" style="padding: 1rem 1rem 1.5rem 3rem; border-left: 4px solid var(--primary-color);">
                    <div id="batch-content-${m.batch_id}" style="background:#f8fafc; border-radius:8px; padding:1rem; border:1px solid #e2e8f0;">
                         <div style="font-weight:700; font-size:0.8rem; margin-bottom:0.5rem; color:#475569;">A carregar itens do lote...</div>
                    </div>
                </td>
            </tr>
        `;
    }

    return `
        <tr style="${rowStyle}">
            <td><div style="font-weight:600;">${dateStr}</div><div style="font-size:0.75rem; color:var(--text-secondary);">${timeStr}</div></td>
            <td><span class="badge-po">${m.author}</span></td>
            <td>${typeBadge}</td>
            <td>
                <div style="font-weight:600;">${m.title}</div>
                <div style="font-size:0.75rem; color:var(--text-secondary); font-family:monospace;">ID: ${m.target_id || '-'}</div>
            </td>
            <td style="text-align:center; font-weight:700; color:inherit">
                -
            </td>
            <td><div style="font-size:0.85rem; color: #475569;">${m.summary}</div></td>
            <td style="text-align:right;">
                ${isReverted ? renderReversionInfo(m) : `
                    <button class="btn btn-icon" onclick="window.revertMovement('${m.id}')" title="Anular Ação" style="background:#f1f5f9; color:#475569;">
                        <i class="fa-solid fa-rotate-left"></i>
                    </button>
                `}
            </td>
        </tr>
    `;
}

function renderReversionInfo(m) {
    const revDate = m.reverted_at || m.revertido_em;
    return `
        <div style="font-size:0.65rem; color:#94a3b8; text-align:right; line-height:1.2;">
            <b>Anulado por:</b><br>${m.revertido_por || 'N/A'}<br>
            ${revDate ? new Date(revDate).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
        </div>
    `;
}

export async function revertMovement(eventId) {
    const confirmed = await dialog.confirm({
        title: 'Anular Operação',
        message: 'Deseja anular esta ação? O sistema tentará restaurar o estado anterior com base nos logs de auditoria.',
        confirmText: 'Anular agora',
        type: 'warning'
    });
    if (!confirmed) return;

    showGlobalLoading('A processar reversão...');
    try {
        const { data, error } = await supabase.rpc('secure_revert_audit', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_audit_id: eventId // Uses shared ID
        });

        if (error) throw error;

        // Also mark as reverted in app_events
        await supabase.rpc('secure_mark_event_reverted', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_event_id: eventId
        });

        showToast('Operação anulada com sucesso!', 'success');
        loadHistory();
        const { loadInventory } = await import('./inventory.js');
        loadInventory({ forceFetch: true });
    } catch (err) {
        showToast('Erro ao reverter: ' + err.message, 'error');
    } finally {
        hideGlobalLoading();
    }
}

export async function revertBatch(batchId) {
    const confirmed = await dialog.confirm({
        title: 'Reverter Importação Completa',
        message: `Deseja anular TODOS os itens desta importação? O stock será restaurado para o estado anterior.`,
        confirmText: 'Sim, anular tudo',
        type: 'danger'
    });

    if (!confirmed) return;

    showGlobalLoading('A processar reversão em massa...');
    try {
        const { data, error } = await supabase.rpc('secure_revert_batch', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_batch_id: batchId
        });

        if (error) throw error;

        // Mark all related events as reverted
        await supabase.rpc('secure_mark_event_reverted', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_batch_id: batchId
        });

        loadHistory();
        const { loadInventory } = await import('./inventory.js');
        loadInventory({ forceFetch: true });

        showToast(`Sucesso: Importação anulada.`, 'success');

    } catch (err) {
        showToast('Erro ao reverter lote: ' + err.message, 'error');
    } finally {
        hideGlobalLoading();
    }
}

export async function toggleHistoryBatch(batchId) {
    const el = document.getElementById(`batch-items-${batchId}`);
    if (!el) return;

    if (el.style.display === 'none') {
        el.style.display = 'table-row';
        const content = document.getElementById(`batch-content-${batchId}`);

        // Fetch items from products table belonging to this batch
        try {
            const { data, error } = await supabase.rpc('secure_fetch_inventory', {
                p_user: state.currentUser.username,
                p_pass: state.currentUser.password,
                p_search: batchId,
                p_category: 'all',
                p_location: 'all'
            });

            if (error) throw error;

            if (!data || data.length === 0) {
                content.innerHTML = '<p style="font-size:0.8rem; color:#94a3b8;">Itens não encontrados ou já removidos.</p>';
            } else {
                content.innerHTML = `
                    <div style="font-weight:700; font-size:0.8rem; margin-bottom:0.5rem; color:#475569;">ITENS DO LOTE:</div>
                    <table style="width:100%; font-size:0.75rem;">
                        <thead><tr style="text-align:left; color:#94a3b8;"><th>Produto</th><th>PN</th><th>Qtd</th></tr></thead>
                        <tbody>
                            ${data.slice(0, 15).map(i => `<tr><td>${i.name}</td><td class="font-mono">${i.part_number}</td><td>${i.quantity}</td></tr>`).join('')}
                            ${data.length > 15 ? `<tr><td colspan="3" style="color:var(--primary-color); padding-top:4px;">... e mais ${data.length - 15} itens.</td></tr>` : ''}
                        </tbody>
                    </table>
                `;
            }
        } catch (e) {
            content.innerHTML = '<p style="color:red;">Erro ao carregar detalhes.</p>';
        }

        const icon = el.previousElementSibling.querySelector('.fa-chevron-down');
        if (icon) icon.className = 'fa-solid fa-chevron-up';
    } else {
        el.style.display = 'none';
        const icon = el.previousElementSibling.querySelector('.fa-chevron-up');
        if (icon) icon.className = 'fa-solid fa-chevron-down';
    }
}

export async function historyNext() {
    state.historyPage++;
    await loadHistory();
}

export async function historyPrev() {
    if (state.historyPage > 0) {
        state.historyPage--;
        await loadHistory();
    }
}

// Global exposure
window.loadHistory = loadHistory;
window.historyNext = historyNext;
window.historyPrev = historyPrev;
window.revertMovement = revertMovement;
window.revertBatch = revertBatch;
window.toggleHistoryBatch = toggleHistoryBatch;
