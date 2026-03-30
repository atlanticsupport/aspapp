import { state } from './state.js';
import { viewerOverlay } from './dom.js';

export function normalizeGalleryAttachment(att, fallbackCategory = 'product') {
    if (!att) return null;

    const rawSortOrder = att.sort_order;
    const normalizedSortOrder =
        rawSortOrder === undefined || rawSortOrder === null || rawSortOrder === ''
            ? null
            : Number(rawSortOrder);

    return {
        ...att,
        category: att.category || fallbackCategory,
        type: att.type || att.file_type || 'image',
        file_type: att.file_type || att.type || 'image',
        sort_order: Number.isNaN(normalizedSortOrder) ? null : normalizedSortOrder
    };
}

export function getGallerySortOrder(item, fallback = Number.MAX_SAFE_INTEGER) {
    const order = Number(item?.sort_order);
    return Number.isFinite(order) ? order : fallback;
}

export function sortGalleryAttachments(list = []) {
    return [...list].sort((a, b) => {
        const orderDiff = getGallerySortOrder(a) - getGallerySortOrder(b);
        if (orderDiff !== 0) return orderDiff;

        const aCreated = a?.insertedAt || a?.created_at || '';
        const bCreated = b?.insertedAt || b?.created_at || '';
        if (aCreated !== bCreated) return String(aCreated).localeCompare(String(bCreated));

        return Number(a?.id || 0) - Number(b?.id || 0);
    });
}

export function buildGalleryEntries(options = {}) {
    const {
        attachments = [],
        pendingAttachments = [],
        currentImageUrl = null,
        attachmentCategory = 'product',
        acceptedTypes = ['image'],
        fallbackCategory = attachmentCategory,
        includePending = true,
        fallbackOnlyWhenEmpty = true
    } = options;

    const acceptedTypeSet = new Set(acceptedTypes);
    const entries = [];

    const matchesAttachment = att => {
        const normalized = normalizeGalleryAttachment(att, fallbackCategory);
        if (!normalized?.url) return false;
        if ((normalized.category || fallbackCategory) !== attachmentCategory) return false;
        return acceptedTypeSet.has(normalized.type || normalized.file_type || 'image');
    };

    const addEntry = entry => {
        if (!entry?.url) return;

        const existing = entries.find(item => item.url === entry.url);
        if (existing) {
            existing.attachmentId = existing.attachmentId ?? entry.attachmentId ?? null;
            existing.pendingId = existing.pendingId ?? entry.pendingId ?? null;
            existing.file = existing.file ?? entry.file ?? null;
            existing.sort_order = Math.min(
                getGallerySortOrder(existing),
                getGallerySortOrder(entry)
            );
            return;
        }

        entries.push({
            key: entry.key || `${entry.url}-${entries.length}`,
            url: entry.url,
            attachmentId: entry.attachmentId ?? null,
            pendingId: entry.pendingId ?? null,
            file: entry.file ?? null,
            category: entry.category || attachmentCategory,
            type: entry.type || 'image',
            file_type: entry.file_type || entry.type || 'image',
            sort_order: getGallerySortOrder(entry)
        });
    };

    sortGalleryAttachments(
        (attachments || [])
            .map(att => normalizeGalleryAttachment(att, fallbackCategory))
            .filter(matchesAttachment)
    ).forEach(att => {
        addEntry({
            key: `attachment:${att.id}`,
            url: att.url,
            attachmentId: att.id,
            category: att.category,
            type: att.type,
            file_type: att.file_type,
            sort_order: att.sort_order
        });
    });

    if (includePending) {
        sortGalleryAttachments(
            (pendingAttachments || [])
                .map(att => normalizeGalleryAttachment(att, fallbackCategory))
                .filter(matchesAttachment)
        ).forEach(att => {
            addEntry({
                key: `pending:${att.id}`,
                url: att.url,
                pendingId: att.id,
                file: att.file,
                category: att.category,
                type: att.type,
                file_type: att.file_type,
                sort_order: att.sort_order
            });
        });
    }

    const shouldFallbackToCurrentImage = fallbackOnlyWhenEmpty
        ? entries.length === 0
        : !!currentImageUrl;
    if (shouldFallbackToCurrentImage && currentImageUrl) {
        addEntry({
            key: `primary:${currentImageUrl}`,
            url: currentImageUrl,
            category: attachmentCategory,
            type: 'image',
            file_type: 'image',
            sort_order: -1
        });
    }

    return sortGalleryAttachments(entries).map((entry, index) => ({
        ...entry,
        isPrimary: index === 0,
        sort_order: index
    }));
}

export function getPrimaryGalleryEntry(options = {}) {
    const entries = buildGalleryEntries(options);
    if (!entries.length) return { entries, primary: null };
    return { entries, primary: entries[0] };
}

export function getEntityPrimaryImageUrl(entity, options = {}) {
    const { primary } = getPrimaryGalleryEntry({
        attachments: entity?.attachments || [],
        currentImageUrl: entity?.image_url || null,
        ...options
    });
    return primary?.url || null;
}

export function openViewerGallery(entries, preferredUrl = null) {
    if (!entries || entries.length === 0) return false;

    state.currentGallery = entries;
    const targetUrl = preferredUrl || entries[0]?.url || null;
    const selectedIndex = entries.findIndex(entry => entry.url === targetUrl);
    state.galleryIndex = selectedIndex >= 0 ? selectedIndex : 0;

    if (window.updateViewerFromGallery) window.updateViewerFromGallery();
    if (viewerOverlay) viewerOverlay.classList.add('open');
    return true;
}

export function openEntityGallery(entity, options = {}) {
    const entries = buildGalleryEntries({
        attachments: entity?.attachments || [],
        currentImageUrl: entity?.image_url || null,
        ...options
    });
    return openViewerGallery(entries, options.preferredUrl || null);
}
