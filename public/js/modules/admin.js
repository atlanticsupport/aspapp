import { state } from './state.js';
import { supabase } from './supabase-client.js';
import { showToast } from './ui.js';
import { views } from './dom.js';
import { dialog } from './dialogs.js';

export async function loadAdminPanel() {
    const isAdmin = state.currentUser?.role === 'admin';
    views.admin.innerHTML = `
        <div class="admin-panel" style="animation: fadeIn 0.4s ease-out;">
            <div class="filter-bar">
                <div class="view-header" style="margin:0;">
                    <i class="fa-solid fa-user-shield"></i>
                    <h2>Administração de Utilizadores</h2>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-primary" id="btn-add-user">
                        <i class="fa-solid fa-user-plus"></i> Novo Utilizador
                    </button>
                    ${isAdmin ? `
                    <button class="btn btn-danger" id="btn-factory-reset" style="background: #dc3545;">
                        <i class="fa-solid fa-bomb"></i> Factory Reset
                    </button>` : ''}
                </div>
            </div>
            
            <div class="inventory-container">
                <div class="table-wrapper">
                    <table class="data-table admin-table">
                        <thead>
                            <tr>
                                <th>Utilizador</th>
                                <th>Cargo</th>
                                <th style="text-align:center;">Permissões</th>
                                <th style="text-align:center;">Acessos</th>
                                <th style="text-align:right;">Ações</th>
                            </tr>
                        </thead>
                        <tbody id="user-table-body">
                            <tr><td colspan="5" style="text-align:center; padding:2rem;">A carregar lista de utilizadores...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    document.getElementById('btn-add-user').onclick = () => openUserModal();

    const factoryBtn = document.getElementById('btn-factory-reset');
    if (factoryBtn) factoryBtn.onclick = () => performFactoryReset();
    setupAdminEvents();
    fetchUsers();
}

export async function fetchUsers() {
    if (!state.currentUser) return;

    // Agora usamos a RPC segura (O SELECT direto está bloqueado por RLS)
    const { data, error } = await supabase.rpc('secure_fetch_users', {
        p_user: state.currentUser.username,
        p_pass: state.currentUser.password
    });

    if (error) {
        console.error('Error fetching users:', error);
        showToast('Erro ao carregar utilizadores: ' + error.message, 'error');
        return;
    }
    state.appUsers = data;
    renderUserTable();
}

function renderUserTable() {
    const tbody = document.getElementById('user-table-body');
    if (!tbody) return;

    tbody.innerHTML = state.appUsers.map(u => `
    <tr>
        <td style="font-weight:600; font-size: 1.1rem; color: var(--primary-color);">${u.username}</td>
        <td>
            <span class="badge-po" style="background:${u.role === 'admin' ? '#fef2f2' : '#f0f9ff'}; color:${u.role === 'admin' ? '#dc2626' : '#0369a1'};">
                ${u.role === 'admin' ? 'Administrador' : 'Utilizador'}
            </span>
        </td>
        <td style="text-align:center;">
            <div style="display:flex; gap:4px; justify-content:center; font-size:0.8rem;">
                <span title="Inventário: Ler" style="color:${(u.inventory_access && u.inventory_access.includes('R')) || u.role === 'admin' ? '#10b981' : '#ccc'}">R</span>
                <span title="Inventário: Criar" style="color:${(u.inventory_access && u.inventory_access.includes('C')) || u.role === 'admin' ? '#10b981' : '#ccc'}">C</span>
                <span title="Inventário: Editar" style="color:${(u.inventory_access && u.inventory_access.includes('U')) || u.role === 'admin' ? '#10b981' : '#ccc'}">U</span>
                <span title="Inventário: Eliminar" style="color:${(u.inventory_access && u.inventory_access.includes('D')) || u.role === 'admin' ? '#10b981' : '#ccc'}">D</span>
            </div>
        </td>
        <td style="text-align:center;">
            <div style="display:flex; gap:6px; justify-content:center; font-size:0.85rem;">
                <i class="fa-solid fa-chart-line" title="Dashboard" style="color:${u.view_dashboard || u.role === 'admin' ? '#6366f1' : '#ccc'}"></i>
                <i class="fa-solid fa-boxes-stacked" title="Inventário" style="color:${u.view_inventory || u.role === 'admin' ? '#6366f1' : '#ccc'}"></i>
                <i class="fa-solid fa-clock-rotate-left" title="Histórico" style="color:${u.view_history || u.role === 'admin' ? '#6366f1' : '#ccc'}"></i>
                <i class="fa-solid fa-truck-fast" title="Logística/Trânsito" style="color:${u.view_logistics || u.view_transit || u.role === 'admin' ? '#6366f1' : '#ccc'}"></i>
                <i class="fa-solid fa-euro-sign" title="Ver Preços" style="color:${u.can_view_prices || u.role === 'admin' ? '#eab308' : '#ccc'}"></i>
            </div>
        </td>
        <td style="text-align:right;">
            <div style="display:flex; justify-content:flex-end; gap:5px;">
                <button class="btn btn-secondary" style="padding:4px 10px;" onclick="window.openUserModal('${u.id}')">
                    <i class="fa-solid fa-user-gear"></i> Editar
                </button>
                <button class="btn btn-secondary" style="padding:4px 10px; background:#fef2f2; color:#dc2626; border-color:#fca5a5;" onclick="window.deleteUser('${u.id}')" title="Apagar Conta">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </td>
    </tr>
    `).join('');
}

export function openUserModal(userId) {
    const modal = document.getElementById('user-modal');
    const form = document.getElementById('user-admin-form');
    form.reset();

    const renderPermissionMatrix = (user = null) => {
        const matrixContainer = document.getElementById('permission-matrix');
        const navItems = document.querySelectorAll('.nav-menu .nav-item');

        const headerHtml = `
            <div class="perm-grid-header" style="display: grid; grid-template-columns: 1fr 50px 40px 40px 40px; gap: 8px; padding: 1.5rem 1rem 0.5rem; text-align: center; font-size: 0.9rem; font-weight: 600; color: var(--text-secondary);">
                <span style="text-align: left; text-transform: uppercase; font-size: 0.7rem; font-weight: 700;">Módulo</span>
                <span title="Visível no Menu"><i class="fa-solid fa-folder-open"></i></span>
                <span title="Adicionar / Criar"><i class="fa-solid fa-plus"></i></span>
                <span title="Editar / Atualizar"><i class="fa-solid fa-pen"></i></span>
                <span title="Apagar / Remover"><i class="fa-solid fa-trash-can"></i></span>
            </div>
        `;

        matrixContainer.innerHTML = headerHtml + Array.from(navItems).map(item => {
            const page = item.dataset.page;
            if (page === 'admin') return '';

            const label = item.querySelector('span')?.textContent || page;
            const icon = item.querySelector('i')?.className || 'fa-solid fa-circle';
            const vKey = `view_${page.replace(/-/g, '_')}`;
            const accessKey = `${page.replace(/-/g, '_')}_access`;

            const isVisible = user ? (user[vKey] === 1 || user[vKey] === true || (user[vKey] !== 0 && user[vKey] !== false)) : true;
            let access = user ? (user[accessKey] || '') : 'R';

            if (access === 'read') access = 'R';
            if (access === 'write') access = 'RCUD';
            if (access === 'none') access = '';

            const hasR = access.includes('R');
            const hasC = access.includes('C');
            const hasU = access.includes('U');
            const hasD = access.includes('D');

            const allowedPerms = {
                'dashboard': [],
                'inventory': ['C', 'U', 'D'],
                'low-stock': [], // virtual
                'transit': ['C', 'U', 'D'],
                'stock-out': ['C', 'U', 'D'],
                'logistics': ['C', 'U', 'D'],
                'history': [],
                'usage': [],
                'backups': ['C', 'D'],
                'settings': [] // Local only, no CRUD
            };
            const allowed = allowedPerms[page] || ['C', 'U', 'D'];

            return `
                <div class="perm-module-row" data-page="${page}" style="display: grid; grid-template-columns: 1fr 50px 40px 40px 40px; gap: 8px; align-items: center; background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.75rem 1rem; transition: var(--transition); margin-bottom:4px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="perm-icon-box" style="width:28px; height:28px; font-size:0.9rem; border-radius:6px; background:#f1f5f9; color:var(--primary-color); display:flex; align-items:center; justify-content:center;">
                            <i class="${icon}"></i>
                        </div>
                        <span style="font-weight:600; font-size:0.85rem; color:var(--text-primary);">${label}</span>
                    </div>
                    <div style="display:flex; justify-content:center;" title="Mostrar no Menu">
                        <label class="switch small">
                            <input type="checkbox" class="tab-view-check" id="view-${page}" ${isVisible ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                    <div style="display:flex; justify-content:center;" title="Adicionar / Criar">
                        ${allowed.includes('C') ? `<input type="checkbox" class="tab-perm-bit" data-bit="C" ${hasC ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer; accent-color: var(--primary-color);">` : `<span style="color:#cbd5e1; font-weight:bold;">-</span>`}
                    </div>
                    <div style="display:flex; justify-content:center;" title="Editar / Atualizar">
                        ${allowed.includes('U') ? `<input type="checkbox" class="tab-perm-bit" data-bit="U" ${hasU ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer; accent-color: var(--primary-color);">` : `<span style="color:#cbd5e1; font-weight:bold;">-</span>`}
                    </div>
                    <div style="display:flex; justify-content:center;" title="Apagar / Remover">
                        ${allowed.includes('D') ? `<input type="checkbox" class="tab-perm-bit" data-bit="D" ${hasD ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer; accent-color: #ef4444;">` : `<span style="color:#cbd5e1; font-weight:bold;">-</span>`}
                    </div>
                </div>
            `;
        }).join('');

    };

    const titleEl = document.getElementById('user-modal-title') || { textContent: '' };
    titleEl.textContent = userId ? 'Editar Utilizador' : 'Novo Utilizador';

    if (userId) {
        const user = state.appUsers.find(u => u.id === userId);
        if (!user) return;

        document.getElementById('user-id').value = user.id;
        document.getElementById('user-username').value = user.username;
        document.getElementById('user-password').placeholder = "Deixe vazio para não alterar";

        document.getElementById('perm-admin').checked = user.role === 'admin';
        renderPermissionMatrix(user);
    } else {
        document.getElementById('user-id').value = '';
        document.getElementById('user-password').placeholder = "Defina uma password forte";
        document.getElementById('perm-admin').checked = false;
        renderPermissionMatrix();
    }

    const adminCheck = document.getElementById('perm-admin');
    const matrixEl = document.getElementById('permission-matrix');

    // Toggle matrix visibility based on Admin role
    const toggleAdminView = () => {
        if (adminCheck.checked) {
            matrixEl.style.display = 'none';
        } else {
            matrixEl.style.display = 'block';
        }
    };
    adminCheck.onchange = toggleAdminView;
    toggleAdminView();

    modal.classList.add('open');
}

export function setupAdminEvents() {
    const form = document.getElementById('user-admin-form');
    const saveBtn = document.getElementById('btn-save-user');
    if (!form || !saveBtn) return;

    saveBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        const id = document.getElementById('user-id').value;
        const username = document.getElementById('user-username').value.trim();
        const passwordRaw = document.getElementById('user-password').value;

        const userData = {
            id: id || null,
            username: username,
            role: document.getElementById('perm-admin').checked ? 'admin' : 'user',
            can_view_prices: document.getElementById('perm-prices-check')?.checked || false,
            // Fallbacks for legacy structure
            can_read: true,
            can_create: false,
            can_update: false,
            can_delete: false,
            view_admin: document.getElementById('perm-admin').checked
        };

        // Gather per-tab visibility and RCUD
        const isAdmin = document.getElementById('perm-admin').checked;
        userData.can_view_prices = isAdmin ? true : (document.getElementById('perm-prices-check')?.checked || false);

        document.querySelectorAll('.perm-module-row').forEach(row => {
            const page = row.dataset.page;
            const vKey = `view_${page.replace(/-/g, '_')}`;
            const accessKey = `${page.replace(/-/g, '_')}_access`;

            const viewChecked = row.querySelector('.tab-view-check').checked;
            userData[vKey] = isAdmin ? true : viewChecked;

            let accessStr = viewChecked ? 'R' : '';
            row.querySelectorAll('.tab-perm-bit:checked').forEach(bit => {
                accessStr += bit.dataset.bit;
            });
            userData[accessKey] = isAdmin ? 'RCUD' : (accessStr || 'none');

            console.log(`DEBUG PERMS: ${page} -> view: ${viewChecked}, access: ${userData[accessKey]}`);

            // Sync global bits for legacy compatibility if possible
            if (page === 'inventory') {
                userData.can_read = accessStr.includes('R');
                userData.can_create = accessStr.includes('C');
                userData.can_update = accessStr.includes('U');
                userData.can_delete = accessStr.includes('D');
            }
        });

        if (passwordRaw) {
            console.log('DEBUG: Sending password to server (will be hashed server-side)');
            userData.password = passwordRaw;
        }

        console.log('DEBUG: Final userData to send:', userData);

        saveBtn.disabled = true;
        saveBtn.textContent = 'A processar...';

        try {
            console.log('DEBUG: Calling rpc_manage_user with action:', id ? 'update' : 'create');
            console.log('DEBUG: state.currentUser.username:', state.currentUser.username);
            console.log('DEBUG: state.currentUser.password:', state.currentUser.password);
            console.log('DEBUG: userData:', JSON.stringify(userData, null, 2));
            
            const { error, data } = await supabase.rpc('rpc_manage_user', {
                p_admin_user: state.currentUser.username,
                p_admin_pass: state.currentUser.password,
                p_action: id ? 'update' : 'create',
                p_user_data: userData
            });
            
            console.log('DEBUG: RPC response - error:', error);
            console.log('DEBUG: RPC response - data:', data);

            if (error) {
                console.error('DEBUG: rpc_manage_user ERROR:', error);
                throw error;
            }

            console.log('DEBUG: rpc_manage_user SUCCESS, data:', data);

            showToast(id ? 'Utilizador atualizado com sucesso!' : 'Novo utilizador criado!', 'success');
            document.getElementById('user-modal').classList.remove('open');
            fetchUsers();
        } catch (err) {
            showToast('Erro: ' + (err.message || err), 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Alterações';
        }
        
        return false; // Prevent any form submission
    };
    
    // Also prevent form submission entirely
    form.onsubmit = (e) => {
        e.preventDefault();
        return false;
    };
}

window.deleteUser = async (userId) => {
    if (!state.currentUser || state.currentUser.role !== 'admin') return;
    if (userId === state.currentUser.id) return showToast('Não pode apagar a sua própria conta.', 'warning');

    const confirmed = await dialog.confirm({
        title: 'Apagar Utilizador',
        message: 'Tem a certeza que deseja eliminar esta conta? Esta ação é irreversível.',
        confirmText: 'Sim, Apagar',
        type: 'danger'
    });

    if (!confirmed) return;

    try {
        const { error } = await supabase.rpc('rpc_manage_user', {
            p_admin_user: state.currentUser.username,
            p_admin_pass: state.currentUser.password,
            p_action: 'delete',
            p_user_data: { id: userId }
        });

        if (error) throw error;

        showToast('Utilizador apagado com sucesso.', 'success');
        fetchUsers();
    } catch (err) {
        showToast('Erro ao apagar: ' + (err.message || err), 'error');
    }
};

async function performFactoryReset() {
    if (!state.currentUser || state.currentUser.role !== 'admin') {
        showToast('Acesso negado. Apenas administradores.', 'error');
        return;
    }

    const confirmed = await dialog.confirm({
        title: 'ATENÇÃO: APAGAR TODOS OS DADOS',
        message: 'Isto vai apagar TODO o stock, encomendas e histórico.\nEsta ação não pode ser desfeita.',
        confirmText: 'SIM, APAGAR TUDO',
        cancelText: 'Cancelar',
        type: 'danger'
    });

    if (!confirmed) return;

    const doubleCheck = prompt('Confirme escrevendo "APAGAR TUDO" para prosseguir:');
    
    if (doubleCheck !== 'APAGAR TUDO') {
        showToast('Cancelado. Texto de confirmação incorreto.', 'warning');
        return;
    }

    try {
        const { showGlobalLoading, hideGlobalLoading } = await import('./ui.js');
        showGlobalLoading('A formatar base de dados...');
        
        const { data, error } = await supabase.rpc('secure_factory_reset', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password
        });

        if (error) throw error;

        hideGlobalLoading();
        showToast('Base de Dados apagada com sucesso! A reiniciar...', 'success');
        
        setTimeout(() => {
            window.location.reload();
        }, 1500);
        
    } catch (error) {
        const { hideGlobalLoading } = await import('./ui.js');
        hideGlobalLoading();
        console.error('Factory Reset error:', error);
        showToast('Erro ao apagar: ' + error.message, 'error');
    }
}
