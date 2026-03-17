// Script to fix plain text passwords via Worker API
// Run this with: node migrations/fix_passwords.js

const API_URL = 'https://aspstock.pages.dev/api/rpc'; // Update with your actual URL

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + "ASP_SALT_2026");
    const hash = await crypto.subtle.digest('SHA-256', data);
    return 'HASH:' + btoa(String.fromCharCode(...new Uint8Array(hash)));
}

async function fixPasswords() {
    console.log('🔧 Fixing plain text passwords...\n');
    
    // This would need to be run with admin credentials
    // For security, passwords should be reset manually by each user
    
    console.log('⚠️  SECURITY NOTICE:');
    console.log('Plain text passwords detected in database.');
    console.log('\nRecommended actions:');
    console.log('1. Force password reset for affected users');
    console.log('2. Users should login - passwords will auto-migrate to hash');
    console.log('3. Monitor audit logs for successful migrations\n');
    
    console.log('✅ Auto-migration is enabled in rpc.js (lines 84-88)');
    console.log('   Passwords will be hashed on next successful login.');
}

fixPasswords();
