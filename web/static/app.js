/**
 * 18TUBE CLOUD INSPECTOR - APPLICATION LOGIC
 * Fast, reactive Vanilla JavaScript
 */

(function () {
    'use strict';

    // Application State
    const state = {
        driveInfo: null,
        driveSummary: null,
        driveCreators: [],
        selectedDriveCreator: null,
        driveFilesData: null,
        driveFilter: 'all',
        driveSort: 'name_asc',
        driveSearch: '',
        driveView: 'grid',

        // Overview Filter & Sort
        overviewCountryFilter: 'all',
        overviewSort: 'files_desc',

        localRoots: [],
        currentLocalRoot: '',
        localCreators: [],
        selectedLocalCreator: null,
        localFilesData: null,
        localFilter: 'all',
        localSearch: '',

        verifyTarget: 'kimxu1209',
        verifySource: 'drive',

        // Batch Audit State
        batchVerify: {
            running: false,
            results: [],
            summary: null,
            filter: 'all',
            search: '',
            timer: null
        }
    };

    // DOM Elements
    const elements = {
        // Tabs
        tabBtns: document.querySelectorAll('.tab-btn'),
        tabPanes: document.querySelectorAll('.tab-pane'),

        // Header Drive Info
        driveDot: document.getElementById('drive-dot'),
        driveStatusLabel: document.getElementById('drive-status-label'),
        driveAccountEmail: document.getElementById('drive-account-email'),
        driveQuotaFill: document.getElementById('drive-quota-fill'),
        driveQuotaText: document.getElementById('drive-quota-text'),
        driveQuotaPct: document.getElementById('drive-quota-pct'),
        driveStatusCard: document.getElementById('drive-status-card'),
        btnSetupDrive: document.getElementById('btn-setup-drive'),
        btnRefreshAll: document.getElementById('btn-refresh-all'),
        btnOpenDriveRoot: document.getElementById('btn-open-drive-root'),
        tabDriveCount: document.getElementById('tab-drive-count'),

        // Overview
        mCreatorsCount: document.getElementById('m-creators-count'),
        mTotalFiles: document.getElementById('m-total-files'),
        mFilesRatio: document.getElementById('m-files-ratio'),
        mCloudSize: document.getElementById('m-cloud-size'),
        mCloudQuota: document.getElementById('m-cloud-quota'),
        overviewBadge: document.getElementById('overview-badge'),
        overviewSearch: document.getElementById('overview-search'),
        btnOverviewSearchClear: document.getElementById('btn-overview-search-clear'),
        overviewSortSelect: document.getElementById('overview-sort-select'),
        overviewCountryRibbon: document.getElementById('overview-country-ribbon'),
        btnOverviewCountryLeft: document.getElementById('btn-overview-country-left'),
        btnOverviewCountryRight: document.getElementById('btn-overview-country-right'),
        overviewGrid: document.getElementById('overview-creators-grid'),

        // Drive Explorer
        driveSidebarCount: document.getElementById('drive-sidebar-count'),
        driveCreatorFilter: document.getElementById('drive-creator-filter'),
        driveNavList: document.getElementById('drive-creator-nav-list'),
        driveHeroName: document.getElementById('drive-hero-name'),
        driveHeroAvatar: document.getElementById('drive-hero-avatar'),
        driveHeroSub: document.getElementById('drive-hero-sub'),
        driveHeroLink: document.getElementById('drive-hero-link'),
        driveStatPhotos: document.getElementById('drive-stat-photos'),
        driveStatVideos: document.getElementById('drive-stat-videos'),
        driveStatSize: document.getElementById('drive-stat-size'),
        driveStatIssues: document.getElementById('drive-stat-issues'),
        driveStatIssuesBox: document.getElementById('drive-stat-issues-box'),
        driveFilterPills: document.getElementById('drive-type-filters'),
        driveFileSearch: document.getElementById('drive-file-search'),
        driveSortSelect: document.getElementById('drive-sort-select'),
        btnViewGrid: document.getElementById('btn-view-grid'),
        btnViewTable: document.getElementById('btn-view-table'),
        driveFilesGrid: document.getElementById('drive-files-grid'),
        driveFilesTableWrapper: document.getElementById('drive-files-table-wrapper'),
        driveFilesTbody: document.getElementById('drive-files-tbody'),
        cntFilterAll: document.getElementById('cnt-filter-all'),
        cntFilterPhoto: document.getElementById('cnt-filter-photo'),
        cntFilterVideo: document.getElementById('cnt-filter-video'),
        cntFilterIssue: document.getElementById('cnt-filter-issue'),

        // Local Explorer
        localRootSelect: document.getElementById('local-root-select'),
        btnOpenLocalExplorer: document.getElementById('btn-open-local-explorer'),
        localSidebarCount: document.getElementById('local-sidebar-count'),
        localNavList: document.getElementById('local-creator-nav-list'),
        localHeroName: document.getElementById('local-hero-name'),
        localHeroAvatar: document.getElementById('local-hero-avatar'),
        localHeroSub: document.getElementById('local-hero-sub'),
        localStatPhotos: document.getElementById('local-stat-photos'),
        localStatVideos: document.getElementById('local-stat-videos'),
        localStatSize: document.getElementById('local-stat-size'),
        localTypeFilters: document.getElementById('local-type-filters'),
        localFileSearch: document.getElementById('local-file-search'),
        localFilesGrid: document.getElementById('local-files-grid'),

        // Verify Mode Navigation
        btnModeBatch: document.getElementById('btn-mode-batch'),
        btnModeSingle: document.getElementById('btn-mode-single'),
        verifyBatchView: document.getElementById('verify-batch-view'),
        verifySingleView: document.getElementById('verify-single-view'),

        // Batch Verify
        btnStartBatchVerify: document.getElementById('btn-start-batch-verify'),
        btnStopBatchVerify: document.getElementById('btn-stop-batch-verify'),
        batchVerifySpinner: document.getElementById('batch-verify-spinner'),
        batchVerifyBtnText: document.getElementById('batch-verify-btn-text'),
        batchLastTime: document.getElementById('batch-last-time'),
        btnExportAuditCsv: document.getElementById('btn-export-audit-csv'),
        batchProgressCard: document.getElementById('batch-progress-card'),
        batchProgressStatus: document.getElementById('batch-progress-status'),
        batchProgressCurrent: document.getElementById('batch-progress-current'),
        batchProgressPct: document.getElementById('batch-progress-pct'),
        batchProgressFill: document.getElementById('batch-progress-fill'),
        kpiTotalCreators: document.getElementById('kpi-total-creators'),
        kpiCompleteCreators: document.getElementById('kpi-complete-creators'),
        kpiMissingCreators: document.getElementById('kpi-missing-creators'),
        kpiTotalMissingFiles: document.getElementById('kpi-total-missing-files'),
        kpiMissingBreakdown: document.getElementById('kpi-missing-breakdown'),
        batchTableBadge: document.getElementById('batch-table-badge'),
        batchStatusFilters: document.getElementById('batch-status-filters'),
        batchTableSearch: document.getElementById('batch-table-search'),
        batchAuditTbody: document.getElementById('batch-audit-tbody'),
        cntBatchAll: document.getElementById('cnt-batch-all'),
        cntBatchMissing: document.getElementById('cnt-batch-missing'),
        cntBatchComplete: document.getElementById('cnt-batch-complete'),
        cntBatchNotfound: document.getElementById('cnt-batch-notfound'),

        // Single Verify
        verifyInput: document.getElementById('verify-input'),
        verifySourceSelect: document.getElementById('verify-source-select'),
        btnStartVerify: document.getElementById('btn-start-verify'),
        verifySpinner: document.getElementById('verify-spinner'),
        verifyBtnText: document.getElementById('verify-btn-text'),
        verifySuggestChips: document.getElementById('verify-suggest-chips'),
        verifyResults: document.getElementById('verify-results'),
        verifyResultBanner: document.getElementById('verify-result-banner'),
        verifyStatusIcon: document.getElementById('verify-status-icon'),
        verifyResultTitle: document.getElementById('verify-result-title'),
        verifyResultDesc: document.getElementById('verify-result-desc'),
        verifyCompletionPct: document.getElementById('verify-completion-pct'),
        vOnlineTotal: document.getElementById('v-online-total'),
        vOnlinePhotos: document.getElementById('v-online-photos'),
        vOnlineVideos: document.getElementById('v-online-videos'),
        vStoredTotal: document.getElementById('v-stored-total'),
        vStoredPhotos: document.getElementById('v-stored-photos'),
        vStoredVideos: document.getElementById('v-stored-videos'),
        vStoredSize: document.getElementById('v-stored-size'),
        vStorageBadge: document.getElementById('v-storage-badge'),
        vDiffPhotos: document.getElementById('v-diff-photos'),
        vDiffVideos: document.getElementById('v-diff-videos'),
        vLocationText: document.getElementById('v-location-text'),
        verifyIssuesCard: document.getElementById('verify-issues-card'),
        verifyIssuesList: document.getElementById('verify-issues-list'),

        // Modals
        lightboxModal: document.getElementById('lightbox-modal'),
        lightboxImg: document.getElementById('lightbox-img'),
        lightboxTitle: document.getElementById('lightbox-title'),
        lightboxDownload: document.getElementById('lightbox-download'),
        lightboxClose: document.getElementById('lightbox-close'),

        videoModal: document.getElementById('video-modal'),
        videoPlayer: document.getElementById('html5-video-player'),
        videoModalTitle: document.getElementById('video-modal-title'),
        videoMetaInfo: document.getElementById('video-meta-info'),
        videoClose: document.getElementById('video-close'),
        toastContainer: document.getElementById('toast-container'),
    };

    // ==========================================
    // UTILITIES & FLAG MAPPING
    // ==========================================

    function stripAccents(str) {
        if (!str) return '';
        return String(str)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D');
    }

    const COUNTRIES_LIST = [
        { iso: 'vn', flag: '🇻🇳', name: 'Việt Nam', aliases: ['vn', 'vietnam', 'viet nam', '_vietnam'] },
        { iso: 'us', flag: '🇺🇸', name: 'Mỹ', aliases: ['us', 'usa', 'united states', 'my', '_usa', '_us', 'hoa ky'] },
        { iso: 'gb', flag: '🇬🇧', name: 'Anh', aliases: ['gb', 'uk', 'england', 'united kingdom', 'anh', '_uk', '_gb', 'vuong quoc anh'] },
        { iso: 'kr', flag: '🇰🇷', name: 'Hàn Quốc', aliases: ['kr', 'korea', 'south korea', 'han quoc', '_korea', '_kr'] },
        { iso: 'jp', flag: '🇯🇵', name: 'Nhật Bản', aliases: ['jp', 'japan', 'nhat ban', '_japan', '_jp'] },
        { iso: 'cn', flag: '🇨🇳', name: 'Trung Quốc', aliases: ['cn', 'china', 'trung quoc', '_china', '_cn'] },
        { iso: 'th', flag: '🇹🇭', name: 'Thái Lan', aliases: ['th', 'thailand', 'thai lan', '_thailand', '_th'] },
        { iso: 'tw', flag: '🇹🇼', name: 'Đài Loan', aliases: ['tw', 'taiwan', 'dai loan', '_taiwan', '_tw'] },
        { iso: 'my', flag: '🇲🇾', name: 'Malaysia', aliases: ['my', 'malaysia', '_malaysia'] },
        { iso: 'sg', flag: '🇸🇬', name: 'Singapore', aliases: ['sg', 'singapore', '_singapore'] },
        { iso: 'id', flag: '🇮🇩', name: 'Indonesia', aliases: ['id', 'indonesia', '_indonesia'] },
        { iso: 'pl', flag: '🇵🇱', name: 'Ba Lan', aliases: ['pl', 'poland', 'ba lan', '_poland', '_pl'] },
        { iso: 'au', flag: '🇦🇺', name: 'Úc', aliases: ['au', 'australia', 'uc', '_australia', '_au'] },
        { iso: 'ru', flag: '🇷🇺', name: 'Nga', aliases: ['ru', 'russia', 'nga', '_russia', '_ru'] },
        { iso: 'fr', flag: '🇫🇷', name: 'Pháp', aliases: ['fr', 'france', 'phap', '_france', '_fr'] },
        { iso: 'de', flag: '🇩🇪', name: 'Đức', aliases: ['de', 'germany', 'deutschland', 'duc', '_germany', '_de'] },
        { iso: 'it', flag: '🇮🇹', name: 'Ý', aliases: ['it', 'italy', 'italia', 'y', '_italy', '_it'] },
        { iso: 'es', flag: '🇪🇸', name: 'Tây Ban Nha', aliases: ['es', 'spain', 'tay ban nha', '_spain', '_es'] },
        { iso: 'ca', flag: '🇨🇦', name: 'Canada', aliases: ['ca', 'canada', '_canada', '_ca'] },
        { iso: 'ph', flag: '🇵🇭', name: 'Philippines', aliases: ['ph', 'philippines', '_philippines', '_ph'] },
        { iso: 'in', flag: '🇮🇳', name: 'Ấn Độ', aliases: ['in', 'india', 'an do', '_india', '_in'] },
        { iso: 'br', flag: '🇧🇷', name: 'Brazil', aliases: ['br', 'brazil', 'brasil', '_brazil', '_br'] },
        { iso: 'mx', flag: '🇲🇽', name: 'Mexico', aliases: ['mx', 'mexico', '_mexico', '_mx'] },
        { iso: 'nl', flag: '🇳🇱', name: 'Hà Lan', aliases: ['nl', 'netherlands', 'holland', 'ha lan', '_netherlands', '_nl'] },
        { iso: 'se', flag: '🇸🇪', name: 'Thụy Điển', aliases: ['se', 'sweden', 'thuy dien', '_sweden', '_se'] },
        { iso: 'ch', flag: '🇨🇭', name: 'Thụy Sĩ', aliases: ['ch', 'switzerland', 'thuy si', '_switzerland', '_ch'] },
        { iso: 'be', flag: '🇧🇪', name: 'Bỉ', aliases: ['be', 'belgium', 'bi', '_belgium', '_be'] },
        { iso: 'pt', flag: '🇵🇹', name: 'Bồ Đào Nha', aliases: ['pt', 'portugal', 'bo dao nha', '_portugal', '_pt'] },
        { iso: 'ar', flag: '🇦🇷', name: 'Argentina', aliases: ['ar', 'argentina', '_argentina', '_ar'] },
        { iso: 'co', flag: '🇨🇴', name: 'Colombia', aliases: ['co', 'colombia', '_colombia', '_co'] },
        { iso: 'ua', flag: '🇺🇦', name: 'Ukraine', aliases: ['ua', 'ukraine', '_ukraine', '_ua'] },
        { iso: 'hk', flag: '🇭🇰', name: 'Hồng Kông', aliases: ['hk', 'hongkong', 'hong kong', 'hong_kong', '_hongkong', '_hong_kong', '_hk'] },
    ];

    const COUNTRY_LOOKUP_MAP = {};
    COUNTRIES_LIST.forEach(c => {
        COUNTRY_LOOKUP_MAP[c.iso.toLowerCase()] = c;
        COUNTRY_LOOKUP_MAP[c.name.toLowerCase()] = c;
        COUNTRY_LOOKUP_MAP[stripAccents(c.name.toLowerCase())] = c;
        c.aliases.forEach(a => {
            const al = a.toLowerCase();
            COUNTRY_LOOKUP_MAP[al] = c;
            COUNTRY_LOOKUP_MAP[stripAccents(al)] = c;
            const noUnderscore = al.replace(/^_/, '');
            COUNTRY_LOOKUP_MAP[noUnderscore] = c;
            COUNTRY_LOOKUP_MAP[stripAccents(noUnderscore)] = c;
        });
    });

    function getCountryInfo(nameOrCode) {
        if (!nameOrCode || nameOrCode === 'all' || nameOrCode === '__all__') {
            return { iso: '', flag: '🌍', name: 'Tất cả' };
        }
        const str = String(nameOrCode).trim();
        const lower = str.toLowerCase();
        if (COUNTRY_LOOKUP_MAP[lower]) return COUNTRY_LOOKUP_MAP[lower];
        
        const stripped = lower.replace(/^_/, '');
        if (COUNTRY_LOOKUP_MAP[stripped]) return COUNTRY_LOOKUP_MAP[stripped];
        
        const noAcc = stripAccents(stripped);
        if (COUNTRY_LOOKUP_MAP[noAcc]) return COUNTRY_LOOKUP_MAP[noAcc];

        return { iso: '', flag: '🌐', name: str.replace(/^_/, '') };
    }

    function getCountryFlagHtml(nameOrCode) {
        if (!nameOrCode || nameOrCode === 'all') {
            return '<span class="country-flag-icon">🌍</span>';
        }
        const info = getCountryInfo(nameOrCode);
        if (info.iso) {
            return `<img class="country-flag-icon-img" src="https://flagcdn.com/28x21/${info.iso}.png" srcset="https://flagcdn.com/56x42/${info.iso}.png 2x" width="18" height="14" alt="${info.name}" title="${info.name}" onerror="this.outerHTML='<span>${info.flag}</span>'">`;
        }
        return `<span>${info.flag || '🌐'}</span>`;
    }

    const GRADIENT_PALETTES = [
        'linear-gradient(135deg, #0284c7, #06b6d4)', // Cyan Sky
        'linear-gradient(135deg, #7c3aed, #a855f7)', // Purple Lavender
        'linear-gradient(135deg, #059669, #10b981)', // Emerald Mint
        'linear-gradient(135deg, #ea580c, #f59e0b)', // Amber Sunset
        'linear-gradient(135deg, #e11d48, #f43f5e)', // Rose Coral
        'linear-gradient(135deg, #4f46e5, #6366f1)', // Indigo Royal
        'linear-gradient(135deg, #0d9488, #14b8a6)', // Teal Marine
        'linear-gradient(135deg, #c026d3, #e879f9)', // Fuchsia Magenta
    ];

    function getAvatarGradient(name) {
        if (!name) return GRADIENT_PALETTES[0];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % GRADIENT_PALETTES.length;
        return GRADIENT_PALETTES[index];
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span>${message}</span>`;
        elements.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    function formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        } catch {
            return dateStr;
        }
    }

    // ==========================================
    // TABS MANAGEMENT
    // ==========================================

    function initTabs() {
        elements.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                elements.tabBtns.forEach(b => b.classList.remove('active'));
                elements.tabPanes.forEach(p => p.classList.remove('active'));

                btn.classList.add('active');
                const targetPane = document.getElementById(targetTab);
                if (targetPane) targetPane.classList.add('active');

                // Tải dữ liệu bổ sung tương ứng nếu chuyển tab
                if (targetTab === 'tab-drive' && !state.selectedDriveCreator && state.driveCreators.length > 0) {
                    selectDriveCreator(state.driveCreators[0].slug);
                } else if (targetTab === 'tab-local' && state.localCreators.length === 0) {
                    loadLocalCreators();
                }
            });
        });
    }

    // ==========================================
    // DRIVE DATA LOADERS
    // ==========================================

    async function loadDriveInfo(force = false) {
        try {
            const res = await fetch(`/api/drive/info?force=${force ? '1' : '0'}`);
            const data = await res.json();
            if (data.success && data.data) {
                state.driveInfo = data.data;
                renderDriveInfo(data.data);
            }
        } catch (err) {
            console.error('Error fetching drive info:', err);
            elements.driveStatusLabel.textContent = 'Mất kết nối Drive';
            elements.driveDot.style.background = 'var(--accent-rose)';
        }
    }

    function renderDriveInfo(info) {
        if (info.status === 'connected') {
            elements.driveStatusLabel.textContent = 'Google Drive Sẵn sàng';
            elements.driveDot.style.background = 'var(--accent-emerald)';
            elements.driveAccountEmail.textContent = info.email || 'gg:18TUBE';
            elements.driveQuotaFill.style.width = `${Math.min(100, info.percent_used || 0)}%`;
            elements.driveQuotaText.textContent = `${info.used_str} / ${info.total_str}`;
            elements.driveQuotaPct.textContent = `${info.percent_used || 0}%`;

            elements.mCloudSize.textContent = info.used_str || '0 GB';
            elements.mCloudQuota.textContent = `Tổng gói: ${info.total_str || '5.0 TB'}`;
        } else {
            elements.driveStatusLabel.textContent = info.status_text || 'Chưa kết nối';
            elements.driveDot.style.background = 'var(--accent-amber)';
            elements.driveAccountEmail.textContent = info.message || '--';
        }
    }

    async function loadDriveQuickCreators() {
        try {
            const res = await fetch('/api/drive/creators');
            const data = await res.json();
            if (data.success && data.creators && data.creators.length > 0) {
                if (!state.driveSummary) {
                    state.driveCreators = data.creators;
                    elements.mCreatorsCount.textContent = data.creators.length;
                    elements.overviewBadge.textContent = `${data.creators.length} Creator`;
                    elements.tabDriveCount.textContent = data.creators.length;
                    elements.driveSidebarCount.textContent = data.creators.length;
                    
                    if (data.total_files !== undefined && data.total_files > 0) {
                        elements.mTotalFiles.textContent = data.total_files.toLocaleString('vi-VN');
                        const pCnt = data.total_photos || 0;
                        const vCnt = data.total_videos || 0;
                        elements.mFilesRatio.textContent = `${pCnt.toLocaleString('vi-VN')} Ảnh / ${vCnt.toLocaleString('vi-VN')} Video`;
                    }
                    
                    renderOverviewCountryRibbon(data.creators);
                    renderDriveSidebar(data.creators);
                    renderVerifyChips(data.creators);
                    renderOverviewCards(data.creators);
                }
            }
        } catch (err) {
            console.error('Error fetching quick creators:', err);
        }
    }

    async function loadDriveSummary(refresh = false) {
        try {
            const res = await fetch(`/api/drive/summary_all?refresh=${refresh ? '1' : '0'}`);
            if (!res.ok) {
                console.warn('drive summary_all status:', res.status);
                return;
            }
            const data = await res.json();
            if (data.success && data.data) {
                state.driveSummary = data.data;
                const newCreators = data.data.creators || [];
                if (newCreators.length >= (state.driveCreators ? state.driveCreators.length : 0)) {
                    state.driveCreators = newCreators;
                } else if (state.driveCreators && state.driveCreators.length > 0) {
                    // Trộn thông tin số lượng file mà không làm mất danh sách creator hiện tại
                    const countMap = {};
                    newCreators.forEach(c => {
                        countMap[c.slug] = c;
                        if (c.name) countMap[c.name] = c;
                    });
                    state.driveCreators.forEach(c => {
                        const m = countMap[c.slug] || countMap[c.name];
                        if (m) {
                            c.photos_count = m.photos_count || c.photos_count;
                            c.videos_count = m.videos_count || c.videos_count;
                            c.total_files = m.total_files || c.total_files;
                            c.total_size = m.total_size || c.total_size;
                            c.total_size_str = m.total_size_str || c.total_size_str;
                        }
                    });
                } else {
                    state.driveCreators = newCreators;
                }
                renderOverview(data.data);
                renderDriveSidebar(state.driveCreators);
                renderVerifyChips(state.driveCreators);

                // Nếu tổng số file đang là 0 hoặc chưa đầy đủ, tự động kiểm tra lại sau 8 giây để cập nhật khi nền quét xong
                if ((data.data.total_files || 0) < 500 && !window._summary_retry_timer) {
                    window._summary_retry_timer = setTimeout(() => {
                        window._summary_retry_timer = null;
                        loadDriveSummary(false);
                    }, 8000);
                }
            }
        } catch (err) {
            console.error('Error fetching drive summary:', err);
        }
    }

    function renderOverview(summary) {
        const totalCreators = summary.total_creators || 0;
        const totalFiles = summary.total_files || 0;
        elements.mCreatorsCount.textContent = totalCreators;
        elements.mTotalFiles.textContent = totalFiles.toLocaleString('vi-VN');
        elements.tabDriveCount.textContent = totalCreators;
        elements.driveSidebarCount.textContent = totalCreators;

        // Tính tổng ảnh và video
        let totalPhotos = 0;
        let totalVideos = 0;
        (summary.creators || []).forEach(c => {
            totalPhotos += c.photos_count || 0;
            totalVideos += c.videos_count || 0;
        });
        elements.mFilesRatio.textContent = `${totalPhotos.toLocaleString('vi-VN')} Ảnh / ${totalVideos.toLocaleString('vi-VN')} Video`;

        // Render Country Filter Ribbon & Cards Grid
        renderOverviewCountryRibbon(summary.creators || []);
        renderOverviewCards(summary.creators || []);
    }

    function renderOverviewCountryRibbon(creators) {
        if (!elements.overviewCountryRibbon) return;

        // Thống kê số creator theo quốc gia
        const countryCounts = {};
        creators.forEach(c => {
            const countryName = c.country || 'Việt Nam';
            countryCounts[countryName] = (countryCounts[countryName] || 0) + 1;
        });

        const sortedCountries = Object.keys(countryCounts).sort((a, b) => {
            if (a === 'Việt Nam') return -1;
            if (b === 'Việt Nam') return 1;
            return a.localeCompare(b);
        });

        let ribbonHtml = `
            <span class="country-chip ${state.overviewCountryFilter === 'all' ? 'active' : ''}" data-country="all">
                <span class="country-flag-icon">🌍</span>
                <span class="country-name-text">Tất cả</span>
                <span class="country-count-pill">${creators.length}</span>
            </span>
        `;

        sortedCountries.forEach(cntry => {
            const isActive = state.overviewCountryFilter === cntry ? 'active' : '';
            const flagHtml = getCountryFlagHtml(cntry);
            ribbonHtml += `
                <span class="country-chip ${isActive}" data-country="${cntry}">
                    ${flagHtml}
                    <span class="country-name-text">${cntry}</span>
                    <span class="country-count-pill">${countryCounts[cntry]}</span>
                </span>
            `;
        });

        elements.overviewCountryRibbon.innerHTML = ribbonHtml;

        // Gắn sự kiện click chọn quốc gia
        elements.overviewCountryRibbon.querySelectorAll('.country-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const cName = chip.getAttribute('data-country');
                state.overviewCountryFilter = cName;
                elements.overviewCountryRibbon.querySelectorAll('.country-chip').forEach(c => {
                    c.classList.toggle('active', c.getAttribute('data-country') === cName);
                });
                renderOverviewCards(state.driveCreators || []);
            });
        });
    }

    function renderOverviewCards(creators) {
        const query = elements.overviewSearch ? elements.overviewSearch.value.trim().toLowerCase() : '';
        let filtered = creators.filter(c => {
            const matchesQuery = !query || c.slug.toLowerCase().includes(query) || (c.country && c.country.toLowerCase().includes(query));
            const matchesCountry = state.overviewCountryFilter === 'all' || (c.country || 'Việt Nam') === state.overviewCountryFilter;
            return matchesQuery && matchesCountry;
        });

        // Sắp xếp (Sorting)
        const sort = state.overviewSort || 'files_desc';
        if (sort === 'files_desc') {
            filtered.sort((a, b) => (b.total_files || 0) - (a.total_files || 0));
        } else if (sort === 'size_desc') {
            filtered.sort((a, b) => (b.total_size || 0) - (a.total_size || 0));
        } else if (sort === 'videos_desc') {
            filtered.sort((a, b) => (b.videos_count || 0) - (a.videos_count || 0));
        } else if (sort === 'photos_desc') {
            filtered.sort((a, b) => (b.photos_count || 0) - (a.photos_count || 0));
        } else if (sort === 'name_asc') {
            filtered.sort((a, b) => (a.name || a.slug).localeCompare(b.name || b.slug));
        }

        if (elements.overviewBadge) {
            elements.overviewBadge.textContent = `${filtered.length} Creator`;
        }

        if (filtered.length === 0) {
            elements.overviewGrid.innerHTML = `
                <div class="empty-placeholder">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <span>Không tìm thấy creator nào phù hợp</span>
                </div>
            `;
            return;
        }

        elements.overviewGrid.innerHTML = filtered.map(c => {
            const initial = (c.name || c.slug.split('/').pop() || 'C').charAt(0).toUpperCase();
            const avatarBg = getAvatarGradient(c.name || c.slug);
            const flagHtml = getCountryFlagHtml(c.country);
            const countryName = c.country || 'Việt Nam';
            const countryTag = (c.country && c.country !== 'Việt Nam') 
                ? `<span class="creator-country-tag">${flagHtml} ${countryName}</span>` 
                : `<span class="creator-country-tag default">${flagHtml}</span>`;

            return `
                <div class="creator-card" data-slug="${c.slug}">
                    <div class="creator-card-header">
                        <div class="creator-avatar-box" style="background: ${avatarBg};">
                            <span>${initial}</span>
                        </div>
                        <div class="creator-info">
                            <div class="creator-title-row">
                                ${countryTag}
                                <h4 class="creator-title" title="${c.name || c.slug}">${c.name || c.slug}</h4>
                            </div>
                            <div class="creator-meta-line">
                                <span>📦 ${(c.total_files || 0).toLocaleString('vi-VN')} tệp</span>
                                <span>•</span>
                                <span>${countryName}</span>
                            </div>
                        </div>
                    </div>
                    <div class="creator-card-stats">
                        <div class="substat-item">
                            <span class="substat-val">${(c.photos_count || 0).toLocaleString('vi-VN')}</span>
                            <span class="substat-lbl">📸 Ảnh</span>
                        </div>
                        <div class="substat-item">
                            <span class="substat-val">${(c.videos_count || 0).toLocaleString('vi-VN')}</span>
                            <span class="substat-lbl">🎬 Video</span>
                        </div>
                        <div class="substat-item">
                            <span class="substat-val">${c.total_size_str || '0 B'}</span>
                            <span class="substat-lbl">💾 Dung lượng</span>
                        </div>
                    </div>
                    <div class="creator-card-footer">
                        <span class="badge badge-success">
                            <span class="pulse-dot-mini"></span> Sẵn sàng
                        </span>
                        <div class="card-footer-btns">
                            <a href="/gallery?creator=${encodeURIComponent(c.slug)}" target="_blank" class="btn btn-secondary btn-sm btn-gallery-jump" title="Mở trình xem Gallery cho Creator này" data-slug="${c.slug}">
                                🎬 Gallery
                            </a>
                            <button class="btn btn-primary btn-sm btn-inspect-drive" data-slug="${c.slug}" title="Kiểm tra chi tiết file trên Inspector">
                                Khám phá →
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Gắn sự kiện click
        elements.overviewGrid.querySelectorAll('.creator-card').forEach(card => {
            const slug = card.getAttribute('data-slug');
            
            // Nút Khám phá
            const inspectBtn = card.querySelector('.btn-inspect-drive');
            if (inspectBtn) {
                inspectBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    switchToDriveTabAndSelect(slug);
                });
            }

            // Nút Gallery jump
            const galleryBtn = card.querySelector('.btn-gallery-jump');
            if (galleryBtn) {
                galleryBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                });
            }

            // Click vào toàn card
            card.addEventListener('click', () => {
                switchToDriveTabAndSelect(slug);
            });
        });
    }

    function switchToDriveTabAndSelect(slug) {
        state.selectedDriveCreator = slug;
        document.getElementById('nav-tab-drive').click();
        selectDriveCreator(slug);
    }

    function renderDriveSidebar(creators) {
        const query = (elements.driveCreatorFilter.value || '').trim().toLowerCase();
        const filtered = creators.filter(c => c.slug.toLowerCase().includes(query) || (c.country && c.country.toLowerCase().includes(query)));

        elements.driveNavList.innerHTML = filtered.map(c => {
            const isActive = state.selectedDriveCreator === c.slug ? 'active' : '';
            const flagHtml = getCountryFlagHtml(c.country);
            return `
                <li class="creator-nav-item ${isActive}" data-slug="${c.slug}">
                    <span class="nav-item-title">${flagHtml} ${c.name || c.slug}</span>
                    <span class="count-pill">${(c.total_files || 0).toLocaleString('vi-VN')}</span>
                </li>
            `;
        }).join('');

        elements.driveNavList.querySelectorAll('.creator-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const slug = item.getAttribute('data-slug');
                selectDriveCreator(slug);
            });
        });
    }

    async function selectDriveCreator(slug) {
        if (!slug) return;
        state.selectedDriveCreator = slug;

        // Cập nhật active sidebar
        document.querySelectorAll('#drive-creator-nav-list .creator-nav-item').forEach(it => {
            if (it.getAttribute('data-slug') === slug) it.classList.add('active');
            else it.classList.remove('active');
        });

        // Cập nhật Hero Banner
        const creatorObj = (state.driveCreators || []).find(c => c.slug === slug);
        const displayName = creatorObj ? (creatorObj.country && creatorObj.country !== 'Việt Nam' ? `[${creatorObj.country}] ${creatorObj.name || slug}` : (creatorObj.name || slug)) : slug;
        const initial = (creatorObj?.name || slug.split('/').pop() || slug).charAt(0).toUpperCase();
        elements.driveHeroName.textContent = displayName;
        elements.driveHeroAvatar.textContent = initial;
        elements.driveHeroSub.textContent = `Đang quét dữ liệu chi tiết từ gg:18TUBE/${slug}...`;
        elements.driveFilesGrid.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <span>Đang quét danh sách file trên Google Drive (${displayName})...</span>
            </div>
        `;

        try {
            const res = await fetch(`/api/drive/creator/${slug}`);
            const data = await res.json();
            if (data.success && data.data) {
                state.driveFilesData = data.data;
                renderDriveCreatorDetails(data.data);

                // Cập nhật ngay số lượng file vào danh sách và count-pill ở sidebar
                const creatorItem = (state.driveCreators || []).find(c => c.slug === slug || (c.name && c.name === slug.split('/').pop()));
                if (creatorItem) {
                    creatorItem.photos_count = data.data.photos_count || 0;
                    creatorItem.videos_count = data.data.videos_count || 0;
                    creatorItem.total_files = data.data.total_items || 0;
                    creatorItem.total_size = data.data.total_size || 0;
                    creatorItem.total_size_str = data.data.total_size_str || '0 B';

                    const itemPill = document.querySelector(`#drive-creator-nav-list .creator-nav-item[data-slug="${slug}"] .count-pill`);
                    if (itemPill) {
                        itemPill.textContent = (data.data.total_items || 0).toLocaleString('vi-VN');
                    }
                }
            } else {
                showToast(data.error || 'Lỗi khi tải chi tiết creator', 'error');
            }
        } catch (err) {
            console.error('Error fetching creator files:', err);
            showToast('Không thể kết nối máy chủ để tải file', 'error');
        }
    }

    function renderDriveCreatorDetails(data) {
        const creatorName = data.name || (data.slug ? data.slug.split('/').pop() : '');
        const displayHero = (data.country && data.country !== 'Việt Nam' ? `[${data.country}] ` : '') + creatorName;
        elements.driveHeroName.textContent = displayHero;
        elements.driveHeroSub.textContent = `Tổng cộng ${data.total_items} tệp tin media đã được bảo toàn`;
        elements.driveStatPhotos.textContent = data.photos_count || 0;
        elements.driveStatVideos.textContent = data.videos_count || 0;
        elements.driveStatSize.textContent = data.total_size_str || '0 B';
        elements.driveStatIssues.textContent = data.issues_count || 0;

        if (data.issues_count > 0) {
            elements.driveStatIssuesBox.style.display = 'flex';
        } else {
            elements.driveStatIssuesBox.style.display = 'flex';
        }

        // Link Drive folder
        const creatorSummary = (state.driveCreators || []).find(c => c.slug === data.slug);
        if (creatorSummary && creatorSummary.drive_url) {
            elements.driveHeroLink.href = creatorSummary.drive_url;
            elements.driveHeroLink.style.display = 'inline-flex';
        } else {
            elements.driveHeroLink.href = `https://drive.google.com/drive/u/0/my-drive`;
        }

        // Cập nhật số đếm filter
        elements.cntFilterAll.textContent = data.total_items;
        elements.cntFilterPhoto.textContent = data.photos_count;
        elements.cntFilterVideo.textContent = data.videos_count;
        elements.cntFilterIssue.textContent = data.issues_count;

        filterAndRenderDriveFiles();
    }

    function filterAndRenderDriveFiles() {
        if (!state.driveFilesData) return;

        let files = [];
        if (state.driveFilter === 'all') {
            files = [...state.driveFilesData.photos, ...state.driveFilesData.videos];
        } else if (state.driveFilter === 'photo') {
            files = [...state.driveFilesData.photos];
        } else if (state.driveFilter === 'video') {
            files = [...state.driveFilesData.videos];
        } else if (state.driveFilter === 'issue') {
            files = [...state.driveFilesData.issues];
        }

        // Search text filter
        const query = elements.driveFileSearch.value.trim().toLowerCase();
        if (query) {
            files = files.filter(f => f.name.toLowerCase().includes(query) || f.path.toLowerCase().includes(query));
        }

        // Sắp xếp
        const sortVal = elements.driveSortSelect.value;
        if (sortVal === 'name_asc') {
            files.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortVal === 'name_desc') {
            files.sort((a, b) => b.name.localeCompare(a.name));
        } else if (sortVal === 'size_desc') {
            files.sort((a, b) => b.size - a.size);
        } else if (sortVal === 'size_asc') {
            files.sort((a, b) => a.size - b.size);
        } else if (sortVal === 'date_desc') {
            files.sort((a, b) => (b.mod_time || '').localeCompare(a.mod_time || ''));
        }

        if (state.driveView === 'grid') {
            renderDriveFilesGrid(files);
        } else {
            renderDriveFilesTable(files);
        }
    }

    function renderDriveFilesGrid(files) {
        elements.driveFilesGrid.style.display = 'grid';
        elements.driveFilesTableWrapper.style.display = 'none';

        if (files.length === 0) {
            elements.driveFilesGrid.innerHTML = `
                <div class="empty-placeholder">
                    <span>Không có tệp nào phù hợp với bộ lọc</span>
                </div>
            `;
            return;
        }

        elements.driveFilesGrid.innerHTML = files.map(f => {
            const isVideo = isVideoFile(f.name);
            const isPhoto = !isVideo;
            const badgeClass = isPhoto ? 'photo' : 'video';
            const badgeText = isPhoto ? 'ẢNH' : 'VIDEO';
            const thumbSrc = f.thumbnail_url || (f.id ? `https://lh3.googleusercontent.com/d/${f.id}=w500` : f.stream_url);
            const fallbackSrc = f.id ? `/api/media/thumbnail?id=${f.id}&proxy=1` : '/static/placeholder.svg';

            return `
                <div class="file-card">
                    <div class="file-thumb" data-type="${isVideo ? 'video' : 'photo'}" data-src="${f.stream_url}" data-title="${f.name}">
                        <span class="file-badge-type ${badgeClass}">${badgeText}</span>
                        <img src="${thumbSrc}" alt="${f.name}" loading="lazy" onerror="if(this.getAttribute('data-err')!=='1'){this.setAttribute('data-err','1');this.src='${fallbackSrc}';}else{this.src='/static/placeholder.svg';}">
                        ${isVideo ? `
                            <div class="file-play-overlay">▶</div>
                        ` : ''}
                    </div>
                    <div class="file-info">
                        <span class="file-title" title="${f.name}">${f.name}</span>
                        <div class="file-meta-row">
                            <span>${f.size_str}</span>
                            <span>${formatDate(f.mod_time)}</span>
                        </div>
                        <div class="file-actions-row">
                            <button class="btn btn-primary btn-sm btn-preview-drive-media" data-type="${isVideo ? 'video' : 'photo'}" data-src="${f.stream_url}" data-title="${f.name}">
                                ${isVideo ? 'Phát Video' : 'Xem Ảnh'}
                            </button>
                            ${f.drive_view_url ? `
                                <a href="${f.drive_view_url}" target="_blank" class="btn btn-secondary btn-sm" title="Mở file trên Drive">
                                    Drive ↗
                                </a>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Gắn sự kiện phát / xem ảnh trực tiếp từ Google Drive
        elements.driveFilesGrid.querySelectorAll('.file-thumb, .btn-preview-drive-media').forEach(el => {
            el.addEventListener('click', () => {
                const mType = el.getAttribute('data-type');
                const mSrc = el.getAttribute('data-src');
                const mTitle = el.getAttribute('data-title');
                if (mSrc) openMediaModal(mType, mSrc, mTitle);
            });
        });
    }

    function renderDriveFilesTable(files) {
        elements.driveFilesGrid.style.display = 'none';
        elements.driveFilesTableWrapper.style.display = 'block';

        if (files.length === 0) {
            elements.driveFilesTbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-muted)">
                        Không có tệp tin nào
                    </td>
                </tr>
            `;
            return;
        }

        elements.driveFilesTbody.innerHTML = files.map(f => {
            const isVideo = isVideoFile(f.name);
            return `
                <tr>
                    <td>${isVideo ? '🎬' : '📸'}</td>
                    <td style="font-weight: 500">${f.name}</td>
                    <td style="color: var(--text-muted); font-family: var(--font-mono); font-size: 0.76rem">${f.path || f.name}</td>
                    <td><strong>${f.size_str}</strong></td>
                    <td style="color: var(--text-muted)">${formatDate(f.mod_time)}</td>
                    <td>
                        <span class="badge ${f.is_empty ? 'badge-danger' : 'badge-success'}">
                            ${f.is_empty ? 'Lỗi (0B)' : '✓ Đầy đủ'}
                        </span>
                    </td>
                    <td style="text-align: right">
                        <button class="btn btn-primary btn-sm btn-preview-drive-table" data-type="${isVideo ? 'video' : 'photo'}" data-src="${f.stream_url}" data-title="${f.name}" style="margin-right: 4px;">
                            ${isVideo ? 'Phát ▶' : 'Xem 📸'}
                        </button>
                        ${f.drive_view_url ? `
                            <a href="${f.drive_view_url}" target="_blank" class="btn btn-secondary btn-sm">Drive ↗</a>
                        ` : '--'}
                    </td>
                </tr>
            `;
        }).join('');

        elements.driveFilesTableWrapper.querySelectorAll('.btn-preview-drive-table').forEach(el => {
            el.addEventListener('click', () => {
                const mType = el.getAttribute('data-type');
                const mSrc = el.getAttribute('data-src');
                const mTitle = el.getAttribute('data-title');
                if (mSrc) openMediaModal(mType, mSrc, mTitle);
            });
        });
    }

    function isVideoFile(name) {
        const ext = name.split('.').pop().toLowerCase();
        return ['mp4', 'm4v', 'webm', 'ts', 'mkv', 'mov'].includes(ext);
    }

    // ==========================================
    // LOCAL STORAGE EXPLORER
    // ==========================================

    async function loadLocalCreators() {
        const rootDir = elements.localRootSelect.value;
        try {
            const res = await fetch(`/api/local/creators?root=${encodeURIComponent(rootDir)}`);
            const data = await res.json();
            if (data.success) {
                state.localCreators = data.creators || [];
                renderLocalSidebar(state.localCreators);
                if (state.localCreators.length > 0 && !state.selectedLocalCreator) {
                    selectLocalCreator(state.localCreators[0].path);
                }
            }
        } catch (err) {
            console.error('Error loading local creators:', err);
        }
    }

    function renderLocalSidebar(creators) {
        elements.localSidebarCount.textContent = creators.length;
        if (creators.length === 0) {
            elements.localNavList.innerHTML = `
                <li style="padding: 1rem; color: var(--text-muted); font-size: 0.8rem">
                    Không tìm thấy creator nào trong thư mục này.
                </li>
            `;
            return;
        }

        elements.localNavList.innerHTML = creators.map(c => {
            const isActive = state.selectedLocalCreator === c.path ? 'active' : '';
            return `
                <li class="creator-nav-item ${isActive}" data-path="${c.path}">
                    <span>📁 ${c.name}</span>
                    <span class="count-pill">${c.total_files}</span>
                </li>
            `;
        }).join('');

        elements.localNavList.querySelectorAll('.creator-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const cPath = item.getAttribute('data-path');
                selectLocalCreator(cPath);
            });
        });
    }

    async function selectLocalCreator(cPath) {
        state.selectedLocalCreator = cPath;
        const cName = cPath.split('\\').pop() || cPath.split('/').pop();

        document.querySelectorAll('#local-creator-nav-list .creator-nav-item').forEach(it => {
            if (it.getAttribute('data-path') === cPath) it.classList.add('active');
            else it.classList.remove('active');
        });

        elements.localHeroName.textContent = cName;
        elements.localHeroAvatar.textContent = cName.charAt(0).toUpperCase();
        elements.localHeroSub.textContent = `Thư mục: ${cPath}`;
        elements.localFilesGrid.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <span>Đang quét tệp tin trên ổ đĩa...</span>
            </div>
        `;

        try {
            const res = await fetch(`/api/local/creator?path=${encodeURIComponent(cPath)}`);
            const data = await res.json();
            if (data.success && data.data) {
                state.localFilesData = data.data;
                renderLocalCreatorFiles(data.data);
            }
        } catch (err) {
            console.error('Error fetching local files:', err);
        }
    }

    function renderLocalCreatorFiles(data) {
        elements.localStatPhotos.textContent = data.photos_count || 0;
        elements.localStatVideos.textContent = data.videos_count || 0;
        elements.localStatSize.textContent = data.total_size_str || '0 B';

        let files = [];
        if (state.localFilter === 'all') {
            files = [...data.photos, ...data.videos];
        } else if (state.localFilter === 'photo') {
            files = [...data.photos];
        } else if (state.localFilter === 'video') {
            files = [...data.videos];
        }

        const query = elements.localFileSearch.value.trim().toLowerCase();
        if (query) {
            files = files.filter(f => f.name.toLowerCase().includes(query));
        }

        if (files.length === 0) {
            elements.localFilesGrid.innerHTML = `
                <div class="empty-placeholder">
                    <span>Không có tệp nào</span>
                </div>
            `;
            return;
        }

        elements.localFilesGrid.innerHTML = files.map(f => {
            const isVideo = isVideoFile(f.name);
            const badgeClass = isVideo ? 'video' : 'photo';
            const badgeText = isVideo ? 'VIDEO' : 'ẢNH';
            const thumbSrc = f.thumbnail_url || (isVideo ? `/api/media/thumbnail?file=${encodeURIComponent(f.full_path)}` : f.stream_url);

            return `
                <div class="file-card">
                    <div class="file-thumb" data-type="${isVideo ? 'video' : 'photo'}" data-src="${f.stream_url}" data-title="${f.name}">
                        <span class="file-badge-type ${badgeClass}">${badgeText}</span>
                        <img src="${thumbSrc}" alt="${f.name}" loading="lazy" onerror="this.src='/static/placeholder.svg'">
                        ${isVideo ? `
                            <div class="file-play-overlay">▶</div>
                        ` : ''}
                    </div>
                    <div class="file-info">
                        <span class="file-title" title="${f.name}">${f.name}</span>
                        <div class="file-meta-row">
                            <span>${f.size_str}</span>
                            <span>${f.mod_time}</span>
                        </div>
                        <div class="file-actions-row">
                            <button class="btn btn-secondary btn-sm btn-preview-media" data-type="${isVideo ? 'video' : 'photo'}" data-src="${f.stream_url}" data-title="${f.name}">
                                ${isVideo ? 'Phát Video' : 'Xem Ảnh'}
                            </button>
                            <a href="${f.stream_url}&dl=1" class="btn btn-secondary btn-sm" download title="Tải về máy">
                                ⬇
                            </a>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Gắn sự kiện mở preview
        elements.localFilesGrid.querySelectorAll('.file-thumb, .btn-preview-media').forEach(el => {
            el.addEventListener('click', () => {
                const mType = el.getAttribute('data-type');
                const mSrc = el.getAttribute('data-src');
                const mTitle = el.getAttribute('data-title');
                openMediaModal(mType, mSrc, mTitle);
            });
        });
    }

    // ==========================================
    // MODALS: LIGHTBOX & VIDEO PLAYER (VIDEO.JS)
    // ==========================================

    let appVideoPlayerInstance = null;

    function getOrCreateAppPlayer() {
        if (!elements.videoPlayer) return null;
        if (window.videojs) {
            if (!appVideoPlayerInstance) {
                appVideoPlayerInstance = window.videojs('html5-video-player', {
                    controls: true,
                    autoplay: true,
                    preload: 'metadata',
                    fluid: false,
                    fill: true,
                    playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2]
                });
            }
            return appVideoPlayerInstance;
        }
        return null;
    }

    function openMediaModal(type, src, title) {
        if (type === 'video') {
            elements.videoModalTitle.textContent = title || 'Phát Video';
            const extLink = document.getElementById('video-modal-external');
            if (extLink) extLink.href = src;
            const dlLink = document.getElementById('video-modal-download');
            if (dlLink) dlLink.href = src + (src.includes('?') ? '&dl=1' : '?dl=1');
            elements.videoModal.classList.add('active');
            const vjs = getOrCreateAppPlayer();
            if (vjs) {
                vjs.src({ src: src, type: 'video/mp4' });
                vjs.ready(() => {
                    const playPromise = vjs.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(() => {});
                    }
                });
                vjs.one('error', () => {
                    if (elements.videoPlayer) {
                        elements.videoPlayer.src = src;
                        elements.videoPlayer.play().catch(() => {});
                    }
                });
            } else if (elements.videoPlayer) {
                elements.videoPlayer.src = src;
                elements.videoPlayer.play().catch(() => {});
            }
        } else {
            elements.lightboxTitle.textContent = title || 'Xem Ảnh';
            elements.lightboxImg.src = src;
            elements.lightboxDownload.href = src + '&dl=1';
            elements.lightboxModal.classList.add('active');
        }
    }

    function closeVideoModal() {
        elements.videoModal.classList.remove('active');
        const vjs = getOrCreateAppPlayer();
        if (vjs) {
            vjs.pause();
            vjs.src('');
        } else if (elements.videoPlayer) {
            elements.videoPlayer.pause();
            elements.videoPlayer.src = '';
        }
    }

    function initModals() {
        // Đóng lightbox
        elements.lightboxClose.addEventListener('click', () => {
            elements.lightboxModal.classList.remove('active');
            elements.lightboxImg.src = '';
        });
        elements.lightboxModal.addEventListener('click', (e) => {
            if (e.target === elements.lightboxModal) {
                elements.lightboxModal.classList.remove('active');
                elements.lightboxImg.src = '';
            }
        });

        // Đóng video
        elements.videoClose.addEventListener('click', closeVideoModal);
        elements.videoModal.addEventListener('click', (e) => {
            if (e.target === elements.videoModal) {
                closeVideoModal();
            }
        });

        // Tốc độ video
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const spd = parseFloat(btn.getAttribute('data-speed'));
                const vjs = getOrCreateAppPlayer();
                if (vjs) {
                    vjs.playbackRate(spd);
                } else if (elements.videoPlayer) {
                    elements.videoPlayer.playbackRate = spd;
                }
            });
        });

        // ESC key đóng modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                elements.lightboxModal.classList.remove('active');
                closeVideoModal();
            }
        });
    }

    // ==========================================
    // INTEGRITY / VERIFY CHECKER
    // ==========================================

    function renderVerifyChips(creators) {
        if (!creators || creators.length === 0) return;
        elements.verifySuggestChips.innerHTML = creators.map(c => `
            <span class="chip" data-slug="${c.slug}">${c.slug}</span>
        `).join('');

        elements.verifySuggestChips.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const slug = chip.getAttribute('data-slug');
                elements.verifyInput.value = slug;
                runVerify(slug);
            });
        });
    }

    async function runVerify(targetInput) {
        const target = (targetInput || elements.verifyInput.value).trim();
        if (!target) {
            showToast('Vui lòng nhập đường dẫn 18tube hoặc tên creator', 'warning');
            return;
        }

        const source = elements.verifySourceSelect.value;
        elements.verifyBtnText.textContent = 'Đang kiểm tra...';
        elements.verifySpinner.style.display = 'inline-block';
        elements.btnStartVerify.disabled = true;

        try {
            const res = await fetch(`/api/verify?target=${encodeURIComponent(target)}&source=${source}`);
            const data = await res.json();
            if (data.success) {
                renderVerifyResult(data);
                elements.verifyResults.style.display = 'flex';
            } else {
                showToast(data.error || 'Lỗi khi kiểm tra đối soát', 'error');
            }
        } catch (err) {
            console.error('Error verifying creator:', err);
            showToast('Lỗi kết nối khi đối soát dữ liệu', 'error');
        } finally {
            elements.verifyBtnText.textContent = 'Kiểm Tra Ngay';
            elements.verifySpinner.style.display = 'none';
            elements.btnStartVerify.disabled = false;
        }
    }

    function renderVerifyResult(rep) {
        // Banner status
        elements.verifyResultBanner.className = 'result-banner';
        if (rep.status === 'complete') {
            elements.verifyResultBanner.classList.add('banner-success');
            elements.verifyStatusIcon.textContent = '✓';
            elements.verifyResultTitle.textContent = `Tuyệt vời! Đầy đủ 100% dữ liệu (${rep.slug})`;
            elements.verifyResultDesc.textContent = `Toàn bộ ${rep.stored.total} file ảnh và video đã tải lên hoàn tất, không bị thiếu sót.`;
        } else if (rep.status === 'missing') {
            elements.verifyResultBanner.classList.add('banner-warning');
            elements.verifyStatusIcon.textContent = '⚠️';
            elements.verifyResultTitle.textContent = `Chưa đầy đủ: Thiếu ${rep.missing.photos} ảnh, ${rep.missing.videos} video`;
            elements.verifyResultDesc.textContent = `Website 18tube có ${rep.online.total} tệp nhưng trong kho chỉ có ${rep.stored.total} tệp.`;
        } else if (rep.status === 'empty') {
            elements.verifyResultBanner.classList.add('banner-danger');
            elements.verifyStatusIcon.textContent = '✕';
            elements.verifyResultTitle.textContent = `Chưa có dữ liệu nào cho creator "${rep.slug}"`;
            elements.verifyResultDesc.textContent = `Chưa tìm thấy thư mục hoặc file nào trên nguồn đối soát đã chọn.`;
        } else {
            elements.verifyResultBanner.classList.add('banner-warning');
            elements.verifyStatusIcon.textContent = '!';
            elements.verifyResultTitle.textContent = rep.status_label;
            elements.verifyResultDesc.textContent = `Phát hiện tệp lỗi hoặc bất thường trong kho lưu trữ.`;
        }

        elements.verifyCompletionPct.textContent = `${rep.completion_pct}%`;

        // Online Metrics
        elements.vOnlineTotal.textContent = rep.online.total;
        elements.vOnlinePhotos.textContent = rep.online.photos;
        elements.vOnlineVideos.textContent = rep.online.videos;

        // Stored Metrics
        elements.vStorageBadge.textContent = rep.stored.location.includes('Google Drive') ? '☁️ Google Drive' : '💻 Máy tính';
        elements.vStoredTotal.textContent = rep.stored.total;
        elements.vStoredPhotos.textContent = rep.stored.photos;
        elements.vStoredVideos.textContent = rep.stored.videos;
        elements.vStoredSize.textContent = rep.stored.size_str;

        // Difference Metrics
        elements.vDiffPhotos.textContent = rep.missing.photos > 0 ? `-${rep.missing.photos}` : '0 (Đủ)';
        elements.vDiffVideos.textContent = rep.missing.videos > 0 ? `-${rep.missing.videos}` : '0 (Đủ)';
        elements.vLocationText.textContent = rep.stored.location;

        // Issues
        if (rep.stored.issues && rep.stored.issues.length > 0) {
            elements.verifyIssuesCard.style.display = 'block';
            elements.verifyIssuesList.innerHTML = rep.stored.issues.map(iss => `
                <li>${iss}</li>
            `).join('');
        } else {
            elements.verifyIssuesCard.style.display = 'none';
        }
    }

    // ==========================================
    // BATCH AUDIT ALL CREATORS (ĐỐI SOÁT TOÀN BỘ)
    // ==========================================

    function initBatchVerify() {
        if (!elements.btnModeBatch || !elements.btnModeSingle) return;

        // Switch chế độ Batch vs Single
        elements.btnModeBatch.addEventListener('click', () => {
            elements.btnModeBatch.classList.add('active');
            elements.btnModeSingle.classList.remove('active');
            elements.verifyBatchView.classList.add('active');
            elements.verifyBatchView.style.display = 'block';
            elements.verifySingleView.classList.remove('active');
            elements.verifySingleView.style.display = 'none';
        });

        elements.btnModeSingle.addEventListener('click', () => {
            elements.btnModeSingle.classList.add('active');
            elements.btnModeBatch.classList.remove('active');
            elements.verifySingleView.classList.add('active');
            elements.verifySingleView.style.display = 'block';
            elements.verifyBatchView.classList.remove('active');
            elements.verifyBatchView.style.display = 'none';
        });

        // Bắt đầu quét toàn bộ
        elements.btnStartBatchVerify.addEventListener('click', () => {
            startBatchVerify();
        });

        // Dừng quét
        elements.btnStopBatchVerify.addEventListener('click', async () => {
            try {
                await fetch('/api/verify/all/stop', { method: 'POST' });
                showToast('Đang gửi lệnh dừng đối soát...', 'info');
            } catch (err) {
                console.error(err);
            }
        });

        // Lọc trạng thái trong bảng
        elements.batchStatusFilters.querySelectorAll('.pill-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                elements.batchStatusFilters.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.batchVerify.filter = btn.getAttribute('data-filter');
                renderBatchAuditTable();
            });
        });

        // Tìm kiếm creator trong bảng
        elements.batchTableSearch.addEventListener('input', () => {
            state.batchVerify.search = elements.batchTableSearch.value.trim().toLowerCase();
            renderBatchAuditTable();
        });

        // Xuất CSV báo cáo
        elements.btnExportAuditCsv.addEventListener('click', () => {
            exportBatchAuditCsv();
        });

        // Tự động kiểm tra trạng thái hoặc nạp cache đã có
        checkBatchVerifyInitial();
    }

    async function checkBatchVerifyInitial() {
        try {
            const res = await fetch('/api/verify/all/status');
            const data = await res.json();
            if (data.success) {
                if (data.running) {
                    setBatchVerifyUiRunning(true);
                    pollBatchVerifyStatus();
                } else if (data.results && data.results.length > 0) {
                    state.batchVerify.results = data.results;
                    state.batchVerify.summary = data.summary;
                    renderBatchAuditSummary(data.summary);
                    renderBatchAuditTable();
                    if (data.last_updated) {
                        elements.batchLastTime.textContent = `Lần quét gần nhất: ${formatDate(new Date(data.last_updated * 1000).toISOString())}`;
                    }
                }
            }
        } catch (err) {
            console.error('Error checking initial batch verify status:', err);
        }
    }

    function setBatchVerifyUiRunning(isRunning) {
        state.batchVerify.running = isRunning;
        if (isRunning) {
            elements.btnStartBatchVerify.disabled = true;
            elements.batchVerifySpinner.style.display = 'inline-block';
            elements.batchVerifyBtnText.textContent = 'Đang Quét Đối Soát...';
            elements.btnStopBatchVerify.style.display = 'inline-flex';
            elements.batchProgressCard.style.display = 'flex';
        } else {
            elements.btnStartBatchVerify.disabled = false;
            elements.batchVerifySpinner.style.display = 'none';
            elements.batchVerifyBtnText.textContent = '🔄 Quét Lại Toàn Bộ 126 Creator';
            elements.btnStopBatchVerify.style.display = 'none';
            elements.batchProgressCard.style.display = 'none';
        }
    }

    async function startBatchVerify() {
        setBatchVerifyUiRunning(true);
        showToast('Bắt đầu đối soát toàn bộ creator từ 18tube.nl...', 'info');

        try {
            const res = await fetch('/api/verify/all/start', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                pollBatchVerifyStatus();
            } else {
                showToast(data.message || 'Không thể bắt đầu', 'error');
                setBatchVerifyUiRunning(false);
            }
        } catch (err) {
            showToast('Lỗi khi gửi yêu cầu đối soát toàn bộ', 'error');
            setBatchVerifyUiRunning(false);
        }
    }

    function pollBatchVerifyStatus() {
        if (state.batchVerify.timer) clearInterval(state.batchVerify.timer);

        state.batchVerify.timer = setInterval(async () => {
            try {
                const res = await fetch('/api/verify/all/status');
                const data = await res.json();
                if (data.success) {
                    const total = data.total || 126;
                    const progress = data.progress || 0;
                    const pct = Math.min(100, Math.round((progress / total) * 100));

                    // Cập nhật thanh tiến trình
                    elements.batchProgressStatus.textContent = `Đang đối soát: ${progress} / ${total} Creator`;
                    elements.batchProgressCurrent.textContent = data.current_slug ? `Đang kiểm tra: ${data.current_slug}` : 'Đang xử lý...';
                    elements.batchProgressPct.textContent = `${pct}%`;
                    elements.batchProgressFill.style.width = `${pct}%`;

                    // Render bảng kết quả tạm thời nếu có
                    if (data.results && data.results.length > 0) {
                        state.batchVerify.results = data.results;
                        state.batchVerify.summary = data.summary;
                        renderBatchAuditSummary(data.summary);
                        renderBatchAuditTable();
                    }

                    if (!data.running) {
                        clearInterval(state.batchVerify.timer);
                        state.batchVerify.timer = null;
                        setBatchVerifyUiRunning(false);
                        showToast('Hoàn tất đối soát toàn bộ Creator!', 'success');
                        if (data.last_updated) {
                            elements.batchLastTime.textContent = `Lần quét gần nhất: ${formatDate(new Date(data.last_updated * 1000).toISOString())}`;
                        }
                    }
                }
            } catch (err) {
                console.error('Polling batch verify error:', err);
            }
        }, 1200);
    }

    function renderBatchAuditSummary(summary) {
        if (!summary) return;
        elements.kpiTotalCreators.textContent = summary.total_creators || 0;
        elements.kpiCompleteCreators.textContent = summary.complete_count || 0;
        elements.kpiMissingCreators.textContent = summary.missing_count || 0;
        elements.kpiTotalMissingFiles.textContent = (summary.total_missing_files || 0).toLocaleString('vi-VN');
        elements.kpiMissingBreakdown.textContent = `${(summary.total_missing_photos || 0).toLocaleString('vi-VN')} Ảnh / ${(summary.total_missing_videos || 0).toLocaleString('vi-VN')} Video`;

        // Cập nhật các badge số lượng trên filter buttons
        elements.cntBatchAll.textContent = summary.total_creators || 0;
        elements.cntBatchMissing.textContent = summary.missing_count || 0;
        elements.cntBatchComplete.textContent = summary.complete_count || 0;
        elements.cntBatchNotfound.textContent = summary.not_found_count || 0;
    }

    function renderBatchAuditTable() {
        const results = state.batchVerify.results || [];
        const filter = state.batchVerify.filter || 'all';
        const query = state.batchVerify.search || '';

        const filtered = results.filter(item => {
            const matchesQuery = !query || 
                item.name.toLowerCase().includes(query) || 
                item.web_slug.toLowerCase().includes(query) ||
                (item.country && item.country.toLowerCase().includes(query));

            if (!matchesQuery) return false;

            if (filter === 'missing') return item.status === 'missing' || item.status === 'empty';
            if (filter === 'complete') return item.status === 'complete';
            if (filter === 'not_found') return item.status === 'not_found';
            return true;
        });

        elements.batchTableBadge.textContent = `${filtered.length} / ${results.length} Creator`;

        if (filtered.length === 0) {
            elements.batchAuditTbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
                        Không tìm thấy creator nào phù hợp với bộ lọc hiện tại.
                    </td>
                </tr>
            `;
            return;
        }

        elements.batchAuditTbody.innerHTML = filtered.map((item, idx) => {
            const flagHtml = getCountryFlagHtml(item.country);
            const initial = item.name.charAt(0).toUpperCase();
            const avatarBg = getAvatarGradient(item.name);

            // Badge trạng thái
            let statusBadge = '';
            if (item.status === 'complete') {
                statusBadge = `<span class="batch-diff-badge complete">✅ Đầy đủ 100%</span>`;
            } else if (item.status === 'missing') {
                statusBadge = `<span class="batch-diff-badge missing">⚠️ Thiếu ${item.missing.photos} ảnh, ${item.missing.videos} video</span>`;
            } else if (item.status === 'empty') {
                statusBadge = `<span class="batch-diff-badge empty">❌ Chưa có trên Drive</span>`;
            } else {
                statusBadge = `<span class="batch-diff-badge not_found">❓ Không tìm thấy trên web</span>`;
            }

            // Progress bar mini
            const pct = item.completion_pct || 0;
            const progressColorClass = pct === 100 ? '' : (pct > 70 ? 'warning' : 'danger');

            return `
                <tr>
                    <td style="color: var(--text-muted); font-size: 0.76rem;">${idx + 1}</td>
                    <td>
                        <div class="batch-creator-cell">
                            <div class="batch-creator-avatar" style="background: ${avatarBg};">
                                ${initial}
                            </div>
                            <div class="batch-creator-info">
                                <span class="batch-creator-title">${item.name}</span>
                                <span class="batch-creator-sub">${flagHtml} ${item.country || 'Việt Nam'}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div style="font-weight: 600; color: #fff;">${item.online.total.toLocaleString('vi-VN')} tệp</div>
                        <div style="font-size: 0.72rem; color: var(--text-muted);">${item.online.photos} ảnh • ${item.online.videos} video</div>
                    </td>
                    <td>
                        <div style="font-weight: 600; color: #fff;">${item.drive.total.toLocaleString('vi-VN')} tệp</div>
                        <div style="font-size: 0.72rem; color: var(--text-muted);">${item.drive.photos} ảnh • ${item.drive.videos} video (${item.drive.size_str})</div>
                    </td>
                    <td>
                        ${item.missing.total > 0 
                            ? `<span style="color: var(--accent-amber); font-weight: 700;">-${item.missing.total.toLocaleString('vi-VN')}</span> <span style="font-size: 0.72rem; color: var(--text-muted);">(-${item.missing.photos} 📸, -${item.missing.videos} 🎬)</span>` 
                            : `<span style="color: var(--accent-emerald); font-weight: 600;">0 (Khớp 100%)</span>`
                        }
                    </td>
                    <td>
                        <div style="display: flex; align-items: center;">
                            <div class="batch-progress-bar-mini">
                                <div class="batch-progress-fill-mini ${progressColorClass}" style="width: ${pct}%;"></div>
                            </div>
                            <span style="font-weight: 700; font-size: 0.8rem;">${pct}%</span>
                        </div>
                    </td>
                    <td>
                        ${statusBadge}
                    </td>
                    <td style="text-align: right;">
                        <div class="batch-actions-cell">
                            <a href="/gallery?creator=${encodeURIComponent(item.slug)}" target="_blank" class="btn btn-secondary btn-sm" title="Mở Cinema Gallery">
                                🎬 Gallery
                            </a>
                            <button class="btn btn-primary btn-sm btn-inspect-single" data-slug="${item.slug}" title="Xem chi tiết trên Inspector">
                                🔍 Chi tiết
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Gắn sự kiện nút chi tiết
        elements.batchAuditTbody.querySelectorAll('.btn-inspect-single').forEach(btn => {
            btn.addEventListener('click', () => {
                const slug = btn.getAttribute('data-slug');
                switchToDriveTabAndSelect(slug);
            });
        });
    }

    function exportBatchAuditCsv() {
        const results = state.batchVerify.results || [];
        if (results.length === 0) {
            showToast('Chưa có dữ liệu để xuất file CSV', 'warning');
            return;
        }

        let csvContent = '\uFEFF'; // BOM UTF-8 for Excel
        csvContent += 'STT,Creator,Slug,Quoc Gia,18tube Tong,18tube Anh,18tube Video,Drive Tong,Drive Anh,Drive Video,Drive Dung Luong,Thieu Tong,Thieu Anh,Thieu Video,Ty Le Hoan Thanh,Trang Thai\n';

        results.forEach((r, idx) => {
            const row = [
                idx + 1,
                `"${(r.name || '').replace(/"/g, '""')}"`,
                `"${r.slug}"`,
                `"${r.country || 'Việt Nam'}"`,
                r.online.total,
                r.online.photos,
                r.online.videos,
                r.drive.total,
                r.drive.photos,
                r.drive.videos,
                `"${r.drive.size_str}"`,
                r.missing.total,
                r.missing.photos,
                r.missing.videos,
                `${r.completion_pct}%`,
                `"${r.status_label}"`
            ];
            csvContent += row.join(',') + '\n';
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `18TUBE_Audit_Report_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Đã xuất file báo cáo CSV thành công!', 'success');
    }

    // ==========================================
    // EVENT LISTENERS INITIALIZATION
    // ==========================================

    function initEventListeners() {
        // Làm mới tất cả
        elements.btnRefreshAll.addEventListener('click', async () => {
            elements.btnRefreshAll.disabled = true;
            elements.btnRefreshAll.style.opacity = '0.5';
            showToast('Đang làm mới dữ liệu từ Google Drive...', 'info');

            try {
                await fetch('/api/drive/refresh', { method: 'POST' });
                await Promise.all([
                    loadDriveInfo(true),
                    loadDriveSummary(true)
                ]);
                showToast('Đã làm mới dữ liệu thành công!', 'success');
            } catch (err) {
                showToast('Lỗi khi làm mới', 'error');
            } finally {
                elements.btnRefreshAll.disabled = false;
                elements.btnRefreshAll.style.opacity = '1';
            }
        });

        // Mở Drive Root
        elements.btnOpenDriveRoot.addEventListener('click', () => {
            window.open('https://drive.google.com/drive/u/0/my-drive', '_blank');
        });

        // Tìm kiếm Overview & Nút xóa
        if (elements.overviewSearch) {
            elements.overviewSearch.addEventListener('input', () => {
                const val = elements.overviewSearch.value.trim();
                if (elements.btnOverviewSearchClear) {
                    elements.btnOverviewSearchClear.style.display = val ? 'flex' : 'none';
                }
                renderOverviewCards(state.driveCreators || []);
            });
        }
        if (elements.btnOverviewSearchClear) {
            elements.btnOverviewSearchClear.addEventListener('click', () => {
                if (elements.overviewSearch) {
                    elements.overviewSearch.value = '';
                    elements.btnOverviewSearchClear.style.display = 'none';
                    elements.overviewSearch.focus();
                    renderOverviewCards(state.driveCreators || []);
                }
            });
        }

        // Sắp xếp Overview
        if (elements.overviewSortSelect) {
            elements.overviewSortSelect.addEventListener('change', () => {
                state.overviewSort = elements.overviewSortSelect.value;
                renderOverviewCards(state.driveCreators || []);
            });
        }

        // Cuộn ngang dải lọc quốc gia Overview (Buttons & Wheel)
        if (elements.btnOverviewCountryLeft && elements.overviewCountryRibbon) {
            elements.btnOverviewCountryLeft.addEventListener('click', () => {
                elements.overviewCountryRibbon.scrollBy({ left: -280, behavior: 'smooth' });
            });
        }
        if (elements.btnOverviewCountryRight && elements.overviewCountryRibbon) {
            elements.btnOverviewCountryRight.addEventListener('click', () => {
                elements.overviewCountryRibbon.scrollBy({ left: 280, behavior: 'smooth' });
            });
        }
        if (elements.overviewCountryRibbon) {
            elements.overviewCountryRibbon.addEventListener('wheel', (e) => {
                if (e.deltaY !== 0) {
                    e.preventDefault();
                    elements.overviewCountryRibbon.scrollLeft += e.deltaY;
                }
            }, { passive: false });
        }

        // Lọc Drive Creator Sidebar
        elements.driveCreatorFilter.addEventListener('input', () => {
            renderDriveSidebar(state.driveCreators);
        });

        // Filter Pills Drive
        elements.driveFilterPills.querySelectorAll('.pill-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                elements.driveFilterPills.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.driveFilter = btn.getAttribute('data-filter');
                filterAndRenderDriveFiles();
            });
        });

        // Drive File Search & Sort
        elements.driveFileSearch.addEventListener('input', filterAndRenderDriveFiles);
        elements.driveSortSelect.addEventListener('change', filterAndRenderDriveFiles);

        // View Toggles
        elements.btnViewGrid.addEventListener('click', () => {
            elements.btnViewGrid.classList.add('active');
            elements.btnViewTable.classList.remove('active');
            state.driveView = 'grid';
            filterAndRenderDriveFiles();
        });
        elements.btnViewTable.addEventListener('click', () => {
            elements.btnViewTable.classList.add('active');
            elements.btnViewGrid.classList.remove('active');
            state.driveView = 'table';
            filterAndRenderDriveFiles();
        });

        // Local Root Change
        elements.localRootSelect.addEventListener('change', loadLocalCreators);
        elements.localTypeFilters.querySelectorAll('.pill-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                elements.localTypeFilters.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.localFilter = btn.getAttribute('data-filter');
                if (state.localFilesData) renderLocalCreatorFiles(state.localFilesData);
            });
        });
        elements.localFileSearch.addEventListener('input', () => {
            if (state.localFilesData) renderLocalCreatorFiles(state.localFilesData);
        });

        // Open Local in Explorer
        elements.btnOpenLocalExplorer.addEventListener('click', async () => {
            const path = state.selectedLocalCreator || elements.localRootSelect.value;
            try {
                await fetch('/api/system/open_folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: path })
                });
                showToast(`Đã mở thư mục: ${path}`, 'info');
            } catch (err) {
                showToast('Không thể mở thư mục', 'error');
            }
        });

        // Verify button
        elements.btnStartVerify.addEventListener('click', () => runVerify());
        elements.verifyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') runVerify();
        });

        // Setup Drive Connection
        async function promptDriveConnect() {
            const token = prompt('🔑 Dán mã cấu hình Google Drive (chuỗi RCLONE_CONFIG_BASE64 từ export_config.bat):');
            if (token && token.trim()) {
                if (elements.driveStatusLabel) elements.driveStatusLabel.textContent = 'Đang kết nối Drive...';
                if (elements.driveDot) elements.driveDot.style.background = 'var(--accent-amber)';
                try {
                    const r = await fetch('/api/drive/setup_config', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({token: token.trim()})
                    });
                    const data = await r.json();
                    if (data.success) {
                        alert('🎉 ' + (data.message || 'Kết nối Google Drive thành công!'));
                        window.location.reload();
                    } else {
                        alert('❌ Lỗi: ' + (data.error || 'Không thể kết nối Drive'));
                    }
                } catch (e) {
                    alert('❌ Lỗi kết nối: ' + e);
                }
            }
        }
        if (elements.btnSetupDrive) elements.btnSetupDrive.addEventListener('click', promptDriveConnect);
        if (elements.driveStatusCard) {
            elements.driveStatusCard.style.cursor = 'pointer';
            elements.driveStatusCard.title = 'Nhấn để kết nối hoặc cập nhật tài khoản Google Drive';
            elements.driveStatusCard.addEventListener('click', promptDriveConnect);
        }

        // Floating Back to Top button
        const btnBackToTop = document.getElementById('btn-back-to-top');
        if (btnBackToTop) {
            let scrollTicking = false;
            window.addEventListener('scroll', () => {
                if (!scrollTicking) {
                    window.requestAnimationFrame(() => {
                        if (window.scrollY > 280) {
                            btnBackToTop.classList.add('visible');
                        } else {
                            btnBackToTop.classList.remove('visible');
                        }
                        scrollTicking = false;
                    });
                    scrollTicking = true;
                }
            }, { passive: true });

            btnBackToTop.addEventListener('click', (e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }

        // Quick scroll to top with Home key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Home' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }

    // ==========================================
    // INITIALIZATION
    // ==========================================

    async function init() {
        initTabs();
        initModals();
        initEventListeners();
        initBatchVerify();

        // 1. Tải nhanh thông tin Drive, Creator list (1-2s) và Local creators song song
        await Promise.all([
            loadDriveInfo(),
            loadDriveQuickCreators(),
            loadLocalCreators()
        ]);

        // 2. Chạy tổng hợp số liệu toàn bộ Drive ngầm trong background (không chặn UI)
        loadDriveSummary();
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
