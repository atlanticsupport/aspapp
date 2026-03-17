// Centralized exports for better organization
// This file serves as the main entry point for all modules

// Core modules
export * from './core/state.js';
export * from './core/ui.js';
export * from './core/dom.js';
export * from './core/events.js';

// Authentication
export * from './auth/auth.js';

// Main modules
export * from './data.js';
export * from './supabase-client.js';
export * from './ui.js';
export * from './dialogs.js';

// Feature modules
export * from './inventory.js';
export * from './products.js';
export * from './dashboard.js';
export * from './history.js';
export * from './admin.js';
export * from './transit.js';
export * from './logistics.js';
export *from './stock-out.js';
export * from './usage.js';
export * from './backups.js';

// PHC modules
export * from './phc/phc-core.js';
export * from './phc/phc-import.js';
export * from './phc/phc-ui.js';
export * from './phc/phc-fetch.js';

// Views
export * from './views.js';

// Utilities
export * from './ag-grid-shim.js';
export * from './printing.js';
export * from './autocomplete.js';
