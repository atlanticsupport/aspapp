
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

// Supabase Client (Imported and initialized asynchronously to use environment variables)
import { supabase, initSupabase } from './modules/supabase-client.js';
export { supabase };

// Legacy handler registry (backward compatibility for inline onclick)
import { registerLegacyHandlers, exposeToWindow } from './modules/legacy-handlers.js';

// 1. Start Supabase Init IMMEDIATELY (Don't wait for DOM)
const supabasePromise = initSupabase();

// 2. Register legacy handlers for backward compatibility with inline onclick handlers
// This maintains full compatibility while organizing code better
registerLegacyHandlers({
    navigateTo,
    logout,
    ...inventoryLogic,
    ...productsLogic,
    ...historyLogic,
    ...adminLogic,
    ...printingLogic,
    ...shimLogic
});

// Expose handlers to window for inline onclick support
exposeToWindow();

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
        console.time('Full-App-Load');

        // 0. Setup: Init Supabase FIRST (since checkAuth now needs it)
        updateLoad('A preparar ligação...');
        const tStart = performance.now();

        const sbClient = await supabasePromise;

        // Now check auth
        updateLoad('A verificar sessão...');
        await checkAuth();

        console.log(`Initial Setup: ${(performance.now() - tStart).toFixed(1)}ms`);

        if (!state.currentUser) {
            updateLoad('A aguardar login...');
            console.timeEnd('Full-App-Load');
            // Show login screen
            if (loader) loader.style.display = 'none';
            if (loginOverlay) {
                loginOverlay.style.display = 'flex';
                loginOverlay.classList.add('open');
                setupAuthEvents();
            }
        } else {
            // User is logged in, continue loading app data
            updateLoad('A preparar interface...');

            // RUN IN PARALLEL: UI Setup and Data Prefetching
            const setupPromise = (async () => {
                setupEventListeners();
                setupAdminEvents();
                initPhcImport();

                // Secondary non-blocking fetches
                import('./modules/data.js').then(m => m.fetchAllProcesses());
                import('./modules/autocomplete.js').then(m => m.initProcessAutocomplete());
            })();

            // Restore Tab Order (Fast) via Cookies
            const getCookieFallback = (name) => {
                const v = `; ${document.cookie}`;
                const parts = v.split(`; ${name}=`);
                if (parts.length === 2) return parts.pop().split(';').shift();
                return localStorage.getItem(name); // fallback to old localstorage just in case
            };

            const savedOrderStr = getCookieFallback('sidebarOrder');
            if (savedOrderStr) {
                const savedOrder = decodeURIComponent(savedOrderStr);
                try {
                    const order = JSON.parse(savedOrder);
                    const navMenu = document.querySelector('.nav-menu');
                    if (navMenu && Array.isArray(order)) {
                        order.forEach(node => {
                            let el;
                            // Check if it's the new structured format or old flat format
                            if (typeof node === 'object' && node.id) {
                                if (node.type === 'item') {
                                    el = navMenu.querySelector(`.nav-item[data-page="${node.id}"]`);
                                } else {
                                    el = document.getElementById(node.id);
                                }
                            } else if (typeof node === 'string') {
                                // Backward compatibility for old simple page list
                                el = navMenu.querySelector(`.nav-item[data-page="${node}"]`);
                            }

                            if (el && el.parentElement) {
                                el.parentElement.appendChild(el);
                            }
                        });
                    }
                } catch (e) { }
            }

            const loadedSettings = localStorage.getItem('columnSettings');
            if (loadedSettings) {
                try {
                    const parsed = JSON.parse(loadedSettings);
                    Object.assign(state.columnSettings, parsed);
                } catch (e) { }
            }

            // TRIGGER INITIAL VIEW
            const firstTab = document.querySelector('.nav-item');
            const tView = performance.now();

            // Wait for both the initial view data AND the basic setup logic
            if (firstTab) {
                await Promise.all([
                    window.navigateTo(firstTab.dataset.page),
                    setupPromise
                ]);
            } else {
                await Promise.all([
                    loadDashboard(),
                    setupPromise
                ]);
            }
            console.log(`Initial View Load: ${(performance.now() - tView).toFixed(1)} ms`);

            // 4. Hide Loader
            updateLoad('Sistema Pronto');
            console.timeEnd('Full-App-Load');

            if (loader) {
                loader.style.opacity = '0';
                loader.style.transform = 'scale(1.02) translateY(-10px)';
                setTimeout(() => {
                    loader.style.display = 'none';
                }, 500);
            }
        }
    } catch (err) {
        console.error('Critical Initialization Error:', err);
        if (loadText) loadText.innerHTML = `<span style="color: #ef4444;">Erro Crítico: ${err.message}</span><br><button onclick="location.reload()" style="margin-top:10px; padding:5px 15px; border-radius:5px; border:none; background:#6366f1; color:white; cursor:pointer;">Recarregar</button>`;
    }
});
