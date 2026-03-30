export const state = {
    currentTransitId: null,
    currentProductId: null,
    currentProductKey: null,
    pendingAttachments: [],
    loadedAttachments: [],
    currentGallery: [],
    galleryIndex: 0,
    // Current User
    currentUser: null,
    appUsers: [],

    // App Data
    products: [],
    transitProducts: [],
    stockOutProducts: [],
    logisticsProducts: [],
    dashboardProducts: [],
    allProcesses: [],
    historyMovements: [],

    // Filters
    filterState: {
        status: 'all',
        category: 'all',
        location: 'all',
        box: 'all',
        pallet: 'all'
    },
    sortState: {
        column: 'created_at',
        ascending: false
    },
    columnFilters: {}, // Stores per-column manual filters
    transitFilterState: {
        search: '',
        view: 'active'
    },
    transitSortState: {
        column: 'sales_process',
        ascending: true
    },
    logisticsFilterState: {
        search: '',
        status: 'all',
        urgency: 'all'
    },
    logisticsSortState: {
        column: 'sales_process',
        ascending: true
    },
    stockOutFilterState: {
        search: '',
        status: 'all'
    },
    stockOutSortState: {
        column: 'sales_process',
        ascending: true
    },
    // We need to persist history filter state or define structure
    historyFilterState: {
        type: 'all',
        author: 'all',
        dateRange: 'all',
        search: '',
        startDate: '',
        endDate: ''
    },
    searchFields: JSON.parse(localStorage.getItem('searchFields')) || {
        part_number: true,
        name: true,
        maker: true,
        brand: true,
        sales_process: true,
        location: true,
        box: true,
        pallet: true,
        category: true
    },
    currentFilter: '', // Global search term for inventory

    // Pagination
    inventoryPage: 0,
    historyPage: 0,
    PAGE_SIZE: 20,
    totalInventoryCount: 0,
    totalHistoryCount: 0,

    // Prefetch / Cache
    prefetchedData: [],
    prefetchedPage: -1,
    prevCachedData: [],
    prevCachedPage: -1,

    historyPrefetchedData: [],
    historyPrefetchedPage: -1,
    historyPrevCachedData: [],
    historyPrevCachedPage: -1,

    // UI State
    columnSettings: JSON.parse(localStorage.getItem('columnSettings')) || {
        photo: true,
        part_number: true,
        name: true,
        location: false,
        box: true,
        pallet: true,
        category: true,
        sales_process: true,
        cost_price: false,
        quantity: true,
        status: false,
        actions: true,
        id: true,
        created_at: false,
        brand: true,
        min_quantity: false,
        description: false,
        image_url: false,
        maker: true,
        equipment: false,
        updated_at: false,
        is_deleted: false,
        order_to: false,
        order_date: false,
        ship_plant: true,
        delivery_time: false,
        local_price: false,
        author: false
    },

    // Chart Instances ref
    chartInstances: {}, // For destroying old charts

    // Transient State
    currentImageUrl: null,
    mainImageFile: null
};

// Ensure localStorage sync happens in modules that mutate this (ui/events)
