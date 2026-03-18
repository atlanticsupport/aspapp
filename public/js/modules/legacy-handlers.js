/**
 * Legacy Handler Registry
 *
 * This module provides a safe abstraction layer for exposing functions to window
 * for inline HTML onclick handlers. It maintains backward compatibility while
 * preparing for migration to event delegation.
 *
 * @module modules/legacy-handlers
 */

// Map of legacy handlers for onclick attributes
const legacyHandlers = {};

/**
 * Register a group of functions to be exposed as window handlers
 * @param {Object} handlers - Object with function names as keys
 * @returns {Object} - Same handlers object for chaining
 */
export function registerLegacyHandlers(handlers) {
    Object.assign(legacyHandlers, handlers);
    return handlers;
}

/**
 * Get all registered legacy handlers (for migration tracking)
 * @returns {Object} - Registry of all handlers
 */
export function getLegacyHandlers() {
    return { ...legacyHandlers };
}

/**
 * Expose legacy handlers to window object
 * This is called once on app init to support existing inline onclick handlers
 * @returns {void}
 */
export function exposeToWindow() {
    // Assign all registered handlers to window for inline onclick support
    Object.assign(window, legacyHandlers);
    console.log('[LEGACY] Exposed', Object.keys(legacyHandlers).length, 'handlers to window');
}

/**
 * Check which legacy handlers are actually used in the DOM
 * Useful for migration planning
 * @returns {Object} - Object with usage stats
 */
export function auditHandlerUsage() {
    const audit = {
        total: Object.keys(legacyHandlers).length,
        used: [],
        unused: [],
        timestamp: new Date().toISOString()
    };

    Object.keys(legacyHandlers).forEach(handlerName => {
        // Check if this handler name appears in any onclick attributes
        const found = document.querySelector(`[onclick*="${handlerName}"]`);
        if (found) {
            audit.used.push(handlerName);
        } else {
            audit.unused.push(handlerName);
        }
    });

    console.log('[LEGACY] Audit: Used =', audit.used.length, 'Unused =', audit.unused.length);
    return audit;
}
