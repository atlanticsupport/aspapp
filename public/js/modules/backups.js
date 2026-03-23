import { state } from './state.js';
import { supabase } from './supabase-client.js';
import { showToast, formatCurrency } from './ui.js';
import { views } from './dom.js';

let isLoaded = false;

export async function loadBackupsView() {
    if (state.currentUser?.role !== 'admin') {
        showToast('Acesso reservado a administradores.', 'error');
        return;
    }

    if (!isLoaded) {
        views.backups.innerHTML = `
            <div class="content-header" style="margin-bottom: 1.5rem;">
                <h2><i class="fa-solid fa-cloud-arrow-up" style="color:var(--primary); margin-right:8px;"></i> Gestão de Backups R2</h2>
                <div class="actions">
                    <button id="btn-trigger-backup" class="btn btn-primary" title="Efetuar Backup Manual Agora">
                        <i class="fa-solid fa-download"></i> Gerar Snapshot
                    </button>
                    <button class="btn btn-secondary" onclick="window.fetchAndRenderBackups()" title="Refrescar">
                        <i class="fa-solid fa-rotate-right"></i>
                    </button>
                </div>
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Datação / Nome do Ficheiro</th>
                            <th>Tamanho Extraído (Bytes)</th>
                            <th style="text-align:right;">Ações de Controlo</th>
                        </tr>
                    </thead>
                    <tbody id="backups-tbody">
                        <tr><td colspan="3" style="text-align:center; padding: 2rem;">A carregar manifestos de segurança...</td></tr>
                    </tbody>
                </table>
            </div>
        `;

        const btnTrigger = document.getElementById('btn-trigger-backup');
        if (btnTrigger) {
            btnTrigger.addEventListener('click', async () => {
                if (!confirm('Deseja dar a ordem para o Roteador extrair a Base de Dados instantaneamente? O processo vai pesar alguns MBs no R2.')) return;
                try {
                    btnTrigger.disabled = true;
                    btnTrigger.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> A clonar Bunker...';

                    const res = await fetch('/api/manage_backups', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            rpc: 'trigger_backup',
                            p_token: state.currentUser.token,
                            p_admin_user: state.currentUser.username,
                            p_admin_pass: state.currentUser.password
                        })
                    });

                    if (!res.ok) throw new Error('Falha no motor API');
                    const json = await res.json();
                    if (json.error) throw new Error(json.error);

                    showToast('Assinatura gravada e ficheiro guardado no R2 em segundos!', 'success');
                    await window.fetchAndRenderBackups();
                } catch (e) {
                    showToast('Erro ao invocar Roteador: ' + e.message, 'error');
                } finally {
                    btnTrigger.disabled = false;
                    btnTrigger.innerHTML = '<i class="fa-solid fa-download"></i> Gerar Snapshot';
                }
            });
        }

        isLoaded = true;
    }

    await fetchAndRenderBackups();
}

async function fetchAndRenderBackups() {
    const tbody = document.getElementById('backups-tbody');
    try {
        const res = await fetch('/api/manage_backups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rpc: 'list_backups',
                p_token: state.currentUser.token,
                p_admin_user: state.currentUser.username,
                p_admin_pass: state.currentUser.password
            })
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Acesso negado à grelha manifest');

        if (json.error || !json.data) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Sem Acesso ou Vazio</td></tr>';
            return;
        }

        const list = json.data || [];

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 2rem;">Ainda sem Backups na NUVEM R2</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        list.forEach(att => {
            const tr = document.createElement('tr');

            const dateStr = new Date(att.uploaded).toLocaleString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            const mb = (att.size / 1024 / 1024).toFixed(2);

            tr.innerHTML = `
                <td>
                    <div style="font-weight:600; color:var(--text-primary);">${att.key}</div>
                    <div style="font-size:0.8rem; color:var(--text-secondary);"><i class="fa-regular fa-clock"></i> Espelho gravado a: ${dateStr}</div>
                </td>
                <td>
                    <div class="urgency-badge" style="background:var(--bg-secondary); border: 1px solid var(--border-color); color:var(--text-primary);">
                         ${mb} MB
                    </div>
                </td>
                <td style="text-align:right;">
                    <div style="display:flex; justify-content:flex-end; gap:5px;">
                        <button class="btn btn-secondary" style="padding:4px 10px;" onclick="window.downloadBackup('${att.key}')" title="Descarregar Zip JSON Bruto">
                            <i class="fa-solid fa-file-arrow-down"></i> Puxar Ficheiro
                        </button>
                        <button class="btn btn-secondary" style="padding:4px 10px; background:#fef2f2; color:#dc2626; border-color:#fca5a5;" onclick="window.deleteBackup('${att.key}')" title="Apagar R2">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 2rem; color:red;">Inacessível: ${e.message}</td></tr>`;
    }
}
// Attach to window globally for HTML onclicks
window.fetchAndRenderBackups = fetchAndRenderBackups;
window.loadBackupsView = loadBackupsView;

window.downloadBackup = async (key) => {
    console.log('[BACKUP] Starting download for:', key);
    showToast('A preparar transferência...', 'info');

    try {
        const res = await fetch('/api/manage_backups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rpc: 'download_backup',
                p_token: state.currentUser.token,
                p_admin_user: state.currentUser.username,
                p_admin_pass: state.currentUser.password,
                params: { key: key }
            })
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(errorText || 'Recusado pelo servidor');
        }

        const blob = await res.blob();
        console.log('[BACKUP] Received blob size:', blob.size);

        if (blob.size === 0) throw new Error('Ficheiro vazio recebido.');

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = key.split('/').pop() || 'backup.json';
        document.body.appendChild(a);
        a.click();

        // Delay revocation to ensure browser starts the download
        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            a.remove();
        }, 1000);

        showToast('Transferência iniciada!', 'success');
    } catch (e) {
        console.error('[BACKUP] Download error:', e);
        showToast('Erro ao baixar ficheiro: ' + e.message, 'error');
    }
};

window.deleteBackup = async (key) => {
    if (!confirm('Atenção: Ao apagar esta snapshot do Bunker vai apagar irreversivelmente a informação dessa data. Prosseguir?')) return;
    try {
        showToast('A remover snapshot...', 'info');
        const res = await fetch('/api/manage_backups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rpc: 'delete_backup',
                p_token: state.currentUser.token,
                p_admin_user: state.currentUser.username,
                p_admin_pass: state.currentUser.password,
                params: { key: key }
            })
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);

        showToast('Extirpado com sucesso!', 'success');
        await window.fetchAndRenderBackups();
    } catch (e) {
        showToast('Erro: ' + e.message, 'error');
    }
};
