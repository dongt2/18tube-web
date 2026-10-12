/**
 * 18TUBE CINEMA & GALLERY - INTERACTIVE JAVASCRIPT
 * High-performance, distraction-free photo & video viewer
 */

(function () {
    'use strict';

    // Application State
    const state = {
        source: 'drive', // Mặc định Google Drive
        creators: [],
        countries: [],
        selectedCountry: 'all',
        selectedCreator: '',
        creatorCache: {}, // Bộ nhớ đệm RAM trên trình duyệt: chuyển đổi giữa các Creator TỨC THÌ 0s
        mediaItems: [],
        filteredItems: [],
        mediaTypeFilter: 'all', // 'all', 'video', 'photo'
        searchQuery: '',
        sortBy: 'date-desc', // 'date-desc', 'date-asc', 'size-desc', 'size-asc', 'name-asc'
        density: 'compact',

        // Pagination (60 items / page)
        currentPage: 1,
        pageSize: 60,

        // Theater Video Player
        currentVideoIndex: -1,
        videoList: [],
        isLooping: false,
        autoNext: true,
        playerEngine: 'html5', // 'html5' or 'drive'

        // Photo Lightbox
        currentPhotoIndex: -1,
        photoList: [],
        slideshowTimer: null,
        zoomLevel: 1,
        rotationDeg: 0,
    };

    // DOM Elements
    const elements = {
        btnRefreshCache: document.getElementById('btn-refresh-cache'),
        countrySelect: document.getElementById('country-select'),
        countryRibbon: document.getElementById('country-ribbon'),
        creatorSelect: document.getElementById('creator-select'),
        creatorRibbon: document.getElementById('creator-ribbon'),
        gallerySearch: document.getElementById('gallery-search'),
        btnSearchClear: document.getElementById('btn-search-clear'),
        mediaSortSelect: document.getElementById('media-sort-select'),
        mediaFilters: document.querySelectorAll('.filter-tab'),
        badgeCntAll: document.getElementById('badge-cnt-all'),
        badgeCntVideo: document.getElementById('badge-cnt-video'),
        badgeCntPhoto: document.getElementById('badge-cnt-photo'),
        mediaStatusText: document.getElementById('media-status-text'),
        densityBtns: document.querySelectorAll('.density-btn'),
        cinemaGrid: document.getElementById('cinema-grid'),

        // Ribbon scroll buttons
        btnCountryScrollLeft: document.getElementById('btn-country-scroll-left'),
        btnCountryScrollRight: document.getElementById('btn-country-scroll-right'),
        btnCreatorScrollLeft: document.getElementById('btn-creator-scroll-left'),
        btnCreatorScrollRight: document.getElementById('btn-creator-scroll-right'),

        // Theater
        theaterModal: document.getElementById('theater-modal'),
        theaterBackdrop: document.getElementById('theater-backdrop'),
        theaterVideo: document.getElementById('theater-video'),
        theaterDriveIframe: document.getElementById('theater-drive-iframe'),
        theaterVideoTitle: document.getElementById('theater-video-title'),
        theaterEngineBadge: document.getElementById('theater-engine-badge'),
        btnEngineHtml5: document.getElementById('btn-engine-html5'),
        btnEngineDrive: document.getElementById('btn-engine-drive'),
        theaterCloseBtn: document.getElementById('btn-theater-close'),
        theaterLoopBtn: document.getElementById('btn-theater-loop'),
        theaterPipBtn: document.getElementById('btn-theater-pip'),
        theaterExternalBtn: document.getElementById('btn-theater-external'),
        theaterDownloadBtn: document.getElementById('btn-theater-download'),
        theaterPlaylistItems: document.getElementById('theater-playlist-items'),
        playlistCount: document.getElementById('playlist-count'),
        chkAutoNext: document.getElementById('chk-auto-next'),
        speedBtns: document.querySelectorAll('.t-speed-btn'),

        // Lightbox
        photoLightbox: document.getElementById('photo-lightbox'),
        lightboxOverlay: document.getElementById('lightbox-overlay'),
        lbCurrentImage: document.getElementById('lb-current-image'),
        lbCounter: document.getElementById('lb-counter'),
        lbTitle: document.getElementById('lb-title'),
        lbBtnPrev: document.getElementById('lb-btn-prev'),
        lbBtnNext: document.getElementById('lb-btn-next'),
        lbBtnClose: document.getElementById('lb-btn-close'),
        lbBtnSlideshow: document.getElementById('lb-btn-slideshow'),
        lbBtnZoomIn: document.getElementById('lb-btn-zoom-in'),
        lbBtnZoomReset: document.getElementById('lb-btn-zoom-reset'),
        lbBtnRotate: document.getElementById('lb-btn-rotate'),
        lbBtnDownload: document.getElementById('lb-btn-download'),
        lbFilmstrip: document.getElementById('lb-filmstrip'),
        lbStage: document.getElementById('lb-stage'),

        toastContainer: document.getElementById('cinema-toast-container'),
        galleryPagination: document.getElementById('gallery-pagination'),
    };

    // ==========================================
    // UTILITIES & FORMATTING
    // ==========================================

    const COUNTRY_FLAG_MAP = {
        'việt nam': { iso: 'vn', flag: '🇻🇳', name: 'Việt Nam' },
        '_vietnam': { iso: 'vn', flag: '🇻🇳', name: 'Việt Nam' },
        'vn': { iso: 'vn', flag: '🇻🇳', name: 'Việt Nam' },

        'anh': { iso: 'gb', flag: '🇬🇧', name: 'Anh' },
        '_uk': { iso: 'gb', flag: '🇬🇧', name: 'Anh' },
        'uk': { iso: 'gb', flag: '🇬🇧', name: 'Anh' },
        'gb': { iso: 'gb', flag: '🇬🇧', name: 'Anh' },

        'mỹ': { iso: 'us', flag: '🇺🇸', name: 'Mỹ' },
        '_usa': { iso: 'us', flag: '🇺🇸', name: 'Mỹ' },
        'us': { iso: 'us', flag: '🇺🇸', name: 'Mỹ' },
        'usa': { iso: 'us', flag: '🇺🇸', name: 'Mỹ' },

        'hàn quốc': { iso: 'kr', flag: '🇰🇷', name: 'Hàn Quốc' },
        '_korea': { iso: 'kr', flag: '🇰🇷', name: 'Hàn Quốc' },
        'kr': { iso: 'kr', flag: '🇰🇷', name: 'Hàn Quốc' },

        'nhật bản': { iso: 'jp', flag: '🇯🇵', name: 'Nhật Bản' },
        '_japan': { iso: 'jp', flag: '🇯🇵', name: 'Nhật Bản' },
        'jp': { iso: 'jp', flag: '🇯🇵', name: 'Nhật Bản' },

        'trung quốc': { iso: 'cn', flag: '🇨🇳', name: 'Trung Quốc' },
        '_china': { iso: 'cn', flag: '🇨🇳', name: 'Trung Quốc' },
        'cn': { iso: 'cn', flag: '🇨🇳', name: 'Trung Quốc' },

        'thái lan': { iso: 'th', flag: '🇹🇭', name: 'Thái Lan' },
        '_thailand': { iso: 'th', flag: '🇹🇭', name: 'Thái Lan' },
        'th': { iso: 'th', flag: '🇹🇭', name: 'Thái Lan' },

        'đài loan': { iso: 'tw', flag: '🇹🇼', name: 'Đài Loan' },
        '_taiwan': { iso: 'tw', flag: '🇹🇼', name: 'Đài Loan' },
        'tw': { iso: 'tw', flag: '🇹🇼', name: 'Đài Loan' },

        'malaysia': { iso: 'my', flag: '🇲🇾', name: 'Malaysia' },
        '_malaysia': { iso: 'my', flag: '🇲🇾', name: 'Malaysia' },
        'my': { iso: 'my', flag: '🇲🇾', name: 'Malaysia' },

        'singapore': { iso: 'sg', flag: '🇸🇬', name: 'Singapore' },
        '_singapore': { iso: 'sg', flag: '🇸🇬', name: 'Singapore' },
        'sg': { iso: 'sg', flag: '🇸🇬', name: 'Singapore' },

        'indonesia': { iso: 'id', flag: '🇮🇩', name: 'Indonesia' },
        '_indonesia': { iso: 'id', flag: '🇮🇩', name: 'Indonesia' },
        'id': { iso: 'id', flag: '🇮🇩', name: 'Indonesia' },

        'ba lan': { iso: 'pl', flag: '🇵🇱', name: 'Ba Lan' },
        '_poland': { iso: 'pl', flag: '🇵🇱', name: 'Ba Lan' },
        'pl': { iso: 'pl', flag: '🇵🇱', name: 'Ba Lan' },

        'úc': { iso: 'au', flag: '🇦🇺', name: 'Úc' },
        '_australia': { iso: 'au', flag: '🇦🇺', name: 'Úc' },
        'au': { iso: 'au', flag: '🇦🇺', name: 'Úc' },

        'nga': { iso: 'ru', flag: '🇷🇺', name: 'Nga' },
        '_russia': { iso: 'ru', flag: '🇷🇺', name: 'Nga' },
        'ru': { iso: 'ru', flag: '🇷🇺', name: 'Nga' },
    };

    function getCountryInfo(nameOrCode) {
        if (!nameOrCode || nameOrCode === 'all' || nameOrCode === '__all__') {
            return { iso: '', flag: '🌍', name: 'Tất cả' };
        }
        const key = String(nameOrCode).trim().toLowerCase();
        return COUNTRY_FLAG_MAP[key] || { iso: '', flag: '🌐', name: nameOrCode.replace(/^_/, '') };
    }

    function getCountryFlagHtml(nameOrCode) {
        if (!nameOrCode || nameOrCode === 'all') {
            return '<span style="font-size:1.05rem;">🌍</span>';
        }
        const info = getCountryInfo(nameOrCode);
        if (info.iso) {
            return `<img class="country-flag-img" src="https://flagcdn.com/28x21/${info.iso}.png" srcset="https://flagcdn.com/56x42/${info.iso}.png 2x" width="20" height="15" alt="${info.name}" onerror="this.outerHTML='<span>${info.flag}</span>'">`;
        }
        return `<span>${info.flag || '🌐'}</span>`;
    }

    function formatDate(isoStr) {
        if (!isoStr) return '';
        try {
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return isoStr;
            const pad = (n) => String(n).padStart(2, '0');
            const day = pad(d.getDate());
            const month = pad(d.getMonth() + 1);
            const year = d.getFullYear();
            const hours = pad(d.getHours());
            const minutes = pad(d.getMinutes());
            return `${day}/${month}/${year} ${hours}:${minutes}`;
        } catch (_) {
            return isoStr;
        }
    }

    function parseBytesFromStr(sizeStr) {
        if (!sizeStr) return 0;
        const parts = sizeStr.trim().split(/\s+/);
        if (parts.length === 0) return 0;
        const val = parseFloat(parts[0]);
        if (isNaN(val)) return 0;
        const unit = (parts[1] || 'B').toUpperCase();
        if (unit.startsWith('K')) return val * 1024;
        if (unit.startsWith('M')) return val * 1024 * 1024;
        if (unit.startsWith('G')) return val * 1024 * 1024 * 1024;
        if (unit.startsWith('T')) return val * 1024 * 1024 * 1024 * 1024;
        return val;
    }

    async function loadCreators() {
        elements.creatorSelect.innerHTML = '<option value="">Đang tải...</option>';
        try {
            if (state.source === 'local') {
                const res = await fetch('/api/local/creators');
                const data = await res.json();
                if (data.success) {
                    state.creators = data.creators || [];
                    state.countries = [{ name: 'Mặc định', count: state.creators.length }];
                }
            } else {
                // Tải nhanh danh sách creator và quốc gia từ backend
                const res = await fetch('/api/drive/creators');
                const data = await res.json();
                if (data.success) {
                    state.creators = data.creators || [];
                    state.countries = data.countries || [];
                }

                // Gọi ngầm summary_all để bổ sung số lượng file trên badge mà không chặn UI
                fetch('/api/drive/summary_all').then(r => r.json()).then(summaryRes => {
                    if (summaryRes.success && summaryRes.data && summaryRes.data.creators) {
                        const countMap = {};
                        summaryRes.data.creators.forEach(sc => {
                            countMap[sc.slug] = sc.total_files || (sc.photos_count + sc.videos_count) || 0;
                            if (sc.name) countMap[sc.name] = countMap[sc.slug];
                        });
                        state.creators.forEach(c => {
                            if (countMap[c.slug] !== undefined) c.total_files = countMap[c.slug];
                            else if (countMap[c.name] !== undefined) c.total_files = countMap[c.name];
                        });
                        renderCountriesList();
                        renderCreatorsList();
                    }
                }).catch(() => {});
            }

            renderCountriesList();
            renderCreatorsList();

            if (state.creators.length > 0) {
                const first = state.creators[0].slug || state.creators[0].name;
                selectCreator(first);
            } else {
                elements.cinemaGrid.innerHTML = `
                    <div class="cinema-empty">
                        <span>Chưa có creator nào trong nguồn ${state.source === 'local' ? 'máy tính' : 'Google Drive'}</span>
                    </div>
                `;
            }
        } catch (err) {
            console.error('Error loading creators:', err);
            showToast('Lỗi khi tải danh sách creator', 'error');
        }
    }

    function renderCountriesList() {
        if (!elements.countrySelect || !elements.countryRibbon) return;

        const totalCreators = state.creators.length;

        // 1. Dropdown Quốc gia (Select Capsule)
        let selectHtml = `<option value="all">🌍 Tất cả Quốc Gia (${totalCreators})</option>`;
        state.countries.forEach(c => {
            const info = getCountryInfo(c.name);
            selectHtml += `<option value="${c.name}">${info.flag} ${c.name} (${c.count})</option>`;
        });
        elements.countrySelect.innerHTML = selectHtml;
        elements.countrySelect.value = state.selectedCountry;

        // 2. Ribbon Quốc gia (Smooth Horizontal Scroller with Flag Icons)
        let ribbonHtml = `
            <span class="country-chip ${state.selectedCountry === 'all' ? 'active' : ''}" data-country="all">
                <span class="country-flag-icon">🌍</span>
                <span class="country-name-text">Tất cả</span>
                <span class="country-count-pill">${totalCreators}</span>
            </span>
        `;
        state.countries.forEach(c => {
            const isActive = state.selectedCountry === c.name ? 'active' : '';
            const flagHtml = getCountryFlagHtml(c.name);
            ribbonHtml += `
                <span class="country-chip ${isActive}" data-country="${c.name}">
                    ${flagHtml}
                    <span class="country-name-text">${c.name}</span>
                    <span class="country-count-pill">${c.count}</span>
                </span>
            `;
        });
        elements.countryRibbon.innerHTML = ribbonHtml;

        elements.countryRibbon.querySelectorAll('.country-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const cName = chip.getAttribute('data-country');
                selectCountry(cName);
            });
        });
    }

    function selectCountry(countryName) {
        state.selectedCountry = countryName || 'all';
        if (elements.countrySelect) elements.countrySelect.value = state.selectedCountry;

        if (elements.countryRibbon) {
            elements.countryRibbon.querySelectorAll('.country-chip').forEach(chip => {
                chip.classList.toggle('active', chip.getAttribute('data-country') === state.selectedCountry);
            });
        }

        renderCreatorsList();

        // Tự động chọn creator đầu tiên của quốc gia mới chọn
        const visibleCreators = (state.selectedCountry === 'all') 
            ? state.creators 
            : state.creators.filter(c => c.country === state.selectedCountry);

        if (visibleCreators.length > 0) {
            const isCurrentVisible = visibleCreators.some(c => (c.slug || c.name) === state.selectedCreator);
            if (!isCurrentVisible && state.selectedCreator !== '__all__') {
                const first = visibleCreators[0].slug || visibleCreators[0].name;
                selectCreator(first);
            }
        }
    }

    function renderCreatorsList() {
        const visibleCreators = (state.selectedCountry === 'all')
            ? state.creators
            : state.creators.filter(c => c.country === state.selectedCountry);

        let totalVisibleFiles = 0;
        visibleCreators.forEach(c => {
            if (c.total_files) totalVisibleFiles += c.total_files;
        });

        const allCountStr = totalVisibleFiles > 0 ? ` (${totalVisibleFiles.toLocaleString('vi-VN')})` : '';
        const allLabel = state.selectedCountry === 'all' ? '🌟 Tất cả Creator' : `🌟 Tất cả (${state.selectedCountry})`;
        const allOption = `<option value="__all__">${allLabel}${allCountStr}</option>`;

        // Dropdown Creator: Gom nhóm theo Quốc gia nếu ở chế độ Tất cả
        if (state.selectedCountry === 'all' && state.countries.length > 1) {
            let groupsHtml = allOption;
            state.countries.forEach(cntry => {
                const cCreators = state.creators.filter(c => c.country === cntry.name);
                if (cCreators.length > 0) {
                    const info = getCountryInfo(cntry.name);
                    groupsHtml += `<optgroup label="${info.flag} ${cntry.name} (${cCreators.length})">`;
                    groupsHtml += cCreators.map(c => {
                        const slug = c.slug || c.name;
                        const dName = c.name || slug;
                        const total = (c.total_files !== undefined && c.total_files !== null) ? ` (${c.total_files})` : '';
                        return `<option value="${slug}">${dName}${total}</option>`;
                    }).join('');
                    groupsHtml += `</optgroup>`;
                }
            });
            elements.creatorSelect.innerHTML = groupsHtml;
        } else {
            elements.creatorSelect.innerHTML = allOption + visibleCreators.map(c => {
                const slug = c.slug || c.name;
                const dName = c.name || slug;
                const total = (c.total_files !== undefined && c.total_files !== null) ? ` (${c.total_files})` : '';
                return `<option value="${slug}">${dName}${total}</option>`;
            }).join('');
        }

        if (state.selectedCreator) {
            elements.creatorSelect.value = state.selectedCreator;
        }

        // Ribbon Creator
        const allChipActive = state.selectedCreator === '__all__' ? 'active' : '';
        const allChip = `
            <span class="creator-chip ${allChipActive}" data-name="__all__">
                <span>🌟</span>
                <span>${allLabel}</span>
            </span>
        `;
        elements.creatorRibbon.innerHTML = allChip + visibleCreators.map(c => {
            const slug = c.slug || c.name;
            const dName = c.name || slug;
            const isActive = state.selectedCreator === slug ? 'active' : '';
            const cFlagHtml = (c.country && c.country !== 'Việt Nam') ? getCountryFlagHtml(c.country) : '';
            return `
                <span class="creator-chip ${isActive}" data-name="${slug}">
                    ${cFlagHtml || '<span>👤</span>'}
                    <span>${dName}</span>
                </span>
            `;
        }).join('');

        elements.creatorRibbon.querySelectorAll('.creator-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const slug = chip.getAttribute('data-name');
                selectCreator(slug);
            });
        });
    }

    async function selectCreator(name) {
        if (!name) return;
        state.selectedCreator = name;
        state.currentPage = 1;
        elements.creatorSelect.value = name;

        // Cập nhật trạng thái active trên thanh ribbon
        elements.creatorRibbon.querySelectorAll('.creator-chip').forEach(chip => {
            if (chip.getAttribute('data-name') === name) chip.classList.add('active');
            else chip.classList.remove('active');
        });

        // 1. KIỂM TRA BỘ ĐỆM RAM TRÌNH DUYỆT: MỞ TỨC THÌ 0 GIÂY KHÔNG CẦN CHỜ MẠNG!
        if (state.creatorCache[name] && (state.creatorCache[name].photos.length + state.creatorCache[name].videos.length > 0)) {
            const cached = state.creatorCache[name];
            processMediaItems(cached.photos, cached.videos);
            return;
        }

        const label = name === '__all__' ? 'tất cả Creator' : name;
        elements.cinemaGrid.innerHTML = `
            <div class="cinema-loading">
                <div class="cinema-spinner"></div>
                <span>Đang nạp kho ảnh & video của ${label}...</span>
            </div>
        `;

        try {
            let resData = null;
            if (state.source === 'local') {
                const creatorObj = state.creators.find(c => (c.slug || c.name) === name);
                const path = creatorObj ? creatorObj.path : '';
                const res = await fetch(`/api/local/creator?path=${encodeURIComponent(path)}`);
                const data = await res.json();
                if (data.success && data.data) resData = data.data;
            } else {
                let apiUrl = '';
                if (name === '__all__') {
                    apiUrl = state.selectedCountry && state.selectedCountry !== 'all'
                        ? `/api/drive/creator/all?country=${encodeURIComponent(state.selectedCountry)}`
                        : '/api/drive/creator/all';
                } else {
                    apiUrl = `/api/drive/creator/${encodeURI(name)}`;
                }
                const res = await fetch(apiUrl);
                const data = await res.json();
                if (data.success && data.data) resData = data.data;
            }

            if (resData) {
                // Chỉ lưu vào RAM trình duyệt nếu có dữ liệu để tránh lưu nhầm cache rỗng
                if ((resData.photos && resData.photos.length > 0) || (resData.videos && resData.videos.length > 0)) {
                    state.creatorCache[name] = {
                        photos: resData.photos || [],
                        videos: resData.videos || []
                    };
                }
                processMediaItems(resData.photos, resData.videos);
            }
        } catch (err) {
            console.error('Error fetching creator media:', err);
            showToast('Lỗi khi tải ảnh/video', 'error');
        }
    }

    function processMediaItems(photos, videos) {
        const unifiedPhotos = (photos || []).map((p, idx) => {
            const fId = p.id || '';
            const thumbUrl = p.thumbnail_url || (fId ? `https://lh3.googleusercontent.com/d/${fId}=w500` : (p.stream_url || ''));
            const streamUrl = p.stream_url || (fId ? `/api/media/drive/stream?id=${fId}&name=${encodeURIComponent(p.name)}` : '');
            return {
                id: 'photo_' + idx,
                type: 'photo',
                name: p.name,
                creator: p.creator || '',
                country: p.country || '',
                size_str: p.size_str,
                date: p.mod_time,
                file_id: fId,
                thumbnail_url: thumbUrl,
                stream_url: streamUrl,
                drive_preview_url: p.drive_preview_url || (fId ? `https://drive.google.com/file/d/${fId}/preview` : ''),
                drive_url: p.drive_view_url || (fId ? `https://drive.google.com/file/d/${fId}/view` : ''),
                is_local: state.source === 'local',
            };
        });

        const unifiedVideos = (videos || []).map((v, idx) => {
            const fId = v.id || '';
            const thumbUrl = v.thumbnail_url || (fId ? `https://lh3.googleusercontent.com/d/${fId}=w500` : (v.full_path ? `/api/media/thumbnail?file=${encodeURIComponent(v.full_path)}` : ''));
            const streamUrl = v.stream_url || (fId ? `/api/media/drive/stream?id=${fId}&name=${encodeURIComponent(v.name)}` : '');
            return {
                id: 'video_' + idx,
                type: 'video',
                name: v.name,
                creator: v.creator || '',
                country: v.country || '',
                size_str: v.size_str,
                date: v.mod_time,
                file_id: fId,
                thumbnail_url: thumbUrl,
                stream_url: streamUrl,
                drive_preview_url: v.drive_preview_url || (fId ? `https://drive.google.com/file/d/${fId}/preview` : ''),
                drive_url: v.drive_view_url || (fId ? `https://drive.google.com/file/d/${fId}/view` : ''),
                is_local: state.source === 'local',
            };
        });

        state.mediaItems = [...unifiedVideos, ...unifiedPhotos];
        state.videoList = unifiedVideos;
        state.photoList = unifiedPhotos;

        elements.badgeCntAll.textContent = state.mediaItems.length;
        elements.badgeCntVideo.textContent = unifiedVideos.length;
        elements.badgeCntPhoto.textContent = unifiedPhotos.length;

        filterAndRenderGrid();
    }

    // ==========================================
    // GRID RENDERING
    // ==========================================

    function renderCardHtml(it) {
        const isVid = it.type === 'video';
        const badgeClass = isVid ? 'badge-video' : 'badge-photo';
        const badgeText = isVid ? '🎬 VIDEO' : '📸 ẢNH';
        const thumbSrc = it.thumbnail_url || (it.file_id ? `https://lh3.googleusercontent.com/d/${it.file_id}=w500` : it.stream_url);
        const fallbackSrc = it.file_id ? `/api/media/thumbnail?id=${it.file_id}&proxy=1` : '/static/placeholder.svg';

        // Tối ưu tên file: Ẩn tag creator nếu đang chọn 1 creator cụ thể để tránh lặp lại thô kệch
        const isSpecificCreator = state.selectedCreator && state.selectedCreator !== '__all__';
        let creatorPrefix = '';
        if (!isSpecificCreator && it.creator) {
            const cFlagHtml = (it.country && it.country !== 'Việt Nam') ? `${it.country} • ` : '';
            creatorPrefix = `<span class="creator-tag-pill">[${cFlagHtml}${it.creator}]</span>`;
        }

        // Format ngày tháng thân thiện cho người dùng
        const formattedDate = formatDate(it.date);

        return `
            <div class="media-card" data-id="${it.id}" data-type="${it.type}">
                <div class="media-poster-box">
                    <span class="media-type-badge ${badgeClass}">${badgeText}</span>
                    <span class="media-size-badge">${it.size_str || ''}</span>

                    <img src="${thumbSrc}" 
                         alt="${it.name}" 
                         loading="lazy" 
                         onerror="if(this.getAttribute('data-err')!=='1'){this.setAttribute('data-err','1');this.src='${fallbackSrc}';}else{this.src='/static/placeholder.svg';}">

                    ${isVid ? `
                        <div class="media-play-glow" title="Nhấn để phát video chuẩn Rạp Chiếu">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                        </div>
                    ` : ''}
                </div>
                <div class="media-meta-box">
                    <span class="media-title" title="${it.name}">
                        ${creatorPrefix}${it.name}
                    </span>
                    <div class="media-sub-meta">
                        <span class="meta-size-text">${it.size_str || ''}</span>
                        <span class="meta-date-text" title="${it.date || ''}">${formattedDate}</span>
                    </div>
                </div>
            </div>
        `;
    }

    function renderGridPage() {
        const totalItems = state.filteredItems.length;
        const totalPages = Math.ceil(totalItems / state.pageSize) || 1;

        if (state.currentPage > totalPages) state.currentPage = totalPages;
        if (state.currentPage < 1) state.currentPage = 1;

        if (totalItems === 0) {
            elements.cinemaGrid.innerHTML = `
                <div class="cinema-empty">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    <span>Không tìm thấy ảnh hoặc video nào phù hợp</span>
                </div>
            `;
            elements.mediaStatusText.textContent = '0 tệp tin';
            if (elements.galleryPagination) elements.galleryPagination.style.display = 'none';
            return;
        }

        const startIndex = (state.currentPage - 1) * state.pageSize;
        const endIndex = Math.min(startIndex + state.pageSize, totalItems);
        const pageItems = state.filteredItems.slice(startIndex, endIndex);

        // Hiển thị dải số tệp và số trang rõ ràng
        elements.mediaStatusText.textContent = `Hiển thị ${startIndex + 1} - ${endIndex} / ${totalItems.toLocaleString('vi-VN')} tệp • Trang ${state.currentPage}/${totalPages} (60 tệp/trang)`;

        const temp = document.createElement('div');
        temp.innerHTML = pageItems.map(it => renderCardHtml(it)).join('');
        const fragment = document.createDocumentFragment();
        Array.from(temp.children).forEach(card => {
            card.addEventListener('click', () => {
                const id = card.getAttribute('data-id');
                const type = card.getAttribute('data-type');
                if (type === 'video') openTheaterVideoById(id);
                else openPhotoLightboxById(id);
            });
            fragment.appendChild(card);
        });

        elements.cinemaGrid.innerHTML = '';
        elements.cinemaGrid.appendChild(fragment);

        renderPaginationControls(totalPages, totalItems);
    }

    function renderPaginationControls(totalPages, totalItems) {
        if (!elements.galleryPagination) return;
        if (totalPages <= 1) {
            elements.galleryPagination.style.display = 'none';
            return;
        }

        elements.galleryPagination.style.display = 'flex';
        const cur = state.currentPage;

        let html = '';

        // Nút Trang Đầu & Nút Trước
        html += `<button class="page-btn" data-page="1" ${cur === 1 ? 'disabled' : ''} title="Trang đầu">⏮ Đầu</button>`;
        html += `<button class="page-btn" data-page="${cur - 1}" ${cur === 1 ? 'disabled' : ''} title="Trang trước">◀ Trước</button>`;

        // Thuật toán hiển thị các nút số trang thông minh
        const pages = [];
        if (totalPages <= 9) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            let start = Math.max(2, cur - 2);
            let end = Math.min(totalPages - 1, cur + 2);

            if (cur <= 4) {
                start = 2;
                end = 6;
            } else if (cur >= totalPages - 3) {
                start = totalPages - 5;
                end = totalPages - 1;
            }

            if (start > 2) pages.push('ellipsis');
            for (let i = start; i <= end; i++) pages.push(i);
            if (end < totalPages - 1) pages.push('ellipsis');
            pages.push(totalPages);
        }

        // Render các nút số trang
        pages.forEach(p => {
            if (p === 'ellipsis') {
                html += `<span class="page-ellipsis">…</span>`;
            } else {
                const isActive = p === cur ? 'active' : '';
                html += `<button class="page-btn ${isActive}" data-page="${p}">${p}</button>`;
            }
        });

        // Nút Sau & Nút Cuối
        html += `<button class="page-btn" data-page="${cur + 1}" ${cur === totalPages ? 'disabled' : ''} title="Trang kế tiếp">Sau ▶</button>`;
        html += `<button class="page-btn" data-page="${totalPages}" ${cur === totalPages ? 'disabled' : ''} title="Trang cuối">Cuối ⏭</button>`;

        // Hộp Nhảy Trang Nhanh & Tóm tắt
        html += `
            <div class="page-info-box">
                <span class="page-info-text">Trang <strong>${cur}</strong> / ${totalPages}</span>
                <div class="page-jump-box">
                    <input type="number" min="1" max="${totalPages}" value="${cur}" class="page-jump-input" id="page-jump-input" title="Nhập số trang">
                    <button class="page-jump-btn" id="page-jump-btn">Đi</button>
                </div>
            </div>
        `;

        elements.galleryPagination.innerHTML = html;

        // Gắn sự kiện click chuyển trang
        elements.galleryPagination.querySelectorAll('.page-btn[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = parseInt(btn.getAttribute('data-page'), 10);
                if (!isNaN(p)) goToPage(p);
            });
        });

        const jumpInput = document.getElementById('page-jump-input');
        const jumpBtn = document.getElementById('page-jump-btn');
        if (jumpBtn && jumpInput) {
            const doJump = () => {
                const val = parseInt(jumpInput.value, 10);
                if (!isNaN(val)) goToPage(val);
            };
            jumpBtn.addEventListener('click', doJump);
            jumpInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') doJump();
            });
        }
    }

    function goToPage(page) {
        const totalPages = Math.ceil(state.filteredItems.length / state.pageSize) || 1;
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;
        if (page === state.currentPage) return;

        state.currentPage = page;
        renderGridPage();

        // Cuộn mượt lên đầu danh sách media
        const main = document.querySelector('.gallery-main');
        if (main) {
            main.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    function filterAndRenderGrid() {
        let items = [...state.mediaItems];

        // 1. Lọc theo Loại media (All, Video, Photo)
        if (state.mediaTypeFilter === 'video') {
            items = items.filter(it => it.type === 'video');
        } else if (state.mediaTypeFilter === 'photo') {
            items = items.filter(it => it.type === 'photo');
        }

        // 2. Tìm kiếm (Tìm theo tên file, tên creator, quốc gia)
        const q = state.searchQuery.trim().toLowerCase();
        if (q) {
            items = items.filter(it => 
                it.name.toLowerCase().includes(q) || 
                (it.creator && it.creator.toLowerCase().includes(q)) || 
                (it.country && it.country.toLowerCase().includes(q))
            );
        }

        // 3. Sắp xếp (Sorting)
        const sort = state.sortBy || 'date-desc';
        if (sort === 'date-desc') {
            items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        } else if (sort === 'date-asc') {
            items.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        } else if (sort === 'size-desc') {
            items.sort((a, b) => parseBytesFromStr(b.size_str) - parseBytesFromStr(a.size_str));
        } else if (sort === 'size-asc') {
            items.sort((a, b) => parseBytesFromStr(a.size_str) - parseBytesFromStr(b.size_str));
        } else if (sort === 'name-asc') {
            items.sort((a, b) => a.name.localeCompare(b.name));
        }

        state.filteredItems = items;
        state.currentPage = 1;
        renderGridPage();
    }

    // ==========================================
    // THEATER VIDEO PLAYER (DEFAULT: VIDEO.JS)
    // ==========================================

    let vjsPlayer = null;

    function getOrCreatePlayer() {
        if (vjsPlayer) return vjsPlayer;
        if (window.videojs) {
            try {
                vjsPlayer = videojs('theater-video', {
                    controls: true,
                    autoplay: true,
                    preload: 'auto',
                    fluid: false,
                    fill: true,
                    playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
                    controlBar: {
                        pictureInPictureToggle: true,
                        volumePanel: { inline: false }
                    }
                });

                vjsPlayer.on('ended', () => {
                    if (elements.chkAutoNext && elements.chkAutoNext.checked) {
                        playNextVideo();
                    }
                });

                vjsPlayer.on('error', () => {
                    const vid = state.videoList[state.currentVideoIndex];
                    if (vid && vid.drive_preview_url && state.playerEngine !== 'drive') {
                        showToast('Video.js chuyển sang Google Drive Embed...', 'info');
                        state.playerEngine = 'drive';
                        playTheaterVideo(state.currentVideoIndex);
                    }
                });
            } catch (err) {
                console.warn('Video.js init fallback:', err);
            }
        }
        return vjsPlayer;
    }

    function openTheaterVideoById(id) {
        const vIndex = state.videoList.findIndex(v => v.id === id);
        if (vIndex !== -1) {
            playTheaterVideo(vIndex);
        }
    }

    function playTheaterVideo(index) {
        if (index < 0 || index >= state.videoList.length) return;
        state.currentVideoIndex = index;
        const vid = state.videoList[index];

        elements.theaterVideoTitle.textContent = `${index + 1}/${state.videoList.length} - ${vid.name}`;
        elements.theaterDownloadBtn.href = vid.stream_url + '&dl=1';

        // External Drive link button
        if (vid.drive_url) {
            elements.theaterExternalBtn.href = vid.drive_url;
            elements.theaterExternalBtn.style.display = 'inline-flex';
            elements.btnEngineDrive.style.display = 'inline-block';
        } else {
            elements.theaterExternalBtn.style.display = 'none';
            elements.btnEngineDrive.style.display = 'none';
        }

        const player = getOrCreatePlayer();

        // Switch between Video.js Player vs Google Drive Embed Player
        if (state.playerEngine === 'drive' && vid.drive_preview_url) {
            if (player) {
                player.pause();
                const vjsEl = player.el();
                if (vjsEl) vjsEl.style.display = 'none';
            } else if (elements.theaterVideo) {
                elements.theaterVideo.pause();
                elements.theaterVideo.style.display = 'none';
            }
            elements.theaterDriveIframe.style.display = 'block';
            elements.theaterDriveIframe.src = vid.drive_preview_url;
            elements.theaterEngineBadge.textContent = '☁️ DRIVE EMBED';
            elements.btnEngineDrive.classList.add('active');
            elements.btnEngineHtml5.classList.remove('active');
        } else {
            // Video.js Cinema Player (Default)
            if (elements.theaterDriveIframe) {
                elements.theaterDriveIframe.src = '';
                elements.theaterDriveIframe.style.display = 'none';
            }

            if (player) {
                const vjsEl = player.el();
                if (vjsEl) vjsEl.style.display = 'block';
                player.src({ src: vid.stream_url, type: 'video/mp4' });
                player.ready(() => {
                    player.play().catch(() => {
                        player.muted(true);
                        player.play().catch(() => { });
                    });
                });
                player.loop(state.isLooping);
            } else {
                elements.theaterVideo.style.display = 'block';
                elements.theaterVideo.src = vid.stream_url;
                elements.theaterVideo.load();
                elements.theaterVideo.play().catch(() => {
                    elements.theaterVideo.muted = true;
                    elements.theaterVideo.play().catch(() => { });
                });
            }

            elements.theaterEngineBadge.textContent = '🎬 VIDEO.JS';
            elements.btnEngineHtml5.classList.add('active');
            elements.btnEngineDrive.classList.remove('active');
        }

        renderTheaterPlaylist();
        elements.theaterModal.classList.add('active');
    }

    function renderTheaterPlaylist() {
        elements.playlistCount.textContent = state.videoList.length;
        elements.theaterPlaylistItems.innerHTML = state.videoList.map((v, i) => {
            const isActive = i === state.currentVideoIndex ? 'active' : '';
            return `
                <li class="playlist-item ${isActive}" data-index="${i}">
                    <span class="playlist-item-idx">${i + 1}</span>
                    <div class="playlist-item-info">
                        <div class="playlist-item-title">${v.name}</div>
                        <div class="playlist-item-sub">${v.size_str}</div>
                    </div>
                    ${isActive ? '<span style="color: var(--c-cyan)">▶</span>' : ''}
                </li>
            `;
        }).join('');

        elements.theaterPlaylistItems.querySelectorAll('.playlist-item').forEach(item => {
            item.addEventListener('click', () => {
                const idx = parseInt(item.getAttribute('data-index'), 10);
                playTheaterVideo(idx);
            });
        });

        // Scroll active item into view
        const activeItem = elements.theaterPlaylistItems.querySelector('.playlist-item.active');
        if (activeItem) activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function closeTheater() {
        elements.theaterModal.classList.remove('active');
        if (vjsPlayer) {
            vjsPlayer.pause();
        } else if (elements.theaterVideo) {
            elements.theaterVideo.pause();
            elements.theaterVideo.src = '';
        }
        if (elements.theaterDriveIframe) {
            elements.theaterDriveIframe.src = '';
        }
    }

    function playNextVideo() {
        if (state.currentVideoIndex < state.videoList.length - 1) {
            playTheaterVideo(state.currentVideoIndex + 1);
        } else if (state.isLooping && state.videoList.length > 0) {
            playTheaterVideo(0);
        }
    }

    function playPrevVideo() {
        if (state.currentVideoIndex > 0) {
            playTheaterVideo(state.currentVideoIndex - 1);
        }
    }

    // ==========================================
    // PHOTO LIGHTBOX SLIDESHOW
    // ==========================================

    function openPhotoLightboxById(id) {
        const pIndex = state.photoList.findIndex(p => p.id === id);
        if (pIndex !== -1) {
            showLightboxPhoto(pIndex);
        }
    }

    function showLightboxPhoto(index) {
        if (index < 0 || index >= state.photoList.length) return;
        state.currentPhotoIndex = index;
        const photo = state.photoList[index];

        state.zoomLevel = 1;
        state.rotationDeg = 0;
        applyPhotoTransform();

        elements.lbCurrentImage.src = photo.stream_url;
        elements.lbCounter.textContent = `${index + 1} / ${state.photoList.length}`;
        elements.lbTitle.textContent = photo.name;
        elements.lbBtnDownload.href = photo.stream_url + (photo.is_local ? '&dl=1' : '');

        renderFilmstrip();
        elements.photoLightbox.classList.add('active');
    }

    function renderFilmstrip() {
        elements.lbFilmstrip.innerHTML = state.photoList.map((p, i) => {
            const isActive = i === state.currentPhotoIndex ? 'active' : '';
            const thumbSrc = p.thumbnail_url || p.stream_url;
            return `
                <div class="filmstrip-thumb ${isActive}" data-index="${i}">
                    <img src="${thumbSrc}" alt="thumb" loading="lazy" onerror="this.src='/static/placeholder.svg'">
                </div>
            `;
        }).join('');

        elements.lbFilmstrip.querySelectorAll('.filmstrip-thumb').forEach(thumb => {
            thumb.addEventListener('click', () => {
                const idx = parseInt(thumb.getAttribute('data-index'), 10);
                showLightboxPhoto(idx);
            });
        });

        const activeThumb = elements.lbFilmstrip.querySelector('.filmstrip-thumb.active');
        if (activeThumb) activeThumb.scrollIntoView({ inline: 'center', behavior: 'smooth' });
    }

    function nextPhoto() {
        if (state.currentPhotoIndex < state.photoList.length - 1) {
            showLightboxPhoto(state.currentPhotoIndex + 1);
        } else {
            showLightboxPhoto(0); // Vòng lặp
        }
    }

    function prevPhoto() {
        if (state.currentPhotoIndex > 0) {
            showLightboxPhoto(state.currentPhotoIndex - 1);
        } else {
            showLightboxPhoto(state.photoList.length - 1);
        }
    }

    function applyPhotoTransform() {
        elements.lbCurrentImage.style.transform = `scale(${state.zoomLevel}) rotate(${state.rotationDeg}deg)`;
    }

    function toggleSlideshow() {
        if (state.slideshowTimer) {
            clearInterval(state.slideshowTimer);
            state.slideshowTimer = null;
            elements.lbBtnSlideshow.classList.remove('active');
            elements.lbBtnSlideshow.textContent = '▶ Trình chiếu';
            showToast('Đã dừng trình chiếu tự động');
        } else {
            state.slideshowTimer = setInterval(nextPhoto, 3000);
            elements.lbBtnSlideshow.classList.add('active');
            elements.lbBtnSlideshow.textContent = '⏸ Dừng';
            showToast('Bắt đầu trình chiếu (3 giây/ảnh)');
        }
    }

    function closeLightbox() {
        if (state.slideshowTimer) {
            clearInterval(state.slideshowTimer);
            state.slideshowTimer = null;
        }
        elements.photoLightbox.classList.remove('active');
        elements.lbCurrentImage.src = '';
    }

    // ==========================================
    // EVENT LISTENERS INITIALIZATION
    // ==========================================

    function initEvents() {
        // Refresh / Sync Cache Button
        if (elements.btnRefreshCache) {
            elements.btnRefreshCache.addEventListener('click', async () => {
                elements.btnRefreshCache.classList.add('refreshing');
                state.creatorCache = {};
                showToast('Đang đồng bộ dữ liệu mới nhất từ Google Drive...', 'info');
                await loadCreators();
                elements.btnRefreshCache.classList.remove('refreshing');
                showToast('Đã đồng bộ xong dữ liệu!', 'info');
            });
        }

        // Country select dropdown
        if (elements.countrySelect) {
            elements.countrySelect.addEventListener('change', (e) => {
                selectCountry(e.target.value);
            });
        }

        // Creator select dropdown
        if (elements.creatorSelect) {
            elements.creatorSelect.addEventListener('change', (e) => {
                selectCreator(e.target.value);
            });
        }

        // Filter tabs (All, Video, Photo)
        elements.mediaFilters.forEach(tab => {
            tab.addEventListener('click', () => {
                elements.mediaFilters.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                state.mediaTypeFilter = tab.getAttribute('data-type');
                filterAndRenderGrid();
            });
        });

        // Search input & Clear button
        if (elements.gallerySearch) {
            elements.gallerySearch.addEventListener('input', (e) => {
                state.searchQuery = e.target.value;
                if (elements.btnSearchClear) {
                    elements.btnSearchClear.style.display = state.searchQuery ? 'flex' : 'none';
                }
                filterAndRenderGrid();
            });
        }

        if (elements.btnSearchClear) {
            elements.btnSearchClear.addEventListener('click', () => {
                if (elements.gallerySearch) {
                    elements.gallerySearch.value = '';
                    elements.gallerySearch.focus();
                }
                state.searchQuery = '';
                elements.btnSearchClear.style.display = 'none';
                filterAndRenderGrid();
            });
        }

        // Sort Selector
        if (elements.mediaSortSelect) {
            elements.mediaSortSelect.addEventListener('change', (e) => {
                state.sortBy = e.target.value;
                filterAndRenderGrid();
            });
        }

        // Smooth Mouse Wheel Horizontal Scroll for Ribbons
        const setupHorizontalWheelScroll = (el) => {
            if (!el) return;
            el.addEventListener('wheel', (e) => {
                if (e.deltaY !== 0) {
                    e.preventDefault();
                    el.scrollLeft += e.deltaY;
                }
            }, { passive: false });
        };
        setupHorizontalWheelScroll(elements.countryRibbon);
        setupHorizontalWheelScroll(elements.creatorRibbon);

        // Arrow buttons for Country Ribbon
        if (elements.btnCountryScrollLeft && elements.countryRibbon) {
            elements.btnCountryScrollLeft.addEventListener('click', () => {
                elements.countryRibbon.scrollBy({ left: -240, behavior: 'smooth' });
            });
        }
        if (elements.btnCountryScrollRight && elements.countryRibbon) {
            elements.btnCountryScrollRight.addEventListener('click', () => {
                elements.countryRibbon.scrollBy({ left: 240, behavior: 'smooth' });
            });
        }

        // Arrow buttons for Creator Ribbon
        if (elements.btnCreatorScrollLeft && elements.creatorRibbon) {
            elements.btnCreatorScrollLeft.addEventListener('click', () => {
                elements.creatorRibbon.scrollBy({ left: -260, behavior: 'smooth' });
            });
        }
        if (elements.btnCreatorScrollRight && elements.creatorRibbon) {
            elements.btnCreatorScrollRight.addEventListener('click', () => {
                elements.creatorRibbon.scrollBy({ left: 260, behavior: 'smooth' });
            });
        }

        // Density toggle
        elements.densityBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                elements.densityBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const density = btn.getAttribute('data-cols');
                if (density === 'large') {
                    elements.cinemaGrid.classList.add('cols-large');
                } else {
                    elements.cinemaGrid.classList.remove('cols-large');
                }
            });
        });

        // Theater modal events
        elements.theaterCloseBtn.addEventListener('click', closeTheater);
        elements.theaterBackdrop.addEventListener('click', closeTheater);

        // Player Engine switches (Cinema HTML5 vs Drive Embed)
        elements.btnEngineHtml5.addEventListener('click', () => {
            state.playerEngine = 'html5';
            if (state.currentVideoIndex >= 0) {
                playTheaterVideo(state.currentVideoIndex);
            }
        });
        elements.btnEngineDrive.addEventListener('click', () => {
            state.playerEngine = 'drive';
            if (state.currentVideoIndex >= 0) {
                playTheaterVideo(state.currentVideoIndex);
            }
        });

        // Auto next on video end
        if (elements.theaterVideo) {
            elements.theaterVideo.addEventListener('ended', () => {
                if (elements.chkAutoNext && elements.chkAutoNext.checked) {
                    playNextVideo();
                }
            });
        }

        // Loop button
        elements.theaterLoopBtn.addEventListener('click', () => {
            state.isLooping = !state.isLooping;
            if (vjsPlayer) vjsPlayer.loop(state.isLooping);
            else if (elements.theaterVideo) elements.theaterVideo.loop = state.isLooping;
            elements.theaterLoopBtn.classList.toggle('active', state.isLooping);
            showToast(state.isLooping ? 'Đã bật lặp lại video' : 'Đã tắt lặp lại');
        });

        // Picture in Picture
        elements.theaterPipBtn.addEventListener('click', async () => {
            try {
                if (document.pictureInPictureElement) {
                    await document.exitPictureInPicture();
                } else if (vjsPlayer && vjsPlayer.requestPictureInPicture) {
                    await vjsPlayer.requestPictureInPicture();
                } else if (elements.theaterVideo) {
                    await elements.theaterVideo.requestPictureInPicture();
                }
            } catch (err) {
                showToast('Trình duyệt không hỗ trợ PiP', 'error');
            }
        });

        // Video playback speeds
        elements.speedBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                elements.speedBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const spd = parseFloat(btn.getAttribute('data-speed'));
                if (vjsPlayer) vjsPlayer.playbackRate(spd);
                else if (elements.theaterVideo) elements.theaterVideo.playbackRate = spd;
            });
        });

        // Lightbox events
        elements.lbBtnClose.addEventListener('click', closeLightbox);
        elements.lightboxOverlay.addEventListener('click', closeLightbox);
        elements.lbBtnNext.addEventListener('click', nextPhoto);
        elements.lbBtnPrev.addEventListener('click', prevPhoto);
        elements.lbBtnSlideshow.addEventListener('click', toggleSlideshow);

        elements.lbBtnZoomIn.addEventListener('click', () => {
            state.zoomLevel = Math.min(3, state.zoomLevel + 0.3);
            applyPhotoTransform();
        });
        elements.lbBtnZoomReset.addEventListener('click', () => {
            state.zoomLevel = 1;
            applyPhotoTransform();
        });
        elements.lbBtnRotate.addEventListener('click', () => {
            state.rotationDeg = (state.rotationDeg + 90) % 360;
            applyPhotoTransform();
        });

        // TOUCH SWIPE NAVIGATION FOR MOBILE LIGHTBOX
        let touchStartX = 0;
        let touchStartY = 0;
        if (elements.photoLightbox) {
            elements.photoLightbox.addEventListener('touchstart', (e) => {
                if (e.touches && e.touches.length === 1) {
                    touchStartX = e.touches[0].clientX;
                    touchStartY = e.touches[0].clientY;
                }
            }, { passive: true });

            elements.photoLightbox.addEventListener('touchend', (e) => {
                if (e.changedTouches && e.changedTouches.length === 1) {
                    const diffX = e.changedTouches[0].clientX - touchStartX;
                    const diffY = e.changedTouches[0].clientY - touchStartY;
                    if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
                        if (diffX < 0) {
                            nextPhoto();
                        } else {
                            prevPhoto();
                        }
                    }
                }
            }, { passive: true });
        }

        // KEYBOARD SHORTCUTS
        document.addEventListener('keydown', (e) => {
            // Search shortcut: Nhấn '/' khi không đang nhập ô input
            if (e.key === '/' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                if (elements.gallerySearch) {
                    elements.gallerySearch.focus();
                    elements.gallerySearch.select();
                }
                return;
            }

            // Thoát khỏi ô tìm kiếm khi nhấn ESC
            if (e.key === 'Escape' && document.activeElement === elements.gallerySearch) {
                elements.gallerySearch.blur();
                return;
            }

            // If in Theater video
            if (elements.theaterModal.classList.contains('active')) {
                if (e.key === 'Escape') closeTheater();
                if (e.key === ' ' && e.target.tagName !== 'INPUT') {
                    e.preventDefault();
                    if (vjsPlayer) {
                        if (vjsPlayer.paused()) vjsPlayer.play();
                        else vjsPlayer.pause();
                    } else if (elements.theaterVideo) {
                        if (elements.theaterVideo.paused) elements.theaterVideo.play();
                        else elements.theaterVideo.pause();
                    }
                }
                if (e.key === 'ArrowRight') {
                    if (vjsPlayer) vjsPlayer.currentTime(vjsPlayer.currentTime() + 5);
                    else if (elements.theaterVideo) elements.theaterVideo.currentTime += 5;
                }
                if (e.key === 'ArrowLeft') {
                    if (vjsPlayer) vjsPlayer.currentTime(Math.max(0, vjsPlayer.currentTime() - 5));
                    else if (elements.theaterVideo) elements.theaterVideo.currentTime -= 5;
                }
                if (e.key.toLowerCase() === 'n') playNextVideo();
                if (e.key.toLowerCase() === 'p') playPrevVideo();
                if (e.key.toLowerCase() === 'f') {
                    if (vjsPlayer) {
                        if (vjsPlayer.isFullscreen()) vjsPlayer.exitFullscreen();
                        else vjsPlayer.requestFullscreen();
                    } else {
                        if (document.fullscreenElement) document.exitFullscreen();
                        else if (elements.theaterVideo) elements.theaterVideo.requestFullscreen();
                    }
                }
                if (e.key.toLowerCase() === 'm') {
                    if (vjsPlayer) vjsPlayer.muted(!vjsPlayer.muted());
                    else if (elements.theaterVideo) elements.theaterVideo.muted = !elements.theaterVideo.muted;
                }
            }

            // If in Photo Lightbox
            if (elements.photoLightbox.classList.contains('active')) {
                if (e.key === 'Escape') closeLightbox();
                if (e.key === 'ArrowRight') nextPhoto();
                if (e.key === 'ArrowLeft') prevPhoto();
            }
        });
    }

    // Init App
    document.addEventListener('DOMContentLoaded', () => {
        initEvents();
        loadCreators();
    });
})();
