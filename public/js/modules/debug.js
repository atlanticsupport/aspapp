/**
 * Debug Flag Management System
 * 
 * Enable debugging:
 * - Add ?debug=1 to URL
 * - Or: localStorage.setItem('app_debug', '1')
 * 
 * Disable debugging:
 * - Remove ?debug=1 from URL
 * - Or: localStorage.removeItem('app_debug')
 */

const isDebugEnabled = () => {
    const url = new URL(window.location);
    return url.searchParams.has('debug') || localStorage.getItem('app_debug') === '1';
};

/**
 * Conditional logging - only logs if debug mode is enabled
 * @param {string} label - Debug label for the log
 * @param {any} message - Message to log
 * @param {any} data - Optional additional data
 */
export function debugLog(label, message, data = null) {
    if (!isDebugEnabled()) return;

    const style = `color: #0066cc; font-weight: bold; background: #f0f0f0; padding: 2px 6px; border-radius: 3px;`;
    if (data !== null) {
        console.log(`%c[${label}]%c ${message}`, style, '', data);
    } else {
        console.log(`%c[${label}]%c ${message}`, style, '');
    }
}

/**
 * Always log errors (never conditional)
 * @param {string} label 
 * @param {string} message 
 * @param {any} error 
 */
export function errorLog(label, message, error = null) {
    const style = `color: #cc0000; font-weight: bold; background: #fff0f0; padding: 2px 6px; border-radius: 3px;`;
    if (error) {
        console.error(`%c[${label}]%c ${message}`, style, '', error);
    } else {
        console.error(`%c[${label}]%c ${message}`, style, '');
    }
}

/**
 * Warn logs (important but not critical)
 * @param {string} label 
 * @param {string} message 
 */
export function warnLog(label, message) {
    const style = `color: #ff9900; font-weight: bold; background: #fff9f0; padding: 2px 6px; border-radius: 3px;`;
    console.warn(`%c[${label}]%c ${message}`, style, '');
}

export default {
    isDebugEnabled,
    debugLog,
    errorLog,
    warnLog
};
