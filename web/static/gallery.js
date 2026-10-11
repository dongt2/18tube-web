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
        selectedCreator: '',
        mediaItems: [],
        filteredItems: [],
        mediaTypeFilter: 'all', // 'all', 'video', 'photo'
        searchQuery: '',
        density: 'compact',

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
        btnSrcLocal: document.getElementById('btn-src-local'),
        btnSrcDrive: document.getElementById('btn-src-drive'),
        creatorSelect: document.getElementById('creator-select'),
        creatorRibbon: document.getElementById('creator-ribbon'),
        gallerySearch: document.getElementById('gallery-search'),
        mediaFilters: document.querySelectorAll('.filter-tab'),
        badgeCntAll: document.getElementById('badge-cnt-all'),
        badgeCntVideo: document.getElementById('badge-cnt-video'),
        badgeCntPhoto: document.getElementById('badge-cnt-photo'),
        mediaStatusText: document.getElementById('media-status-text'),
        densityBtns: document.querySelectorAll('.density-btn'),
        cinemaGrid: document.getElementById('cinema-grid'),

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
    };

    // ==========================================
    // UTILITIES
    // ==========================================

    function showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.style.cssText = `
            background: #111726;
            border: 1px solid rgba(0, 242, 254, 0.4);
            color: #f8fafc;
            padding: 0.75rem 1.25rem;
            border-radius: 8px;
            font-size: 0.82rem;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
            transition: all 0.3s ease;
        `;
        toast.textContent = msg;
        elements.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ==========================================
    // DATA FETCHING
    // ==========================================

    async function loadCreators() {
        elements.creatorSelect.innerHTML = '<option value="">Đang tải...</option>';
        try {
            if (state.source === 'local') {
                const res = await fetch('/api/local/creators');
                const data = await res.json();
                if (data.success) {
                    state.creators = data.creators || [];
                }
            } else {
                const res = await fetch('/api/drive/summary_all');
                const data = await res.json();
                if (data.success && data.data) {
                    state.creators = data.data.creators || [];
                }
            }

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

    function renderCreatorsList() {
        // Dropdown
        elements.creatorSelect.innerHTML = state.creators.map(c => {
            const name = c.slug || c.name;
            const total = c.total_files || (c.photos_count + c.videos_count) || 0;
            return `<option value="${name}">${name} (${total})</option>`;
        }).join('');

        // Ribbon
        elements.creatorRibbon.innerHTML = state.creators.map(c => {
            const name = c.slug || c.name;
            const isActive = state.selectedCreator === name ? 'active' : '';
            return `<span class="creator-chip ${isActive}" data-name="${name}">👤 ${name}</span>`;
        }).join('');

        elements.creatorRibbon.querySelectorAll('.creator-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const name = chip.getAttribute('data-name');
                selectCreator(name);
            });
        });
    }

    async function selectCreator(name) {
        if (!name) return;
        state.selectedCreator = name;
        elements.creatorSelect.value = name;

        // Update active chip
        elements.creatorRibbon.querySelectorAll('.creator-chip').forEach(chip => {
            if (chip.getAttribute('data-name') === name) chip.classList.add('active');
            else chip.classList.remove('active');
        });

        elements.cinemaGrid.innerHTML = `
            <div class="cinema-loading">
                <div class="cinema-spinner"></div>
                <span>Đang tải kho ảnh & video của ${name}...</span>
            </div>
        `;

        try {
            if (state.source === 'local') {
                const creatorObj = state.creators.find(c => (c.slug || c.name) === name);
                const path = creatorObj ? creatorObj.path : '';
                const res = await fetch(`/api/local/creator?path=${encodeURIComponent(path)}`);
                const data = await res.json();
                if (data.success && data.data) {
                    processMediaItems(data.data.photos, data.data.videos);
                }
            } else {
                const res = await fetch(`/api/drive/creator/${name}`);
                const data = await res.json();
                if (data.success && data.data) {
                    processMediaItems(data.data.photos, data.data.videos);
                }
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

    function filterAndRenderGrid() {
        let items = [...state.mediaItems];

        // Type filter
        if (state.mediaTypeFilter === 'video') {
            items = items.filter(it => it.type === 'video');
        } else if (state.mediaTypeFilter === 'photo') {
            items = items.filter(it => it.type === 'photo');
        }

        // Search
        const q = state.searchQuery.trim().toLowerCase();
        if (q) {
            items = items.filter(it => it.name.toLowerCase().includes(q));
        }

        state.filteredItems = items;
        elements.mediaStatusText.textContent = `${items.length} tệp tin hiển thị`;

        if (items.length === 0) {
            elements.cinemaGrid.innerHTML = `
                <div class="cinema-empty">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    <span>Không tìm thấy ảnh hoặc video nào phù hợp</span>
                </div>
            `;
            return;
        }

        elements.cinemaGrid.innerHTML = items.map(it => {
            const isVid = it.type === 'video';
            const badgeClass = isVid ? 'badge-video' : 'badge-photo';
            const badgeText = isVid ? '🎬 VIDEO' : '📸 ẢNH';
            const thumbSrc = it.thumbnail_url || (it.file_id ? `https://lh3.googleusercontent.com/d/${it.file_id}=w500` : it.stream_url);
            const fallbackSrc = it.file_id ? `/api/media/thumbnail?id=${it.file_id}&proxy=1` : '/static/placeholder.svg';

            return `
                <div class="media-card" data-id="${it.id}" data-type="${it.type}">
                    <div class="media-poster-box">
                        <span class="media-type-badge ${badgeClass}">${badgeText}</span>
                        <span class="media-size-badge">${it.size_str}</span>

                        <img src="${thumbSrc}" 
                             alt="${it.name}" 
                             loading="lazy" 
                             onerror="if(this.getAttribute('data-err')!=='1'){this.setAttribute('data-err','1');this.src='${fallbackSrc}';}else{this.src='/static/placeholder.svg';}">

                        ${isVid ? `
                            <div class="media-play-glow">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                            </div>
                        ` : ''}
                    </div>
                    <div class="media-meta-box">
                        <span class="media-title" title="${it.name}">${it.name}</span>
                        <div class="media-sub-meta">
                            <span>${it.size_str}</span>
                            <span>${it.date || ''}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Attach click listeners
        elements.cinemaGrid.querySelectorAll('.media-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.getAttribute('data-id');
                const type = card.getAttribute('data-type');
                if (type === 'video') {
                    openTheaterVideoById(id);
                } else {
                    openPhotoLightboxById(id);
                }
            });
        });
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
        // Source switch (nếu có nút bấm)
        if (elements.btnSrcLocal) {
            elements.btnSrcLocal.addEventListener('click', () => {
                if (state.source === 'local') return;
                state.source = 'local';
                elements.btnSrcLocal.classList.add('active');
                if (elements.btnSrcDrive) elements.btnSrcDrive.classList.remove('active');
                loadCreators();
            });
        }

        if (elements.btnSrcDrive) {
            elements.btnSrcDrive.addEventListener('click', () => {
                if (state.source === 'drive') return;
                state.source = 'drive';
                elements.btnSrcDrive.classList.add('active');
                if (elements.btnSrcLocal) elements.btnSrcLocal.classList.remove('active');
                loadCreators();
            });
        }

        // Creator select dropdown
        elements.creatorSelect.addEventListener('change', (e) => {
            selectCreator(e.target.value);
        });

        // Filter tabs (All, Video, Photo)
        elements.mediaFilters.forEach(tab => {
            tab.addEventListener('click', () => {
                elements.mediaFilters.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                state.mediaTypeFilter = tab.getAttribute('data-type');
                filterAndRenderGrid();
            });
        });

        // Search input
        elements.gallerySearch.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            filterAndRenderGrid();
        });

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
