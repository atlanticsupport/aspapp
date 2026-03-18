import { supabase } from '../supabase-client.js';
import { state } from '../core/state.js';

const DESTINATION_LABELS = {
    products: 'Inventario',
    logistics_items: 'Encomendas / Chegadas'
};

const SOURCE_LABELS = {
    excel_manual: 'Excel Manual',
    phc_process: 'Processo PHC',
    manual: 'Importacao Manual'
};

function safeJsonParse(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;

    try {
        return JSON.parse(value);
    } catch (error) {
        return {};
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function inferSourceLabel(title, details) {
    if (details?.source_label) return details.source_label;
    if (details?.source && SOURCE_LABELS[details.source]) return SOURCE_LABELS[details.source];
    if ((title || '').toLowerCase().includes('excel')) return 'Excel Manual';
    if ((title || '').toLowerCase().includes('phc')) return 'Processo PHC';
    return 'Importacao Manual';
}

function inferSourceKey(title, details) {
    if (details?.source) return details.source;
    if ((title || '').toLowerCase().includes('excel')) return 'excel_manual';
    if ((title || '').toLowerCase().includes('phc')) return 'phc_process';
    return 'manual';
}

function inferDestinationLabel(details) {
    if (details?.destination_label) return details.destination_label;
    if (details?.table && DESTINATION_LABELS[details.table]) return DESTINATION_LABELS[details.table];
    return 'Importacao';
}

function extractCount(summary, details) {
    if (Number.isFinite(Number(details?.count))) return Number(details.count);

    const match = String(summary || '').match(/(\d+)/);
    return match ? Number(match[1]) : 0;
}

export function normalizeBatchEvent(eventRow) {
    const details = safeJsonParse(eventRow.details);

    return {
        id: eventRow.id,
        batchId: eventRow.target_id,
        title: eventRow.title || 'Importacao em lote',
        summary: eventRow.summary || '',
        author: eventRow.user_name || '-',
        createdAt: new Date(eventRow.created_at),
        count: extractCount(eventRow.summary, details),
        source: inferSourceKey(eventRow.title, details),
        sourceLabel: inferSourceLabel(eventRow.title, details),
        destinationLabel: inferDestinationLabel(details),
        table: details.table || null,
        process: details.process || details.sales_process || null,
        fileName: details.file_name || null,
        sample: details.sample || null,
        rawDetails: details,
        isReverted: !!eventRow.reverted_at,
        revertedAt: eventRow.reverted_at,
        revertedBy: eventRow.reverted_by
    };
}

export function getBatchReferenceLabel(batch) {
    if (batch.process) return `Processo: ${batch.process}`;
    if (batch.fileName) return `Ficheiro: ${batch.fileName}`;
    return `Lote: ${batch.batchId || '-'}`;
}

export function getBatchMetaLine(batch) {
    return [
        batch.sourceLabel,
        batch.destinationLabel,
        batch.process ? `Processo ${batch.process}` : null,
        batch.fileName ? batch.fileName : null
    ].filter(Boolean).join(' • ');
}

export async function fetchBatchImports(options = {}) {
    const limit = options.limit || 100;
    const offset = options.offset || 0;

    const { data, error } = await supabase.rpc('secure_fetch_app_events', {
        p_user: state.currentUser.username,
        p_pass: state.currentUser.password,
        p_limit: limit,
        p_offset: offset,
        p_event_type: 'BATCH_IMPORT'
    });

    if (error) throw error;

    return (data || []).map(normalizeBatchEvent);
}

export async function fetchBatchDetails(batchId) {
    const { data, error } = await supabase.rpc('secure_fetch_batch_details', {
        p_user: state.currentUser.username,
        p_pass: state.currentUser.password,
        p_batch_id: batchId
    });

    if (error) throw error;
    return data || [];
}

export function renderBatchDetailsTable(items, options = {}) {
    const emptyMessage = options.emptyMessage || 'Nenhum item encontrado neste lote.';

    if (!items || items.length === 0) {
        return `<p style="font-size:0.8rem; color:#94a3b8;">${escapeHtml(emptyMessage)}</p>`;
    }

    return `
        <table style="width:100%; font-size:0.78rem; border-collapse:collapse;">
            <thead>
                <tr style="text-align:left; color:#64748b;">
                    <th style="padding:0 0 8px;">Tabela</th>
                    <th style="padding:0 0 8px;">Designacao</th>
                    <th style="padding:0 0 8px;">Referencia</th>
                    <th style="padding:0 0 8px; text-align:center;">Qtd</th>
                    <th style="padding:0 0 8px;">Estado</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        <td style="padding:6px 0; border-top:1px solid #e2e8f0;">${escapeHtml(item.table_label || item.table_name || '-')}</td>
                        <td style="padding:6px 0; border-top:1px solid #e2e8f0; font-weight:600;">${escapeHtml(item.name || item.description || 'Sem designacao')}</td>
                        <td style="padding:6px 0; border-top:1px solid #e2e8f0; font-family:monospace;">${escapeHtml(item.part_number || '-')}</td>
                        <td style="padding:6px 0; border-top:1px solid #e2e8f0; text-align:center;">${escapeHtml(item.quantity ?? '-')}</td>
                        <td style="padding:6px 0; border-top:1px solid #e2e8f0;">${escapeHtml(item.status || '-')}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}
