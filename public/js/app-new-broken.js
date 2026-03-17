// Organized imports using the new module structure
import { state, showToast, setupEventListeners } from './modules/core/index.js';
import { checkAuth, logout, setupAuthEvents } from './modules/auth/index.js';
import { fetchProducts, fetchAllProcesses } from './modules/data/index.js';
import { navigateTo, initDashboard } from './modules/views/index.js';
import { dialog } from './modules/ui/index.js';
import { ExcelImporter } from './modules/import/index.js';
import { initPhcImport } from './modules/phc/index.js';

// Supabase Client
import { supabase, initSupabase } from './modules/supabase-client.js';
export { supabase };

// Import feature modules (still at root level)
import * as inventoryLogic from './modules/inventory.js';
import * as productsLogic from './modules/products.js';
import * as historyLogic from './modules/history.js';
import * as adminLogic from './modules/admin.js';
import * as printingLogic from './modules/printing.js';
import * as shimLogic from './modules/ag-grid-shim.js';
import * as logisticsLogic from './modules/logistics.js';
import * as transitLogic from './modules/transit.js';
import * as stockOutLogic from './modules/stock-out.js';
import * as backupsLogic from './modules/backups.js';
import * as usageLogic from './modules/usage.js';

// Global exports for inline HTML events
window.navigateTo = navigateTo;
window.logout = logout;
window.dialog = dialog;
window.ExcelImporter = ExcelImporter;

// Attach all module functions to window
Object.assign(window, inventoryLogic);
Object.assign(window, productsLogic);
Object.assign(window, historyLogic);
Object.assign(window, adminLogic);
Object.assign(window, printingLogic);
Object.assign(window, shimLogic);
Object.assign(window, logisticsLogic);
Object.assign(window, transitLogic);
Object.assign(window, stockOutLogic);
Object.assign(window, backupsLogic);
Object.assign(window, usageLogic);

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
    const loader = document.getElementById('app-loader');
    const loadText = document.getElementById('loading-text');
    const loginOverlay = document.getElementById('login-overlay');

    const updateLoad = (msg) => {
        if (loadText) loadText.textContent = msg;
        console.log(`[BOOT] ${msg}`);
    };

    try {
        updateLoad('A preparar ligação...');
        const startTime = performance.now();

        // 1. Start Supabase Init
        const supabasePromise = initSupabase();

        updateLoad('A verificar sessão...');
        await supabasePromise;

        // 2. Check authentication
        const authResult = await checkAuth();
        if (!authResult.authenticated) {
            updateLoad('A redirecionar para login...');
            if (loginOverlay) loginOverlay.style.display = 'flex';
            if (loader) loader.style.display = 'none';
            setupAuthEvents();
            return;
        }

        // 3. Initialize core systems
        updateLoad('A preparar interface...');
        setupEventListeners();

        // 4. Load initial data
        updateLoad('A carregar dados...');
        const [products, processes] = await Promise.all([
            fetchProducts(),
            fetchAllProcesses()
        ]);

        // 5. Initialize modules
        updateLoad('A inicializar módulos...');
        initDashboard();
        initPhcImport();

        // 6. Load initial view
        updateLoad('A carregar vista inicial...');
        await navigateTo('dashboard');

        // 7. Hide loader
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 300);
        }

        const loadTime = performance.now() - startTime;
        console.log(`[BOOT] Sistema Pronto`);
        console.log(`Full-App-Load: ${loadTime.toFixed(2)} ms`);

    } catch (error) {
        console.error('[BOOT] Erro crítico:', error);
        updateLoad('Erro ao carregar aplicação');
        showToast('Erro ao inicializar a aplicação. Por favor recarregue a página.', 'error');
        
        if (loader) {
            loader.style.background = '#ef4444';
            loader.style.color = 'white';
        }
    }
});
