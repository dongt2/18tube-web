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
        theaterVideoTitle: document.getElementById('theater-video-title'),
        theaterEngineBadge: document.getElementById('theater-engine-badge'),
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
        galleryTopPagination: document.getElementById('gallery-top-pagination'),
        btnToggleAspect: document.getElementById('btn-toggle-aspect'),
        creatorProfileCard: document.getElementById('creator-profile-card'),

        // New feature elements: Favorites, Random & Boss Mode
        badgeCntFav: document.getElementById('badge-cnt-fav'),
        btnRandomVideo: document.getElementById('btn-random-video'),
        btnBossMode: document.getElementById('btn-boss-mode'),
        btnExitBossMode: document.getElementById('btn-exit-boss-mode'),
        bossModeScreen: document.getElementById('boss-mode-screen'),
        btnTheaterFav: document.getElementById('btn-theater-fav'),
        theaterFavIcon: document.getElementById('theater-fav-icon'),
        theaterFavText: document.getElementById('theater-fav-text'),
        lbBtnFav: document.getElementById('lb-btn-fav'),
        btnToggleHoverPreview: document.getElementById('btn-toggle-hover-preview'),
    };

    // ==========================================
    // UTILITIES & FORMATTING
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
            return `<img class="country-flag-img" src="https://flagcdn.com/28x21/${info.iso}.png" srcset="https://flagcdn.com/56x42/${info.iso}.png 2x" width="20" height="15" alt="${info.name}" title="${info.name}" onerror="this.outerHTML='<span>${info.flag}</span>'">`;
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

    function formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function formatDuration(sec) {
        if (!sec || isNaN(sec)) return '00:00';
        const s = Math.floor(sec);
        const m = Math.floor(s / 60);
        const remS = s % 60;
        const h = Math.floor(m / 60);
        const remM = m % 60;
        const pad = (n) => String(n).padStart(2, '0');
        if (h > 0) return `${h}:${pad(remM)}:${pad(remS)}`;
        return `${pad(remM)}:${pad(remS)}`;
    }

    // ==========================================
    // 1. FAVORITES SYSTEM (PERSISTENT VIA LOCALSTORAGE)
    // ==========================================
    const FAV_STORAGE_KEY = '18tube_favorites';
    let favoritesMap = {};

    function loadFavorites() {
        try {
            const raw = localStorage.getItem(FAV_STORAGE_KEY);
            favoritesMap = raw ? JSON.parse(raw) : {};
        } catch (_) {
            favoritesMap = {};
        }
        updateFavoritesBadge();
    }

    function saveFavorites() {
        try {
            localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(favoritesMap));
        } catch (_) {}
        updateFavoritesBadge();
    }

    function getItemKey(item) {
        if (!item) return '';
        return item.file_id || item.name || item.id || '';
    }

    function isItemFavorite(item) {
        const key = getItemKey(item);
        return Boolean(key && favoritesMap[key]);
    }

    function toggleItemFavorite(item) {
        const key = getItemKey(item);
        if (!key) return false;

        if (favoritesMap[key]) {
            delete favoritesMap[key];
            saveFavorites();
            showToast(`Đã bỏ yêu thích: ${item.name}`, 'info');
            syncAllFavUI(item, false);
            return false;
        } else {
            favoritesMap[key] = {
                id: item.id,
                type: item.type,
                name: item.name,
                creator: item.creator || '',
                country: item.country || '',
                size_str: item.size_str || '',
                date: item.date || '',
                file_id: item.file_id || '',
                thumbnail_url: item.thumbnail_url || '',
                stream_url: item.stream_url || '',
                drive_preview_url: item.drive_preview_url || '',
                drive_url: item.drive_url || '',
                is_local: item.is_local || false,
                favorited_at: Date.now()
            };
            saveFavorites();
            showToast(`❤️ Đã thêm vào danh sách yêu thích!`, 'success');
            syncAllFavUI(item, true);
            return true;
        }
    }

    function updateFavoritesBadge() {
        const cnt = Object.keys(favoritesMap).length;
        if (elements.badgeCntFav) {
            elements.badgeCntFav.textContent = cnt;
        }
    }

    function syncAllFavUI(item, isFav) {
        const key = getItemKey(item);
        const curVid = state.videoList[state.currentVideoIndex];
        if (curVid && getItemKey(curVid) === key) {
            syncTheaterFavButton(curVid);
        }
        const curPhoto = state.photoList[state.currentPhotoIndex];
        if (curPhoto && getItemKey(curPhoto) === key) {
            syncLightboxFavButton(curPhoto);
        }
        const card = document.querySelector(`.media-card[data-id="${item.id}"]`);
        if (card) {
            const favBtn = card.querySelector('.media-card-fav-btn');
            if (favBtn) {
                favBtn.classList.toggle('is-fav', isFav);
                favBtn.title = isFav ? 'Bỏ yêu thích' : 'Thêm vào yêu thích';
            }
        }
    }

    function syncTheaterFavButton(vid) {
        if (!elements.btnTheaterFav) return;
        const isFav = isItemFavorite(vid);
        elements.btnTheaterFav.classList.toggle('is-fav', isFav);
        if (elements.theaterFavIcon) elements.theaterFavIcon.textContent = isFav ? '❤️' : '🤍';
        if (elements.theaterFavText) elements.theaterFavText.textContent = isFav ? 'Đã thích' : 'Yêu thích';
    }

    function syncLightboxFavButton(photo) {
        if (!elements.lbBtnFav) return;
        const isFav = isItemFavorite(photo);
        elements.lbBtnFav.classList.toggle('is-fav', isFav);
        elements.lbBtnFav.textContent = isFav ? '❤️' : '🤍';
    }

    // ==========================================
    // 2. VIDEO WATCH PROGRESS (RESUME PLAYBACK)
    // ==========================================
    const PROGRESS_STORAGE_KEY = '18tube_progress';
    let progressMap = {};

    function loadProgress() {
        try {
            const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
            progressMap = raw ? JSON.parse(raw) : {};
        } catch (_) {
            progressMap = {};
        }
    }

    function saveProgress(item, time, duration) {
        const key = getItemKey(item);
        if (!key || !duration || duration <= 0 || isNaN(time)) return;

        const pct = Math.min(100, Math.max(0, (time / duration) * 100));

        // If watched more than 95%, clear progress
        if (pct >= 95) {
            delete progressMap[key];
        } else if (time > 5) {
            progressMap[key] = {
                time: Math.floor(time),
                duration: Math.floor(duration),
                pct: Math.round(pct),
                updated: Date.now()
            };
        }

        try {
            localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progressMap));
        } catch (_) {}

        // Update progress bar on card if rendered
        const card = document.querySelector(`.media-card[data-id="${item.id}"]`);
        if (card) {
            let barWrap = card.querySelector('.media-progress-bar-wrap');
            if (pct >= 95) {
                if (barWrap) barWrap.remove();
            } else if (pct > 2) {
                if (!barWrap) {
                    const poster = card.querySelector('.media-poster-box');
                    if (poster) {
                        barWrap = document.createElement('div');
                        barWrap.className = 'media-progress-bar-wrap';
                        barWrap.innerHTML = '<div class="media-progress-bar-fill"></div>';
                        poster.appendChild(barWrap);
                    }
                }
                if (barWrap) {
                    barWrap.title = `Đã xem: ${Math.round(pct)}% (${formatDuration(time)})`;
                    const fill = barWrap.querySelector('.media-progress-bar-fill');
                    if (fill) fill.style.width = `${pct}%`;
                }
            }
        }
    }

    function clearProgress(item) {
        const key = getItemKey(item);
        if (key && progressMap[key]) {
            delete progressMap[key];
            try {
                localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progressMap));
            } catch (_) {}
            const card = document.querySelector(`.media-card[data-id="${item.id}"]`);
            if (card) {
                const barWrap = card.querySelector('.media-progress-bar-wrap');
                if (barWrap) barWrap.remove();
            }
        }
    }

    function getSavedProgress(item) {
        const key = getItemKey(item);
        return (key && progressMap[key]) ? progressMap[key] : null;
    }

    // ==========================================
    // 3. RANDOM VIDEO SHUFFLE
    // ==========================================
    function playRandomVideo() {
        const vids = state.videoList && state.videoList.length > 0 ? state.videoList : [];
        if (vids.length === 0) {
            showToast('Không có video nào trong danh mục hiện tại để phát ngẫu nhiên', 'warning');
            return;
        }

        let randIdx = Math.floor(Math.random() * vids.length);
        if (vids.length > 1 && randIdx === state.currentVideoIndex) {
            randIdx = (randIdx + 1) % vids.length;
        }

        const chosenVid = vids[randIdx];
        playTheaterVideo(randIdx);
        showToast(`🎲 Đang phát ngẫu nhiên: ${chosenVid.name}`, 'info');
    }

    // ==========================================
    // 4. BOSS MODE / PRIVACY SHIELD
    // ==========================================
    let isBossModeActive = false;
    let savedOriginalTitle = document.title;

    function toggleBossMode(forceState) {
        isBossModeActive = (typeof forceState === 'boolean') ? forceState : !isBossModeActive;

        if (elements.bossModeScreen) {
            elements.bossModeScreen.style.display = isBossModeActive ? 'flex' : 'none';
        }

        if (isBossModeActive) {
            // Mute and pause playback immediately
            if (vjsPlayer) {
                vjsPlayer.pause();
                vjsPlayer.muted(true);
            }
            if (elements.theaterVideo) {
                elements.theaterVideo.pause();
                elements.theaterVideo.muted = true;
            }

            savedOriginalTitle = document.title;
            document.title = 'Bao_Cao_Ke_Hoach_Tai_Chinh_Q3-Q4_2026_Final.xlsx - Google Trang tính';
        } else {
            document.title = savedOriginalTitle || '18TUBE Cinema & Gallery - Trình Xem Video & Ảnh';
        }
    }

    // ==========================================
    // 5. HOVER VIDEO PREVIEW SYSTEM
    // ==========================================
    let hoverPreviewEnabled = true;
    let hoverTimer = null;
    let currentPreviewCard = null;
    let currentPreviewVideo = null;
    let currentPreviewPill = null;

    function stopHoverPreview() {
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
        if (currentPreviewCard) {
            currentPreviewCard.classList.remove('is-previewing');
            currentPreviewCard = null;
        }
        if (currentPreviewVideo) {
            try {
                currentPreviewVideo.pause();
                currentPreviewVideo.removeAttribute('src');
                currentPreviewVideo.load();
            } catch (_) {}
            currentPreviewVideo.remove();
            currentPreviewVideo = null;
        }
        if (currentPreviewPill) {
            currentPreviewPill.remove();
            currentPreviewPill = null;
        }
    }

    function startHoverPreview(card, itObj) {
        if (!hoverPreviewEnabled || !itObj || itObj.type !== 'video' || !itObj.stream_url) return;
        // Check if device supports hover with mouse
        if (window.matchMedia && !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

        stopHoverPreview();

        hoverTimer = setTimeout(() => {
            const posterBox = card.querySelector('.media-poster-box');
            if (!posterBox) return;

            card.classList.add('is-previewing');
            currentPreviewCard = card;

            const vid = document.createElement('video');
            vid.className = 'media-hover-preview';
            vid.muted = true;
            vid.setAttribute('muted', '');
            vid.playsInline = true;
            vid.setAttribute('playsinline', '');
            vid.loop = true;
            vid.preload = 'metadata';

            const pill = document.createElement('span');
            pill.className = 'media-preview-pill';
            pill.innerHTML = '<span class="preview-pulse-dot"></span> PREVIEW';

            // Check saved progress to preview from where user stopped, else start from beginning
            const savedProg = getSavedProgress(itObj);
            let offsetApplied = false;

            const onCanPlay = () => {
                if (!offsetApplied && savedProg && savedProg.time > 5) {
                    offsetApplied = true;
                    try { vid.currentTime = savedProg.time; } catch (_) {}
                }
                vid.play().then(() => {
                    vid.classList.add('playing');
                }).catch(() => {});
            };

            vid.addEventListener('canplay', onCanPlay, { once: true });
            vid.src = itObj.stream_url;

            posterBox.appendChild(vid);
            posterBox.appendChild(pill);

            currentPreviewVideo = vid;
            currentPreviewPill = pill;
        }, 320);
    }

    function getPreloadedData() {
        try {
            const el = document.getElementById('__PRELOADED_DATA__');
            if (el && el.textContent) {
                const text = el.textContent.trim();
                if (text.length > 5) return JSON.parse(text);
            }
        } catch (_) {}
        return null;
    }

    function prefetchAdjacentCreators() {
        if (!state.creators || state.creators.length <= 1) return;
        const curIdx = state.creators.findIndex(c => (c.slug || c.name) === state.selectedCreator);
        const nextCreators = [];
        for (let i = 1; i <= 5; i++) {
            const nextC = state.creators[(curIdx + i) % state.creators.length];
            if (nextC) nextCreators.push(nextC);
        }

        const runPrefetch = () => {
            nextCreators.forEach((c, idx) => {
                setTimeout(() => {
                    const slug = c.slug || c.name;
                    if (!state.creatorCache[slug]) {
                        fetch(`/api/drive/creator/${encodeURIComponent(slug)}`)
                            .then(r => r.json())
                            .then(data => {
                                if (data.success && data.data) {
                                    state.creatorCache[slug] = {
                                        photos: data.data.photos || [],
                                        videos: data.data.videos || []
                                    };
                                    try {
                                        sessionStorage.setItem('18tube_cmedia_' + slug, JSON.stringify(state.creatorCache[slug]));
                                    } catch (_) {}
                                }
                            }).catch(() => {});
                    }
                }, (idx + 1) * 700);
            });
        };

        if ('requestIdleCallback' in window) {
            requestIdleCallback(runPrefetch, { timeout: 3000 });
        } else {
            setTimeout(runPrefetch, 1200);
        }
    }

    // ==========================================
    // TIKTOK-STYLE CREATOR PROFILE SYSTEM
    // ==========================================
    const FOLLOWED_CREATORS_STORAGE_KEY = '18tube_followed_creators';
    let followedCreators = {};
    try {
        const saved = localStorage.getItem(FOLLOWED_CREATORS_STORAGE_KEY);
        if (saved) followedCreators = JSON.parse(saved);
    } catch (_) {}

    function isCreatorFollowed(slug) {
        return !!(slug && followedCreators[slug]);
    }

    function toggleCreatorFollow(slug) {
        if (!slug) return false;
        if (followedCreators[slug]) {
            delete followedCreators[slug];
        } else {
            followedCreators[slug] = true;
        }
        try {
            localStorage.setItem(FOLLOWED_CREATORS_STORAGE_KEY, JSON.stringify(followedCreators));
        } catch (_) {}
        updateCreatorChipsFollowed();
        return isCreatorFollowed(slug);
    }

    function updateCreatorChipsFollowed() {
        if (!elements.creatorRibbon) return;
        elements.creatorRibbon.querySelectorAll('.creator-chip').forEach(chip => {
            const slug = chip.getAttribute('data-name');
            const isF = isCreatorFollowed(slug);
            chip.classList.toggle('is-followed', isF);
            let heart = chip.querySelector('.creator-follow-icon');
            if (isF && !heart) {
                heart = document.createElement('span');
                heart.className = 'creator-follow-icon';
                heart.textContent = '❤️ ';
                chip.prepend(heart);
            } else if (!isF && heart) {
                heart.remove();
            }
        });
    }

    function renderCreatorProfile() {
        if (!elements.creatorProfileCard) return;

        const curSlug = state.selectedCreator;
        if (!curSlug || curSlug === '__all__') {
            elements.creatorProfileCard.style.display = 'none';
            return;
        }

        const creator = state.creators.find(c => (c.slug || c.name) === curSlug) || {
            name: curSlug.split('/').pop(),
            slug: curSlug,
            country: 'Việt Nam'
        };

        const cName = creator.name || curSlug.split('/').pop();
        const cHandle = '@' + cName.toLowerCase().replace(/[^a-z0-9_]/g, '');
        const cCountry = creator.country || 'Việt Nam';
        const cCountryInfo = getCountryInfo(cCountry);
        const cFlag = cCountryInfo.flag || '🇻🇳';

        const vidsCount = state.videoList ? state.videoList.length : (creator.videos_count || 0);
        const photosCount = state.photoList ? state.photoList.length : (creator.photos_count || 0);
        const totalCount = vidsCount + photosCount || creator.total_files || 0;

        let totalBytes = 0;
        if (state.mediaItems && state.mediaItems.length > 0) {
            state.mediaItems.forEach(it => {
                totalBytes += parseBytesFromStr(it.size_str) || 0;
            });
        }
        const sizeStr = totalBytes > 0 ? formatBytes(totalBytes) : (creator.total_size_str || 'Đang cập nhật');

        // Tìm ảnh đại diện từ media đầu tiên của creator
        let avatarUrl = '';
        if (state.photoList && state.photoList.length > 0) {
            avatarUrl = state.photoList[0].thumbnail_url || (state.photoList[0].file_id ? `https://lh3.googleusercontent.com/d/${state.photoList[0].file_id}=w400` : '');
        } else if (state.videoList && state.videoList.length > 0) {
            avatarUrl = state.videoList[0].thumbnail_url || (state.videoList[0].file_id ? `https://lh3.googleusercontent.com/d/${state.videoList[0].file_id}=w400` : '');
        }

        const isFollowing = isCreatorFollowed(curSlug);
        const driveFolderUrl = `https://drive.google.com/drive/search?q=${encodeURIComponent(cName)}`;

        elements.creatorProfileCard.style.display = 'block';
        elements.creatorProfileCard.innerHTML = `
            <div class="profile-card-inner">
                <!-- BLURRED BACKGROUND BANNER -->
                <div class="profile-banner-bg" style="${avatarUrl ? `background-image: url('${avatarUrl}');` : ''}"></div>
                <div class="profile-banner-overlay"></div>

                <div class="profile-header-content">
                    <!-- AVATAR TIKTOK STORY RING -->
                    <div class="profile-avatar-wrap">
                        <div class="tiktok-story-ring">
                            ${avatarUrl ? `
                                <img src="${avatarUrl}" alt="${cName}" class="profile-avatar-img" onerror="this.onerror=null;this.src='/static/placeholder.svg';">
                            ` : `
                                <div class="profile-avatar-initials">${cName.slice(0, 2).toUpperCase()}</div>
                            `}
                        </div>
                        <span class="profile-country-badge" title="${cCountryInfo.name}">${cFlag}</span>
                    </div>

                    <!-- INFO & IDENTITY -->
                    <div class="profile-meta-wrap">
                        <div class="profile-name-row">
                            <h2 class="profile-display-name">${cName}</h2>
                            <span class="tiktok-verified-badge" title="Tài khoản Creator đã xác thực">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                </svg>
                            </span>
                            <span class="profile-country-pill">${cFlag} ${cCountryInfo.name}</span>
                        </div>

                        <div class="profile-handle-row">
                            <span class="profile-username">${cHandle}</span>
                            <span class="profile-dot-separator">•</span>
                            <span class="profile-badge-drive">☁️ Google Drive Source</span>
                        </div>

                        <!-- TIKTOK STATS ROW -->
                        <div class="profile-stats-grid">
                            <div class="p-stat-box" id="p-box-vids" title="Bấm để lọc Video">
                                <span class="p-stat-value">${vidsCount.toLocaleString('vi-VN')}</span>
                                <span class="p-stat-label">🎬 Video</span>
                            </div>
                            <div class="p-stat-box" id="p-box-photos" title="Bấm để lọc Ảnh">
                                <span class="p-stat-value">${photosCount.toLocaleString('vi-VN')}</span>
                                <span class="p-stat-label">📸 Ảnh</span>
                            </div>
                            <div class="p-stat-box" id="p-box-all" title="Bấm để xem Tất cả">
                                <span class="p-stat-value">${totalCount.toLocaleString('vi-VN')}</span>
                                <span class="p-stat-label">📦 Tổng tệp</span>
                            </div>
                            <div class="p-stat-box" title="Tổng dung lượng lưu trữ">
                                <span class="p-stat-value">${sizeStr}</span>
                                <span class="p-stat-label">💾 Dung lượng</span>
                            </div>
                        </div>

                        <div class="profile-bio-text">
                            <span>✨ Kho media chọn lọc của <strong>${cName}</strong> trên Cloud 18TUBE. Xem phim chuẩn rạp chiếu 4K và tải trực tiếp tốc độ cao.</span>
                        </div>

                        <!-- ACTION BUTTONS -->
                        <div class="profile-actions-row">
                            ${vidsCount > 0 ? `
                                <button class="btn-profile-tiktok btn-profile-playall" id="btn-profile-playall" title="Phát liên tục tất cả video của creator">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                                    <span>Phát tất cả Video</span>
                                </button>
                            ` : ''}

                            <button class="btn-profile-tiktok btn-profile-follow ${isFollowing ? 'is-following' : ''}" id="btn-profile-follow" title="${isFollowing ? 'Bỏ theo dõi creator này' : 'Theo dõi & lưu creator vào mục yêu thích'}">
                                <span>${isFollowing ? '❤️ Đang theo dõi' : '🤍 Theo dõi'}</span>
                            </button>

                            <button class="btn-profile-tiktok btn-profile-share" id="btn-profile-share" title="Sao chép đường link profile TikTok này">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
                                <span>Chia sẻ</span>
                            </button>

                            <a href="${driveFolderUrl}" target="_blank" rel="noopener noreferrer" class="btn-profile-tiktok btn-profile-drive" title="Mở thư mục trên Google Drive">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                <span>Mở Drive</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Gắn sự kiện cho các nút hành động trong profile
        const btnPlayAll = document.getElementById('btn-profile-playall');
        if (btnPlayAll) {
            btnPlayAll.addEventListener('click', () => {
                if (state.videoList && state.videoList.length > 0) {
                    state.autoNext = true;
                    if (elements.chkAutoNext) elements.chkAutoNext.checked = true;
                    playTheaterVideo(0);
                    showToast(`🎬 Đang phát danh sách ${state.videoList.length} video của ${cName}`, 'info');
                } else {
                    showToast('Creator này chưa có video', 'warning');
                }
            });
        }

        const btnFollow = document.getElementById('btn-profile-follow');
        if (btnFollow) {
            btnFollow.addEventListener('click', () => {
                const nowFollow = toggleCreatorFollow(curSlug);
                btnFollow.classList.toggle('is-following', nowFollow);
                btnFollow.querySelector('span').textContent = nowFollow ? '❤️ Đang theo dõi' : '🤍 Theo dõi';
                showToast(nowFollow ? `❤️ Đã theo dõi creator ${cName}` : `Đã bỏ theo dõi ${cName}`);
            });
        }

        const btnShare = document.getElementById('btn-profile-share');
        if (btnShare) {
            btnShare.addEventListener('click', () => {
                const shareUrl = `${window.location.origin}/gallery?creator=${encodeURIComponent(curSlug)}`;
                navigator.clipboard.writeText(shareUrl).then(() => {
                    showToast(`🔗 Đã sao chép link profile TikTok của @${cName}!`, 'info');
                }).catch(() => {
                    prompt('Link profile creator:', shareUrl);
                });
            });
        }

        // Bấm vào stat box chuyển tab tương ứng
        const statVids = document.getElementById('p-box-vids');
        if (statVids) statVids.addEventListener('click', () => {
            const tab = document.querySelector('.filter-tab[data-type="video"]');
            if (tab) tab.click();
        });

        const statPhotos = document.getElementById('p-box-photos');
        if (statPhotos) statPhotos.addEventListener('click', () => {
            const tab = document.querySelector('.filter-tab[data-type="photo"]');
            if (tab) tab.click();
        });

        const statAll = document.getElementById('p-box-all');
        if (statAll) statAll.addEventListener('click', () => {
            const tab = document.querySelector('.filter-tab[data-type="all"]');
            if (tab) tab.click();
        });
    }

    async function loadCreators() {
        elements.creatorSelect.innerHTML = '<option value="">Đang tải...</option>';

        // 1. SERVER-SIDE HYDRATION: Nạp trực tiếp từ dữ liệu nhúng sẵn trong HTML (0s, 0 network call)
        const preloaded = getPreloadedData();
        if (preloaded && preloaded.creators && preloaded.creators.length > 0) {
            state.creators = preloaded.creators;
            state.countries = preloaded.countries || [];
            if (preloaded.initial_media && preloaded.target_creator) {
                state.creatorCache[preloaded.target_creator] = {
                    photos: preloaded.initial_media.photos || [],
                    videos: preloaded.initial_media.videos || []
                };
            }
            renderCountriesList();
            renderCreatorsList();

            let targetCreator = preloaded.target_creator || state.creators[0].slug || state.creators[0].name;
            const urlParams = new URLSearchParams(window.location.search);
            const queryCreator = urlParams.get('creator');
            if (queryCreator) {
                const match = state.creators.find(c => c.slug === queryCreator || c.name === queryCreator || (c.slug && c.slug.endsWith('/' + queryCreator)));
                if (match) targetCreator = match.slug || match.name;
            }
            selectCreator(targetCreator);

            // Bắt đầu prefetch các creator lân cận trong thời gian CPU rảnh
            prefetchAdjacentCreators();
            return;
        }

        // 2. STALE-WHILE-REVALIDATE: Nạp ngay từ sessionStorage / localStorage trong 0ms nếu có
        if (state.source === 'drive') {
            try {
                const cachedRaw = sessionStorage.getItem('18tube_creators_v3') || localStorage.getItem('18tube_creators_v3');
                if (cachedRaw) {
                    const parsed = JSON.parse(cachedRaw);
                    if (parsed && parsed.creators && parsed.creators.length > 0) {
                        state.creators = parsed.creators || [];
                        state.countries = parsed.countries || [];
                        renderCountriesList();
                        renderCreatorsList();

                        let targetCreator = state.creators[0].slug || state.creators[0].name;
                        const urlParams = new URLSearchParams(window.location.search);
                        const queryCreator = urlParams.get('creator');
                        if (queryCreator) {
                            const match = state.creators.find(c => c.slug === queryCreator || c.name === queryCreator || (c.slug && c.slug.endsWith('/' + queryCreator)));
                            if (match) targetCreator = match.slug || match.name;
                        }
                        if (targetCreator) selectCreator(targetCreator);
                    }
                }
            } catch (_) {}
        }

        try {
            if (state.source === 'local') {
                const res = await fetch('/api/local/creators');
                const data = await res.json();
                if (data.success) {
                    state.creators = data.creators || [];
                    state.countries = [{ name: 'Mặc định', count: state.creators.length }];
                }
            } else {
                // Tải nhanh danh sách creator và quốc gia từ backend (đã được nén gzip và cache)
                const res = await fetch('/api/drive/creators');
                const data = await res.json();
                if (data.success) {
                    state.creators = data.creators || [];
                    state.countries = data.countries || [];
                    try {
                        sessionStorage.setItem('18tube_creators_v3', JSON.stringify(data));
                        localStorage.setItem('18tube_creators_v3', JSON.stringify(data));
                    } catch (_) {}
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
                let targetCreator = state.selectedCreator || state.creators[0].slug || state.creators[0].name;
                const urlParams = new URLSearchParams(window.location.search);
                const queryCreator = urlParams.get('creator');
                if (queryCreator) {
                    const match = state.creators.find(c => c.slug === queryCreator || c.name === queryCreator || (c.slug && c.slug.endsWith('/' + queryCreator)));
                    if (match) {
                        targetCreator = match.slug || match.name;
                        if (match.country && match.country !== 'Việt Nam') {
                            state.selectedCountry = match.country;
                            renderCountriesList();
                            renderCreatorsList();
                        }
                    }
                }
                if (!state.selectedCreator || state.selectedCreator !== targetCreator) {
                    selectCreator(targetCreator);
                }
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
            const flagBadge = info.iso ? `${info.flag} [${info.iso.toUpperCase()}]` : (info.flag || '🌐');
            selectHtml += `<option value="${c.name}">${flagBadge} ${c.name} (${c.count})</option>`;
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
        const targetCountryName = getCountryInfo(state.selectedCountry).name;
        const visibleCreators = (state.selectedCountry === 'all') 
            ? state.creators 
            : state.creators.filter(c => getCountryInfo(c.country).name === targetCountryName);

        if (visibleCreators.length > 0) {
            const isCurrentVisible = visibleCreators.some(c => (c.slug || c.name) === state.selectedCreator);
            if (!isCurrentVisible && state.selectedCreator !== '__all__') {
                const first = visibleCreators[0].slug || visibleCreators[0].name;
                selectCreator(first);
            }
        }
    }

    function renderCreatorsList() {
        const targetCountryName = getCountryInfo(state.selectedCountry).name;
        const visibleCreators = (state.selectedCountry === 'all')
            ? state.creators
            : state.creators.filter(c => getCountryInfo(c.country).name === targetCountryName);

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
                const cntryNormalized = getCountryInfo(cntry.name).name;
                const cCreators = state.creators.filter(c => getCountryInfo(c.country).name === cntryNormalized);
                if (cCreators.length > 0) {
                    const info = getCountryInfo(cntry.name);
                    const flagBadge = info.iso ? `${info.flag} [${info.iso.toUpperCase()}]` : (info.flag || '🌐');
                    groupsHtml += `<optgroup label="${flagBadge} ${cntry.name} (${cCreators.length})">`;
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
            const isF = isCreatorFollowed(slug);
            const cFlagHtml = getCountryFlagHtml(c.country || 'Việt Nam');
            const followIcon = isF ? '<span class="creator-follow-icon">❤️ </span>' : '';
            return `
                <span class="creator-chip ${isActive} ${isF ? 'is-followed' : ''}" data-name="${slug}">
                    ${followIcon}${cFlagHtml}
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

        // Cập nhật ngay Profile Creator kiểu TikTok
        renderCreatorProfile();

        // 1. KIỂM TRA BỘ ĐỆM RAM & SESSION STORAGE: MỞ TỨC THÌ 0 GIÂY KHÔNG CẦN CHỜ MẠNG!
        if (state.creatorCache[name] && (state.creatorCache[name].photos.length + state.creatorCache[name].videos.length > 0)) {
            const cached = state.creatorCache[name];
            processMediaItems(cached.photos, cached.videos);
            return;
        }

        try {
            const sessItem = sessionStorage.getItem('18tube_cmedia_' + name);
            if (sessItem) {
                const parsed = JSON.parse(sessItem);
                if (parsed && ((parsed.photos && parsed.photos.length > 0) || (parsed.videos && parsed.videos.length > 0))) {
                    state.creatorCache[name] = parsed;
                    processMediaItems(parsed.photos, parsed.videos);
                    return;
                }
            }
        } catch (_) {}

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
                // Lưu vào RAM và sessionStorage để mở lại tức thì 0s
                if ((resData.photos && resData.photos.length > 0) || (resData.videos && resData.videos.length > 0)) {
                    state.creatorCache[name] = {
                        photos: resData.photos || [],
                        videos: resData.videos || []
                    };
                    try {
                        sessionStorage.setItem('18tube_cmedia_' + name, JSON.stringify(state.creatorCache[name]));
                    } catch (_) {}
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
            const thumbUrl = p.thumbnail_url || (fId ? `https://lh3.googleusercontent.com/d/${fId}=w400` : (p.stream_url || ''));
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
            const thumbUrl = v.thumbnail_url || (fId ? `https://lh3.googleusercontent.com/d/${fId}=w400` : (v.full_path ? `/api/media/thumbnail?file=${encodeURIComponent(v.full_path)}` : ''));
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
        updateFavoritesBadge();
        renderCreatorProfile();

        filterAndRenderGrid();
    }

    // ==========================================
    // GRID RENDERING
    // ==========================================

    function renderCardHtml(it) {
        const isVid = it.type === 'video';
        const badgeClass = isVid ? 'badge-video' : 'badge-photo';
        const badgeText = isVid ? '🎬 VIDEO' : '📸 ẢNH';
        const thumbSrc = it.thumbnail_url || (it.file_id ? `https://lh3.googleusercontent.com/d/${it.file_id}=w400` : it.stream_url);
        const fallbackSrc = it.file_id ? `/api/media/thumbnail?id=${it.file_id}&proxy=1` : '/static/placeholder.svg';

        const isFav = isItemFavorite(it);
        const savedProg = isVid ? getSavedProgress(it) : null;

        // Tối ưu tên file: Ẩn tag creator nếu đang chọn 1 creator cụ thể để tránh lặp lại thô kệch
        const isSpecificCreator = state.selectedCreator && state.selectedCreator !== '__all__';
        let creatorPrefix = '';
        if (!isSpecificCreator && it.creator) {
            const cInfo = getCountryInfo(it.country);
            const cFlagHtml = (cInfo.iso && cInfo.iso !== 'vn') ? `${cInfo.flag} ` : '';
            creatorPrefix = `<span class="creator-tag-pill">[${cFlagHtml}${it.creator}]</span>`;
        }

        // Format ngày tháng thân thiện cho người dùng
        const formattedDate = formatDate(it.date);

        return `
            <div class="media-card" data-id="${it.id}" data-type="${it.type}">
                <div class="media-poster-box">
                    <span class="media-type-badge ${badgeClass}">${badgeText}</span>
                    <span class="media-size-badge">${it.size_str || ''}</span>

                    <!-- HEART FAVORITE BUTTON -->
                    <button class="media-card-fav-btn ${isFav ? 'is-fav' : ''}" data-fav-id="${it.id}" title="${isFav ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}" aria-label="Yêu thích">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                    </button>

                    <img src="${thumbSrc}" 
                         alt="${it.name}" 
                         loading="lazy" 
                         onerror="if(this.getAttribute('data-err')!=='1'){this.setAttribute('data-err','1');this.src='${fallbackSrc}';}else{this.src='/static/placeholder.svg';}">

                    ${isVid ? `
                        <div class="media-play-glow" title="Nhấn để phát video chuẩn Rạp Chiếu">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                        </div>
                        ${(savedProg && savedProg.pct > 2 && savedProg.pct < 95) ? `
                            <div class="media-progress-bar-wrap" title="Đã xem: ${savedProg.pct}% (${formatDuration(savedProg.time)})">
                                <div class="media-progress-bar-fill" style="width: ${savedProg.pct}%"></div>
                            </div>
                        ` : ''}
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
            const isFavTab = state.mediaTypeFilter === 'favorite';
            const emptyMsg = isFavTab 
                ? 'Bạn chưa có ảnh hoặc video yêu thích nào. Hãy nhấn biểu tượng ❤️ trên các thẻ để lưu vào danh sách yêu thích!' 
                : 'Không tìm thấy ảnh hoặc video nào phù hợp';
            const emptyIcon = isFavTab 
                ? '<div style="font-size: 3rem; margin-bottom: 0.5rem;">❤️</div>' 
                : '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>';
            elements.cinemaGrid.innerHTML = `
                <div class="cinema-empty">
                    ${emptyIcon}
                    <span>${emptyMsg}</span>
                </div>
            `;
            elements.mediaStatusText.textContent = '0 tệp tin';
            if (elements.galleryPagination) elements.galleryPagination.style.display = 'none';
            if (elements.galleryTopPagination) elements.galleryTopPagination.style.display = 'none';
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
            const id = card.getAttribute('data-id');
            const type = card.getAttribute('data-type');
            const itObj = pageItems.find(it => it.id === id);

            // Gắn sự kiện Thả tim trên thẻ
            const favBtn = card.querySelector('.media-card-fav-btn');
            if (favBtn && itObj) {
                favBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const nowFav = toggleItemFavorite(itObj);
                    favBtn.classList.toggle('is-fav', nowFav);
                    favBtn.title = nowFav ? 'Bỏ yêu thích' : 'Thêm vào yêu thích';
                    if (state.mediaTypeFilter === 'favorite') {
                        filterAndRenderGrid();
                    }
                });
            }

            // Gắn sự kiện Hover Preview xem trước video
            if (type === 'video' && itObj) {
                card.addEventListener('mouseenter', () => {
                    startHoverPreview(card, itObj);
                });
                card.addEventListener('mouseleave', () => {
                    stopHoverPreview();
                });
            }

            // Bấm vào tag creator để chuyển ngay đến Profile TikTok của creator đó
            const tagPill = card.querySelector('.creator-tag-pill');
            if (tagPill && itObj && itObj.creator) {
                tagPill.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectCreator(itObj.creator);
                });
            }

            card.addEventListener('click', () => {
                stopHoverPreview();
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
        // 1. THANH PHÂN TRANG NHANH Ở TRÊN ĐẦU (TOP PAGINATION)
        if (elements.galleryTopPagination) {
            if (totalPages <= 1) {
                elements.galleryTopPagination.style.display = 'none';
            } else {
                elements.galleryTopPagination.style.display = 'inline-flex';
                elements.galleryTopPagination.innerHTML = `
                    <button class="top-page-btn" data-top-page="${state.currentPage - 1}" ${state.currentPage === 1 ? 'disabled' : ''} title="Trang trước">◀ Trước</button>
                    <span class="top-page-badge">Trang <strong>${state.currentPage}</strong> / ${totalPages}</span>
                    <button class="top-page-btn" data-top-page="${state.currentPage + 1}" ${state.currentPage === totalPages ? 'disabled' : ''} title="Trang kế tiếp">Sau ▶</button>
                `;
                elements.galleryTopPagination.querySelectorAll('.top-page-btn[data-top-page]').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const p = parseInt(btn.getAttribute('data-top-page'), 10);
                        if (!isNaN(p)) goToPage(p);
                    });
                });
            }
        }

        // 2. THANH PHÂN TRANG ĐẦY ĐỦ Ở CUỐI TRANG (BOTTOM PAGINATION)
        if (!elements.galleryPagination) return;
        if (totalPages <= 1) {
            elements.galleryPagination.style.display = 'none';
            return;
        }

        elements.galleryPagination.style.display = 'flex';
        const cur = state.currentPage;

        let html = '';

        // Nút Trang Đầu & Nút Trước
        html += `<button class="page-btn page-btn-nav page-btn-first" data-page="1" ${cur === 1 ? 'disabled' : ''} title="Trang đầu"><span class="nav-icon">⏮</span><span class="nav-text"> Đầu</span></button>`;
        html += `<button class="page-btn page-btn-nav page-btn-prev" data-page="${cur - 1}" ${cur === 1 ? 'disabled' : ''} title="Trang trước"><span class="nav-icon">◀</span><span class="nav-text"> Trước</span></button>`;

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
        html += `<button class="page-btn page-btn-nav page-btn-next" data-page="${cur + 1}" ${cur === totalPages ? 'disabled' : ''} title="Trang kế tiếp"><span class="nav-text">Sau </span><span class="nav-icon">▶</span></button>`;
        html += `<button class="page-btn page-btn-nav page-btn-last" data-page="${totalPages}" ${cur === totalPages ? 'disabled' : ''} title="Trang cuối"><span class="nav-text">Cuối </span><span class="nav-icon">⏭</span></button>`;

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

        // 1. Lọc theo Loại media (All, Video, Photo, Favorite)
        if (state.mediaTypeFilter === 'favorite') {
            items = items.filter(it => isItemFavorite(it));
        } else if (state.mediaTypeFilter === 'video') {
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
                    preload: 'metadata',
                    fluid: false,
                    fill: true,
                    playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
                    controlBar: {
                        pictureInPictureToggle: true,
                        volumePanel: { inline: false }
                    }
                });

                // Lưu tiến độ xem dở tự động (lưu mỗi ~2.5s)
                let lastSaveTime = 0;
                vjsPlayer.on('timeupdate', () => {
                    const now = Date.now();
                    if (now - lastSaveTime < 2500) return;
                    lastSaveTime = now;
                    const curVid = state.videoList[state.currentVideoIndex];
                    if (curVid && vjsPlayer.duration()) {
                        saveProgress(curVid, vjsPlayer.currentTime(), vjsPlayer.duration());
                    }
                });

                vjsPlayer.on('ended', () => {
                    const curVid = state.videoList[state.currentVideoIndex];
                    if (curVid) {
                        clearProgress(curVid);
                    }
                    if (elements.chkAutoNext && elements.chkAutoNext.checked) {
                        playNextVideo();
                    }
                });

                vjsPlayer.on('error', () => {
                    showToast('Không thể phát video này hoặc lỗi kết nối!', 'warning');
                });
            } catch (err) {
                console.warn('Video.js init fallback:', err);
            }
        }
        return vjsPlayer;
    }

    function openTheaterVideoById(id) {
        stopHoverPreview();
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

        // Đồng bộ trạng thái Yêu thích trên thanh công cụ Theater
        syncTheaterFavButton(vid);

        // Kiểm tra tiến độ đã xem dở trước đó
        const savedProg = getSavedProgress(vid);
        let resumeApplied = false;
        const applyResume = () => {
            if (resumeApplied || !savedProg || savedProg.time <= 5) return;
            resumeApplied = true;
            try {
                if (vjsPlayer) {
                    vjsPlayer.currentTime(savedProg.time);
                } else if (elements.theaterVideo) {
                    elements.theaterVideo.currentTime = savedProg.time;
                }
                showToast(`🕒 Tiếp tục phát từ ${formatDuration(savedProg.time)} (${savedProg.pct}%)`, 'info');
            } catch (_) {}
        };

        // External Drive link button
        if (vid.drive_url) {
            elements.theaterExternalBtn.href = vid.drive_url;
            elements.theaterExternalBtn.style.display = 'inline-flex';
        } else {
            elements.theaterExternalBtn.style.display = 'none';
        }

        const player = getOrCreatePlayer();

        // Phát qua Video.js Player
        if (player) {
            const vjsEl = player.el();
            if (vjsEl) vjsEl.style.display = 'block';
            player.src({ src: vid.stream_url, type: 'video/mp4' });
            player.ready(() => {
                player.play().catch(() => {
                    player.muted(true);
                    player.play().catch(() => { });
                });
                if (savedProg && savedProg.time > 5) {
                    player.one('loadedmetadata', applyResume);
                }
            });
            player.loop(state.isLooping);
        } else {
            elements.theaterVideo.style.display = 'block';
            elements.theaterVideo.src = vid.stream_url;
            elements.theaterVideo.load();
            if (savedProg && savedProg.time > 5) {
                const onLoaded = () => {
                    applyResume();
                    elements.theaterVideo.removeEventListener('loadedmetadata', onLoaded);
                };
                elements.theaterVideo.addEventListener('loadedmetadata', onLoaded);
            }
            elements.theaterVideo.play().catch(() => {
                elements.theaterVideo.muted = true;
                elements.theaterVideo.play().catch(() => { });
            });
        }

        if (elements.theaterEngineBadge) {
            elements.theaterEngineBadge.textContent = '🎬 VIDEO.JS';
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
        stopHoverPreview();
        elements.theaterModal.classList.remove('active');
        if (vjsPlayer) {
            vjsPlayer.pause();
        } else if (elements.theaterVideo) {
            elements.theaterVideo.pause();
            elements.theaterVideo.src = '';
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

        // Đồng bộ trạng thái Yêu thích trong Lightbox
        syncLightboxFavButton(photo);

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
        stopHoverPreview();
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

        // Theater & Lightbox Favorite Buttons
        if (elements.btnTheaterFav) {
            elements.btnTheaterFav.addEventListener('click', () => {
                const curVid = state.videoList[state.currentVideoIndex];
                if (curVid) {
                    toggleItemFavorite(curVid);
                    if (state.mediaTypeFilter === 'favorite') {
                        filterAndRenderGrid();
                    }
                }
            });
        }

        if (elements.lbBtnFav) {
            elements.lbBtnFav.addEventListener('click', () => {
                const curPhoto = state.photoList[state.currentPhotoIndex];
                if (curPhoto) {
                    toggleItemFavorite(curPhoto);
                    if (state.mediaTypeFilter === 'favorite') {
                        filterAndRenderGrid();
                    }
                }
            });
        }

        // Random Video button
        if (elements.btnRandomVideo) {
            elements.btnRandomVideo.addEventListener('click', (e) => {
                e.preventDefault();
                playRandomVideo();
            });
        }

        // Boss Mode buttons
        if (elements.btnBossMode) {
            elements.btnBossMode.addEventListener('click', (e) => {
                e.preventDefault();
                toggleBossMode();
            });
        }
        if (elements.btnExitBossMode) {
            elements.btnExitBossMode.addEventListener('click', (e) => {
                e.preventDefault();
                toggleBossMode(false);
            });
        }

        // Hover Preview Toggle Button
        if (elements.btnToggleHoverPreview) {
            elements.btnToggleHoverPreview.addEventListener('click', () => {
                hoverPreviewEnabled = !hoverPreviewEnabled;
                elements.btnToggleHoverPreview.classList.toggle('active', hoverPreviewEnabled);
                elements.btnToggleHoverPreview.innerHTML = hoverPreviewEnabled ? '<span>👁️ Preview: Bật</span>' : '<span>👁️ Preview: Tắt</span>';
                if (!hoverPreviewEnabled) stopHoverPreview();
                showToast(hoverPreviewEnabled ? 'Đã bật xem trước video khi rê chuột' : 'Đã tắt xem trước video');
            });
        }

        // Aspect Ratio Toggle Button (3:4 Portrait / 16:9 Cinema)
        if (elements.btnToggleAspect) {
            const savedAspect = localStorage.getItem('18tube_aspect_ratio') || '3-4';
            if (savedAspect === '16-9') {
                elements.cinemaGrid.classList.add('aspect-16-9');
                elements.btnToggleAspect.innerHTML = '<span>📐 16:9 Ngang</span>';
            } else {
                elements.cinemaGrid.classList.remove('aspect-16-9');
                elements.btnToggleAspect.innerHTML = '<span>📐 3:4 Dọc</span>';
            }

            elements.btnToggleAspect.addEventListener('click', () => {
                const is169 = elements.cinemaGrid.classList.toggle('aspect-16-9');
                localStorage.setItem('18tube_aspect_ratio', is169 ? '16-9' : '3-4');
                elements.btnToggleAspect.innerHTML = is169 ? '<span>📐 16:9 Ngang</span>' : '<span>📐 3:4 Dọc</span>';
                showToast(is169 ? '📐 Đã chuyển sang tỉ lệ 16:9 (Rạp chiếu ngang)' : '📐 Đã chuyển sang tỉ lệ 3:4 (Chân dung dọc xem rõ mặt)', 'info');
            });
        }

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
            // Boss Mode Active: Thoát ngay khi nhấn B hoặc ESC
            if (isBossModeActive) {
                if (e.key.toLowerCase() === 'b' || e.key === 'Escape') {
                    e.preventDefault();
                    toggleBossMode(false);
                }
                return;
            }

            // Boss Mode shortcut: Nhấn 'b' / 'B' để bật ngụy trang khẩn cấp
            if (e.key.toLowerCase() === 'b' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                toggleBossMode(true);
                return;
            }

            // Random video shortcut: Nhấn 'r' / 'R' để phát ngẫu nhiên
            if (e.key.toLowerCase() === 'r' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                playRandomVideo();
                return;
            }

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

            // Quick scroll to top with Home key
            if (e.key === 'Home' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                if (!elements.theaterModal.classList.contains('active') && !elements.photoLightbox.classList.contains('active')) {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    return;
                }
            }

            // If in Photo Lightbox
            if (elements.photoLightbox.classList.contains('active')) {
                if (e.key === 'Escape') closeLightbox();
                if (e.key === 'ArrowRight') nextPhoto();
                if (e.key === 'ArrowLeft') prevPhoto();
            }
        });

        // Floating Back to Top button
        const btnBackToTop = document.getElementById('btn-back-to-top');
        if (btnBackToTop) {
            let scrollTicking = false;
            window.addEventListener('scroll', () => {
                stopHoverPreview();
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
    }

    // Init App
    document.addEventListener('DOMContentLoaded', () => {
        loadFavorites();
        loadProgress();
        initEvents();
        loadCreators();
    });
})();
