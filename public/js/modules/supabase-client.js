// Este ficheiro foi 100% REPROGRAMADO para simular a API do Supabase
// mas utilizando apenas endpoints Cloudflare (Pages + D1 + R2) nativos!
import { state } from './state.js';

export let supabase = null;

export async function initSupabase() {
    if (supabase) return supabase;

    // Criamos um Supabase Client Virtual (Proxy).
    // O código existente da aplicação chama supabase.rpc() ou supabase.storage.upload(),
    // e nós secretamente traduzimos para chamadas REST ao Cloudflare Workers!

    supabase = {
        rpc: async (funcName, params) => {
            try {
                const reqBody = { rpc: funcName, params: { ...params } };

                // Include JWT if available
                if (state.currentUser && state.currentUser.token) {
                    reqBody.token = state.currentUser.token;
                    // Do not expose plaintext password on every request if we have a token
                    if (funcName !== 'rpc_login' && funcName !== 'rpc_manage_user') {
                        delete reqBody.params.p_pass;
                        delete reqBody.params.p_admin_pass;
                    }
                }

                const res = await fetch('/api/rpc', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(reqBody)
                });
                const result = await res.json();

                // Check for expired token
                if (res.status === 401 && result.error && result.error.includes('expirada')) {
                    // Try to refresh using stored credentials
                    const saved = localStorage.getItem('aspapp_session');
                    if (saved) {
                        const user = JSON.parse(saved);
                        if (user.username && user.password) {
                            // Re-login to get new token
                            const refreshRes = await fetch('/api/rpc', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    rpc: 'rpc_login',
                                    params: {
                                        p_username: user.username,
                                        p_password: user.password
                                    }
                                })
                            });
                            const refreshResult = await refreshRes.json();
                            if (refreshRes.ok && refreshResult.data && refreshResult.data[0]) {
                                // Update stored session
                                const updatedUser = refreshResult.data[0];
                                localStorage.setItem('aspapp_session', JSON.stringify(updatedUser));
                                state.currentUser = updatedUser;

                                // Retry original request with new token
                                reqBody.token = updatedUser.token;
                                const retryRes = await fetch('/api/rpc', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(reqBody)
                                });
                                const retryResult = await retryRes.json();
                                if (!retryRes.ok) throw new Error(retryResult.error || 'Server RPC falhou');
                                return { data: retryResult.data, error: null };
                            }
                        }
                    }
                }

                if (!res.ok) throw new Error(result.error || 'Server RPC falhou');
                return { data: result.data, error: null };
            } catch (err) {
                return { data: null, error: err };
            }
        },
        storage: {
            from: (bucketName) => ({
                upload: async (fileName, fileData) => {
                    try {
                        let base64;
                        if (fileData instanceof File || fileData instanceof Blob) {
                            const reader = new FileReader();
                            base64 = await new Promise((resolve) => {
                                reader.onloadend = () => resolve(reader.result);
                                reader.readAsDataURL(fileData);
                            });
                        } else {
                            base64 = fileData;
                        }

                        const res = await fetch('/api/storage/upload', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ bucket: bucketName, fileName, fileContentBase64: base64 })
                        });
                        const rs = await res.json();
                        if (!res.ok) throw new Error(rs.error);
                        return { data: rs.data, error: null };
                    } catch (e) {
                        return { data: null, error: e };
                    }
                },
                getPublicUrl: (fileName) => {
                    // O Cloudflare agora serve-nos os ficheiros diretamente através do mesmo site:
                    const cleanUrl = `/api/storage/file?name=${encodeURIComponent(fileName)}`;
                    return { data: { publicUrl: cleanUrl } };
                }
            })
        }
    };

    return supabase;
}
