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

                // Only treat 401 as session expiry for authenticated requests.
                if (res.status === 401 && funcName !== 'rpc_login' && funcName !== 'rpc_initialize_admin') {
                    localStorage.removeItem('aspapp_session');
                    state.currentUser = null;
                    location.reload();
                    return { data: null, error: new Error('Sessão expirada. Por favor faça login novamente.') };
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
