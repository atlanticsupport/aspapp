import { state } from '../core/state.js';
import { supabase } from '../supabase-client.js';
import { showToast } from '../core/ui.js';
import { validateUserSession, applyPermissionsToUI, getPermissionsSummary } from './permissions.js';

export async function checkAuth() {
    const saved = localStorage.getItem('aspapp_session');

    if (!saved) {
        // Show login if no session
        const loginOverlay = document.getElementById('login-overlay');
        if (loginOverlay) {
            loginOverlay.classList.add('open');
            // Force visibility - override all styles
            loginOverlay.style.setProperty('display', 'flex', 'important');
            loginOverlay.style.setProperty('opacity', '1', 'important');
            loginOverlay.style.setProperty('pointer-events', 'auto', 'important');
            loginOverlay.style.setProperty('visibility', 'visible', 'important');
        } else {
            console.error('[AUTH] Login overlay element not found!');
        }
        return;
    }

    try {
        const user = JSON.parse(saved);

        // Check if this is an old session without permissions
        if (!user.transit_access && !user.stock_out_access && !user.logistics_access) {
            localStorage.removeItem('aspapp_session');
            const loginOverlay = document.getElementById('login-overlay');
            if (loginOverlay) {
                loginOverlay.classList.add('open');
            }
            return;
        }

        // Validate session using new system
        if (!validateUserSession(user)) {
            localStorage.removeItem('aspapp_session');
            const loginOverlay = document.getElementById('login-overlay');
            if (loginOverlay) {
                loginOverlay.classList.add('open');
            }
            return;
        }

        // Skip session validation for now - assume token is valid if it exists
        // TODO: Implement proper session validation when rpc_test_session is available
        if (false) {
            localStorage.removeItem('aspapp_session');
            const loginOverlay = document.getElementById('login-overlay');
            if (loginOverlay) {
                loginOverlay.classList.add('open');
                // Force visibility - override all styles
                loginOverlay.style.setProperty('display', 'flex', 'important');
                loginOverlay.style.setProperty('opacity', '1', 'important');
                loginOverlay.style.setProperty('pointer-events', 'auto', 'important');
                loginOverlay.style.setProperty('visibility', 'visible', 'important');
            } else {
            }
            return;
        }

        state.currentUser = user;

        // Apply permissions using new system
        applyPermissionsToUI(user);

        // Debug: Show permissions summary

        const loginOverlay = document.getElementById('login-overlay');
        if (loginOverlay) {
            loginOverlay.classList.remove('open');
            // Force hide - override all styles
            loginOverlay.style.setProperty('display', 'none', 'important');
            loginOverlay.style.setProperty('opacity', '0', 'important');
            loginOverlay.style.setProperty('pointer-events', 'none', 'important');
            loginOverlay.style.setProperty('visibility', 'hidden', 'important');
        }
    } catch (e) {
        console.error('Error checking auth:', e);
        localStorage.removeItem('aspapp_session');
        const loginOverlay = document.getElementById('login-overlay');
        if (loginOverlay) {
            loginOverlay.classList.add('open');
        }
    }
}

export async function login(username, password) {
    const { data, error } = await supabase.rpc('rpc_login', {
        p_username: username,
        p_password: password
    });

    if (error || !data || data.length === 0) {
        showToast('Credenciais inválidas ou erro de ligação.', 'error');
        return false;
    }

    // Store plain password for RPC authentication (server removes it from response)
    data[0].password = password;

    state.currentUser = data[0];

    // Save COMPLETE user object with all permissions and password
    localStorage.setItem('aspapp_session', JSON.stringify(data[0]));

    // Apply permissions using new system
    applyPermissionsToUI(data[0]);

    // Debug: Show permissions summary

    // Hide login overlay
    const loginOverlay = document.getElementById('login-overlay');
    if (loginOverlay) {
        loginOverlay.classList.remove('open');
        // Force hide - override all styles
        loginOverlay.style.setProperty('display', 'none', 'important');
        loginOverlay.style.setProperty('opacity', '0', 'important');
        loginOverlay.style.setProperty('pointer-events', 'none', 'important');
        loginOverlay.style.setProperty('visibility', 'hidden', 'important');
    }

    showToast('Sessão iniciada!', 'success');
    // Removed auto-reload to preserve console logs for debugging
    return true;
}

export async function logout() {
    localStorage.clear();
    state.currentUser = null;
    location.reload();
}

// Re-export permission system functions
export { hasModuleAccess, MODULES, PERMISSION_LEVELS } from './permissions.js';

export function setupAuthEvents() {
    const form = document.getElementById('login-form');
    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button');
        const user = document.getElementById('login-username').value;
        const pass = document.getElementById('login-password').value;

        try {
            btn.disabled = true;
            btn.textContent = 'Autenticando...';
            await login(user, pass);
        } catch (err) {
            console.error(err);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Entrar no Sistema';
        }
    };
}
