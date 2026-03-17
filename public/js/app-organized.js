// Organized app entry point
import { 
    state, 
    checkAuth, 
    logout, 
    setupAuthEvents,
    setupEventListeners,
    loadDashboard,
    navigateTo,
    initSupabase,
    fetchAllProcesses,
    initProcessAutocomplete
} from './modules/index.js';

// Initialize app
async function initApp() {
    console.log('[BOOT] Initializing organized app...');
    
    // Wait for DOM to be ready
    if (document.readyState !== 'complete') {
        await new Promise(resolve => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', resolve);
            } else {
                resolve();
            }
        });
    }
    
    console.log('[BOOT] DOM ready');
    
    // Initialize Supabase
    await initSupabase();
    console.log('[BOOT] Supabase initialized');
    
    // Check authentication FIRST
    await checkAuth();
    console.log('[BOOT] Auth checked');
    
    // Setup event listeners
    setupEventListeners();
    setupAuthEvents();
    console.log('[BOOT] Events setup complete');
    
    // Initialize autocomplete and load processes
    initProcessAutocomplete();
    if (state.currentUser) {
        fetchAllProcesses();
    }
    
    // Only load dashboard if user is authenticated
    if (state.currentUser) {
        console.log('[BOOT] User authenticated, loading dashboard');
        await navigateTo('dashboard');
        await loadDashboard();
    } else {
        console.log('[BOOT] No user authenticated, login should be visible');
    }
    
    console.log('[BOOT] App initialization complete');
    
    // Hide the app loader
    const appLoader = document.getElementById('app-loader');
    if (appLoader) {
        appLoader.style.opacity = '0';
        appLoader.style.pointerEvents = 'none';
        setTimeout(() => {
            appLoader.style.display = 'none';
        }, 600);
    }
}

// Start the app
initApp().catch(console.error);
