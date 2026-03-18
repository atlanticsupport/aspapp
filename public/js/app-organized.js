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
    
    
    // Initialize Supabase
    await initSupabase();
    
    // Check authentication FIRST
    await checkAuth();
    
    // Setup event listeners
    setupEventListeners();
    setupAuthEvents();
    
    // Initialize autocomplete and load processes
    initProcessAutocomplete();
    if (state.currentUser) {
        fetchAllProcesses();
    }
    
    // Only load dashboard if user is authenticated
    if (state.currentUser) {
        await navigateTo('dashboard');
        await loadDashboard();
    } else {
    }
    
    
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
