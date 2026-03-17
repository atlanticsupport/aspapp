// This file is a placeholder for any missing global functions that were directly attached to window in app.js
// but haven't been migrated or properly exported yet.
// For now, it's empty as I've tried to attach relevant window functions in their respective modules.
export function init() {
    // any shim init
}

export function openViewer(url) {
    const viewerOverlay = document.getElementById('image-viewer');
    const viewerImg = document.getElementById('viewer-img');
    if (url && viewerImg && viewerOverlay) {
        viewerImg.src = url;
        viewerOverlay.classList.add('open');
    }
}

export function closeViewer() {
    const viewerOverlay = document.getElementById('image-viewer');
    if (viewerOverlay) viewerOverlay.classList.remove('open');
}
