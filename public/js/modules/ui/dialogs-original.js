
export const dialog = {
    confirm: (options) => {
        return new Promise((resolve) => {
            const {
                title = 'Confirmar',
                message = 'Tem a certeza?',
                confirmText = 'Continuar',
                cancelText = 'Cancelar',
                type = 'warning'
            } = typeof options === 'string' ? { message: options } : options;

            const overlay = document.createElement('div');
            overlay.className = 'dialog-overlay';

            let icon = 'fa-question';
            if (type === 'danger') icon = 'fa-triangle-exclamation';
            if (type === 'warning') icon = 'fa-circle-exclamation';
            if (type === 'info') icon = 'fa-circle-info';

            overlay.innerHTML = `
                <div class="dialog-card">
                    <button class="dialog-close" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
                    <div class="dialog-icon ${type}">
                        <i class="fa-solid ${icon}"></i>
                    </div>
                    <h3>${title}</h3>
                    <p>${message.replace(/\n/g, '<br>')}</p>
                    <div class="dialog-actions">
                        <button class="btn btn-dialog-cancel">${cancelText}</button>
                        <button class="btn btn-dialog-${type === 'danger' ? 'danger' : 'confirm'}">${confirmText}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            // Trigger animation
            setTimeout(() => overlay.classList.add('open'), 10);

            const close = (result) => {
                overlay.classList.remove('open');
                setTimeout(() => {
                    overlay.remove();
                    resolve(result);
                }, 300);
            };

            overlay.querySelector('.btn-dialog-cancel').onclick = () => close(false);
            overlay.querySelector('.btn-dialog-confirm, .btn-dialog-danger').onclick = () => close(true);
            const closeBtn = overlay.querySelector('.dialog-close');
            if (closeBtn) closeBtn.onclick = () => close(null);
            overlay.onclick = (e) => { if (e.target === overlay) close(null); };
        });
    },

    alert: (options) => {
        return new Promise((resolve) => {
            const {
                title = 'Aviso',
                message = '',
                buttonText = 'Entendido',
                type = 'info'
            } = typeof options === 'string' ? { message: options } : options;

            const overlay = document.createElement('div');
            overlay.className = 'dialog-overlay';

            let icon = 'fa-circle-info';
            if (type === 'success') icon = 'fa-circle-check';
            if (type === 'danger') icon = 'fa-circle-xmark';

            overlay.innerHTML = `
                <div class="dialog-card">
                    <div class="dialog-icon ${type}">
                        <i class="fa-solid ${icon}"></i>
                    </div>
                    <h3>${title}</h3>
                    <p>${message.replace(/\n/g, '<br>')}</p>
                    <div class="dialog-actions">
                        <button class="btn btn-dialog-confirm" style="width:100%">${buttonText}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            setTimeout(() => overlay.classList.add('open'), 10);

            const close = () => {
                overlay.classList.remove('open');
                setTimeout(() => {
                    overlay.remove();
                    resolve();
                }, 300);
            };

            overlay.querySelector('.btn-dialog-confirm').onclick = close;
            overlay.onclick = (e) => { if (e.target === overlay) close(); };
        });
    },

    choice: (options) => {
        return new Promise((resolve) => {
            const {
                title = 'Escolher Opção',
                choices = []
            } = options;

            const overlay = document.createElement('div');
            overlay.className = 'dialog-overlay';

            overlay.innerHTML = `
                <div class="dialog-card" style="max-width:350px;">
                    <button class="dialog-close" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
                    <h3 style="margin-bottom:1rem;">${title}</h3>
                    <div class="dialog-choices" style="display:grid; gap:10px; margin-top:0.5rem;">
                        ${choices.map(c => `
                            <button class="btn btn-dialog-confirm" data-value="${c.value}" style="width:100%; justify-content:center; padding:14px; border-radius:12px; background:${c.bg || ''}; color:${c.color || ''}; border: 1px solid ${c.border || 'transparent'}">
                                ${c.label}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            setTimeout(() => overlay.classList.add('open'), 10);

            const close = (result) => {
                overlay.classList.remove('open');
                setTimeout(() => {
                    overlay.remove();
                    resolve(result);
                }, 300);
            };

            overlay.querySelectorAll('.dialog-choices button').forEach(btn => {
                btn.onclick = () => close(btn.dataset.value);
            });

            const xBtn = overlay.querySelector('.dialog-close');
            if (xBtn) xBtn.onclick = () => close(null);
            overlay.onclick = (e) => { if (e.target === overlay) close(null); };
        });
    },

    prompt: (options) => {
        return new Promise((resolve) => {
            const {
                title = 'Introduzir Dados',
                message = '',
                placeholder = '',
                inputType = 'text',
                confirmText = 'Confirmar',
                cancelText = 'Cancelar'
            } = typeof options === 'string' ? { message: options } : options;

            const overlay = document.createElement('div');
            overlay.className = 'dialog-overlay';

            overlay.innerHTML = `
                <div class="dialog-card">
                    <button class="dialog-close" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
                    <h3>${title}</h3>
                    ${message ? `<p style="margin-bottom:1rem;">${message}</p>` : ''}
                    <div style="margin-bottom:1.5rem;">
                        <input type="${inputType}" id="dialog-prompt-input" placeholder="${placeholder}" 
                               style="width:100%; padding:12px; border-radius:8px; border:1px solid #e2e8f0; font-size:1rem;">
                    </div>
                    <div class="dialog-actions">
                        <button class="btn btn-dialog-cancel" style="flex:1;">${cancelText}</button>
                        <button class="btn btn-dialog-confirm" style="flex:1;">${confirmText}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            const input = overlay.querySelector('#dialog-prompt-input');
            setTimeout(() => {
                overlay.classList.add('open');
                input.focus();
            }, 10);

            const close = (result) => {
                overlay.classList.remove('open');
                setTimeout(() => {
                    overlay.remove();
                    resolve(result);
                }, 300);
            };

            input.onkeydown = (e) => { if (e.key === 'Enter') close(input.value); };
            overlay.querySelector('.btn-dialog-cancel').onclick = () => close(null);
            overlay.querySelector('.btn-dialog-confirm').onclick = () => close(input.value);
            overlay.querySelector('.dialog-close').onclick = () => close(null);
        });
    }
};
