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

        localRoots: [],
        currentLocalRoot: '',
        localCreators: [],
        selectedLocalCreator: null,
        localFilesData: null,
        localFilter: 'all',
        localSearch: '',

        verifyTarget: 'kimxu1209',
        verifySource: 'drive',
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

        // Verify
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
    // UTILITIES
    // ==========================================

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
        if (!dateStr) return '--';
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

    async function loadDriveSummary(refresh = false) {
        try {
            const res = await fetch(`/api/drive/summary_all?refresh=${refresh ? '1' : '0'}`);
            const data = await res.json();
            if (data.success && data.data) {
                state.driveSummary = data.data;
                state.driveCreators = data.data.creators || [];
                renderOverview(data.data);
                renderDriveSidebar(state.driveCreators);
                renderVerifyChips(state.driveCreators);
            }
        } catch (err) {
            console.error('Error fetching drive summary:', err);
            showToast('Lỗi khi tải danh sách từ Google Drive', 'error');
        }
    }

    function renderOverview(summary) {
        const totalCreators = summary.total_creators || 0;
        const totalFiles = summary.total_files || 0;
        elements.mCreatorsCount.textContent = totalCreators;
        elements.mTotalFiles.textContent = totalFiles.toLocaleString();
        elements.overviewBadge.textContent = `${totalCreators} Creator`;
        elements.tabDriveCount.textContent = totalCreators;
        elements.driveSidebarCount.textContent = totalCreators;

        // Tính tổng ảnh và video
        let totalPhotos = 0;
        let totalVideos = 0;
        (summary.creators || []).forEach(c => {
            totalPhotos += c.photos_count || 0;
            totalVideos += c.videos_count || 0;
        });
        elements.mFilesRatio.textContent = `${totalPhotos.toLocaleString()} Ảnh / ${totalVideos.toLocaleString()} Video`;

        // Render Creator Cards Grid
        renderOverviewCards(summary.creators || []);
    }

    function renderOverviewCards(creators) {
        const query = elements.overviewSearch.value.trim().toLowerCase();
        const filtered = creators.filter(c => c.slug.toLowerCase().includes(query));

        if (filtered.length === 0) {
            elements.overviewGrid.innerHTML = `
                <div class="empty-placeholder">
                    <span>Không tìm thấy creator nào phù hợp với "${query}"</span>
                </div>
            `;
            return;
        }

        elements.overviewGrid.innerHTML = filtered.map(c => {
            const initial = c.slug.charAt(0).toUpperCase();
            return `
                <div class="creator-card" data-slug="${c.slug}">
                    <div class="creator-card-header">
                        <div class="creator-avatar-box">${initial}</div>
                        <div class="creator-info">
                            <h4 class="creator-title">${c.slug}</h4>
                            <span class="creator-time">${formatDate(c.mod_time)}</span>
                        </div>
                    </div>
                    <div class="creator-card-stats">
                        <div class="substat-item">
                            <span class="substat-val">${c.photos_count || 0}</span>
                            <span class="substat-lbl">Ảnh</span>
                        </div>
                        <div class="substat-item">
                            <span class="substat-val">${c.videos_count || 0}</span>
                            <span class="substat-lbl">Video</span>
                        </div>
                        <div class="substat-item">
                            <span class="substat-val">${c.total_size_str || '0 B'}</span>
                            <span class="substat-lbl">Dung lượng</span>
                        </div>
                    </div>
                    <div class="creator-card-footer">
                        <span class="badge badge-success">✓ Đã đồng bộ</span>
                        <button class="btn btn-secondary btn-sm btn-inspect-drive" data-slug="${c.slug}">
                            Khám phá file →
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Gắn sự kiện click
        elements.overviewGrid.querySelectorAll('.creator-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const slug = card.getAttribute('data-slug');
                switchToDriveTabAndSelect(slug);
            });
        });
    }

    function switchToDriveTabAndSelect(slug) {
        document.getElementById('nav-tab-drive').click();
        selectDriveCreator(slug);
    }

    function renderDriveSidebar(creators) {
        const query = (elements.driveCreatorFilter.value || '').trim().toLowerCase();
        const filtered = creators.filter(c => c.slug.toLowerCase().includes(query));

        elements.driveNavList.innerHTML = filtered.map(c => {
            const isActive = state.selectedDriveCreator === c.slug ? 'active' : '';
            return `
                <li class="creator-nav-item ${isActive}" data-slug="${c.slug}">
                    <span>👤 ${c.slug}</span>
                    <span class="count-pill">${c.total_files || 0}</span>
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
        elements.driveHeroName.textContent = slug;
        elements.driveHeroAvatar.textContent = slug.charAt(0).toUpperCase();
        elements.driveHeroSub.textContent = `Đang quét dữ liệu chi tiết từ gg:18TUBE/${slug}...`;
        elements.driveFilesGrid.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <span>Đang quét danh sách file trên Google Drive (${slug})...</span>
            </div>
        `;

        try {
            const res = await fetch(`/api/drive/creator/${slug}`);
            const data = await res.json();
            if (data.success && data.data) {
                state.driveFilesData = data.data;
                renderDriveCreatorDetails(data.data);
            } else {
                showToast(data.error || 'Lỗi khi tải chi tiết creator', 'error');
            }
        } catch (err) {
            console.error('Error fetching creator files:', err);
            showToast('Không thể kết nối máy chủ để tải file', 'error');
        }
    }

    function renderDriveCreatorDetails(data) {
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
                    preload: 'auto',
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

        // Tìm kiếm Overview
        elements.overviewSearch.addEventListener('input', () => {
            if (state.driveSummary && state.driveSummary.creators) {
                renderOverviewCards(state.driveSummary.creators);
            }
        });

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
    }

    // ==========================================
    // INITIALIZATION
    // ==========================================

    async function init() {
        initTabs();
        initModals();
        initEventListeners();

        // Tải dữ liệu ban đầu song song
        await Promise.all([
            loadDriveInfo(),
            loadDriveSummary(),
            loadLocalCreators()
        ]);
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
