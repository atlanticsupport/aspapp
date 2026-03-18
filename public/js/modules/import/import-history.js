import { supabase } from '../supabase-client.js';
import { state } from '../core/state.js';
import { showToast, showGlobalLoading, hideGlobalLoading } from '../core/ui.js';
import { dialog } from '../dialogs.js';
import {
    fetchBatchImports,
    fetchBatchDetails,
    getBatchReferenceLabel,
    renderBatchDetailsTable
} from './batch-imports.js';

export async function loadImportHistory() {
    try {
        const imports = await fetchBatchImports({ limit: 100, offset: 0 });
        renderImportHistory(imports);
        return imports;
    } catch (error) {
        console.error('Error loading import history:', error);
        showToast('Erro ao carregar historico de importacoes', 'error');
        return [];
    }
}

export function renderImportHistory(imports) {
    const container = document.getElementById('import-history-container');
    if (!container) return;

    if (!imports || imports.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-file-import"></i>
                <h3>Nenhuma importacao encontrada</h3>
                <p>Ainda nao foram registadas importacoes em lote de Excel ou processos.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="import-list" style="display:grid; gap:1rem;">
            ${imports.map(renderImportCard).join('')}
        </div>
    `;
}

function renderImportCard(batch) {
    const dateLabel = batch.createdAt.toLocaleString('pt-PT');
    const statusBadge = batch.isReverted
        ? '<span class="status-badge info"><i class="fa-solid fa-rotate-left"></i> Anulada</span>'
        : '<span class="status-badge success"><i class="fa-solid fa-layer-group"></i> Ativa</span>';

    return `
        <div class="import-item" data-batch-id="${batch.batchId}" style="border:1px solid #e2e8f0; border-radius:16px; background:#fff; overflow:hidden;">
            <div class="import-header" style="padding:1rem 1.25rem; border-bottom:1px solid #f1f5f9;">
                <div class="import-info">
                    <h4 style="margin:0 0 0.35rem; font-size:1rem;">${batch.title}</h4>
                    <div class="import-meta" style="display:flex; flex-wrap:wrap; gap:0.5rem 1rem; font-size:0.82rem; color:#64748b;">
                        <span>${batch.sourceLabel}</span>
                        <span>${batch.destinationLabel}</span>
                        <span>${getBatchReferenceLabel(batch)}</span>
                        <span>${dateLabel}</span>
                    </div>
                </div>
                <div class="import-status">${statusBadge}</div>
            </div>

            <div class="import-stats" style="display:flex; flex-wrap:wrap; gap:1rem; padding:1rem 1.25rem 0.5rem;">
                <div class="stat">
                    <i class="fa-solid fa-boxes-stacked"></i>
                    <span>Itens: <strong>${batch.count || 0}</strong></span>
                </div>
                <div class="stat">
                    <i class="fa-solid fa-user"></i>
                    <span>Autor: <strong>${batch.author}</strong></span>
                </div>
                <div class="stat">
                    <i class="fa-solid fa-hashtag"></i>
                    <span>Lote: <strong>${batch.batchId || '-'}</strong></span>
                </div>
            </div>

            <div class="import-summary" style="padding:0 1.25rem 1rem; color:#475569; font-size:0.88rem;">
                ${batch.summary}
                ${batch.isReverted && batch.revertedAt ? `
                    <div style="margin-top:0.5rem; font-size:0.76rem; color:#94a3b8;">
                        Anulada por ${batch.revertedBy || '-'} em ${new Date(batch.revertedAt).toLocaleString('pt-PT')}
                    </div>
                ` : ''}
            </div>

            <div class="import-actions" style="display:flex; gap:0.75rem; padding:0 1.25rem 1rem;">
                <button class="btn-secondary" onclick="window.viewImportDetails('${batch.batchId}')">
                    <i class="fa-solid fa-eye"></i> Ver itens
                </button>
                ${batch.isReverted ? '' : `
                    <button class="btn-danger" onclick="window.revertImport('${batch.batchId}', ${batch.count || 0})">
                        <i class="fa-solid fa-rotate-left"></i> Anular importacao
                    </button>
                `}
            </div>

            <div id="import-batch-details-${batch.batchId}" style="display:none; padding:0 1.25rem 1.25rem;">
                <div id="import-batch-details-content-${batch.batchId}" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:1rem;">
                    <div style="font-weight:700; font-size:0.8rem; color:#475569;">A carregar itens do lote...</div>
                </div>
            </div>
        </div>
    `;
}

export async function viewImportDetails(batchId) {
    const wrapper = document.getElementById(`import-batch-details-${batchId}`);
    const content = document.getElementById(`import-batch-details-content-${batchId}`);
    if (!wrapper || !content) return;

    if (wrapper.style.display === 'none') {
        wrapper.style.display = 'block';

        try {
            const items = await fetchBatchDetails(batchId);
            content.innerHTML = `
                <div style="font-weight:700; font-size:0.82rem; color:#475569; margin-bottom:0.75rem;">Itens da importacao</div>
                ${renderBatchDetailsTable(items)}
            `;
        } catch (error) {
            console.error('Error loading import details:', error);
            content.innerHTML = '<p style="color:#dc2626;">Erro ao carregar detalhes da importacao.</p>';
        }
    } else {
        wrapper.style.display = 'none';
    }
}

export async function revertImport(batchId, itemCount = 0) {
    const confirmed = await dialog.confirm({
        title: 'Anular importacao completa',
        message: `Deseja anular esta importacao por completo? Serão revertidos ${itemCount} itens do lote.`,
        confirmText: 'Sim, anular tudo',
        type: 'danger'
    });

    if (!confirmed) return;

    showGlobalLoading('A anular importacao...');

    try {
        const { error } = await supabase.rpc('secure_revert_batch', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_batch_id: batchId
        });

        if (error) throw error;

        await supabase.rpc('secure_mark_event_reverted', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_batch_id: batchId
        });

        showToast('Importacao anulada com sucesso.', 'success');
        await loadImportHistory();
    } catch (error) {
        console.error('Error reverting import:', error);
        showToast(`Erro ao anular importacao: ${error.message}`, 'error');
    } finally {
        hideGlobalLoading();
    }
}

export const reverseImport = revertImport;

window.loadImportHistory = loadImportHistory;
window.viewImportDetails = viewImportDetails;
window.revertImport = revertImport;
window.reverseImport = revertImport;
window.importHistory = {
    loadImportHistory,
    refresh: loadImportHistory,
    viewImportDetails,
    revertImport
};
