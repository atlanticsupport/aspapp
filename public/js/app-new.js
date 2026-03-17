// Novo arquivo para forçar reload completo
import { state } from './modules/state.js';
import { fetchProducts } from './modules/data.js';
import { loadInventory } from './modules/inventory.js';
import { loadDashboard } from './modules/dashboard.js';
import { setupEventListeners } from './modules/events.js';
import { checkAuth, logout, setupAuthEvents } from './modules/auth.js';
import { setupAdminEvents } from './modules/admin.js';

// Global exports for inline HTML events
import { navigateTo } from './modules/views.js';
import * as inventoryLogic from './modules/inventory.js';
import * as productsLogic from './modules/products.js';
import * as historyLogic from './modules/history.js';
import * as adminLogic from './modules/admin.js';
import * as printingLogic from './modules/printing.js';
import * as shimLogic from './modules/ag-grid-shim.js';

// New Module: PHC Import
import { initPhcImport } from './modules/phc/index.js';
// Test dialogs import
import { dialog } from './modules/dialogs-v2.js';

// Expose globally for HTML onclick handlers
window.navigateTo = navigateTo;
window.loadInventory = loadInventory;
window.editProduct = inventoryLogic.editProduct;
window.deleteProduct = inventoryLogic.deleteProduct;
window.saveProduct = productsLogic.saveProduct;
window.openProductGallery = productsLogic.openProductGallery;
window.loadHistory = historyLogic.loadHistory;
window.loadAdminPanel = adminLogic.loadAdminPanel;
window.printPalletLabel = printingLogic.printPalletLabel;
window.printBoxLabel = printingLogic.printBoxLabel;
window.openViewer = shimLogic.openViewer;
window.closeViewer = shimLogic.closeViewer;
window.login = checkAuth;
window.logout = logout;
window.initPhcImport = initPhcImport;

// Initialize app
async function initApp() {
    console.log('[BOOT] A preparar ligação...');
    
    // Initialize Supabase client
    const { initSupabase } = await import('./modules/supabase-client.js');
    await initSupabase();
    
    console.log('[BOOT] A verificar sessão...');
    await checkAuth();
    
    console.time('Initial Setup');
    // Setup event listeners first
    setupEventListeners();
    console.timeEnd('Initial Setup');
    
    // Only load interface if user is logged in
    if (state.currentUser) {
        console.log('[BOOT] A preparar interface...');
        // Load initial view
        await navigateTo('dashboard');
        
        console.time('Initial View Load');
        // Load dashboard data
        await loadDashboard();
        console.timeEnd('Initial View Load');
    }
    
    console.log('[BOOT] Sistema Pronto');
    console.time('Full-App-Load');
    console.timeEnd('Full-App-Load');
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
