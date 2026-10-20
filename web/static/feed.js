/**
 * 18TUBE TIKTOK SHORTS - FULLSCREEN VERTICAL VIDEO FEED
 * High-performance, distraction-free video scrolling logic
 */

(function () {
    'use strict';

    // -------------------------------------------------------------
    // STATE MANAGEMENT
    // -------------------------------------------------------------
    const state = {
        videos: [],
        currentIndex: 0,
        isMuted: true, // Trình duyệt chặn unmuted autoplay ban đầu
        autoNext: true,
        activeTab: 'fyp', // 'fyp' | 'following'
        targetCreator: '',
        page: 1,
        isLoadingMore: false,
        hasMore: true,
        seenIds: new Set(),
        likedIds: new Set(),
        favoritedIds: new Set(),
        followedCreators: new Set(),
        lastTapTime: 0,
        lastTapX: 0,
        lastTapY: 0
    };

    // Load LocalStorage states
    try {
        const storedLikes = JSON.parse(localStorage.getItem('18tube_feed_likes') || '[]');
        state.likedIds = new Set(storedLikes);
        const storedFavs = JSON.parse(localStorage.getItem('18tube_feed_favs') || '[]');
        state.favoritedIds = new Set(storedFavs);
        const storedFollows = JSON.parse(localStorage.getItem('18tube_feed_follows') || '[]');
        state.followedCreators = new Set(storedFollows);
    } catch (e) {
        console.warn('Lỗi đọc localStorage:', e);
    }

    // -------------------------------------------------------------
    // DOM REFERENCES
    // -------------------------------------------------------------
    const container = document.getElementById('tiktok-feed-container');
    const unmutePrompt = document.getElementById('feed-unmute-prompt');
    const btnToggleSound = document.getElementById('btn-toggle-sound');
    const iconSoundOn = document.getElementById('icon-sound-on');
    const iconSoundOff = document.getElementById('icon-sound-off');
    const btnToggleAutoNext = document.getElementById('btn-toggle-autonext');
    const btnToggleFullscreen = document.getElementById('btn-toggle-fullscreen');
    const tabFyp = document.getElementById('tab-fyp');
    const tabFollowing = document.getElementById('tab-following');
    const btnDeskPrev = document.getElementById('btn-desk-prev');
    const btnDeskNext = document.getElementById('btn-desk-next');
    const toastContainer = document.getElementById('feed-toast-container');

    // -------------------------------------------------------------
    // HELPERS & UTILITIES
    // -------------------------------------------------------------
    function showToast(msg, duration = 2500) {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = 'feed-toast-msg';
        toast.textContent = msg;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    function formatNumber(num) {
        if (!num || num < 0) return '0';
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return String(num);
    }

    // Tạo số like giả lập dựa trên video id để TikTok feed trông sinh động
    function getEstimatedLikes(videoId) {
        let hash = 0;
        const str = String(videoId || '18tube');
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash % 9800) + 120;
    }

    function formatVideoTitle(name, creator) {
        if (!name) return `Video Shorts 4K • @${creator}`;
        const clean = name.replace(/\.(mp4|mov|webm|mkv|avi)$/i, '');
        // Nếu tên file là chuỗi số dài (timestamp do drive sinh ra)
        if (/^\d{10,}$/.test(clean)) {
            return `Video chất lượng cao • @${creator}`;
        }
        return clean;
    }

    function formatCountryTag(country) {
        const c = (country || 'Việt Nam').trim();
        const l = c.toLowerCase();
        if (l.includes('việt nam') || l.includes('vietnam')) return `🇻🇳 ${c}`;
        if (l.includes('hàn quốc') || l.includes('korea')) return `🇰🇷 ${c}`;
        if (l.includes('nhật') || l.includes('japan')) return `🇯🇵 ${c}`;
        if (l.includes('trung quốc') || l.includes('china')) return `🇨🇳 ${c}`;
        if (l.includes('mỹ') || l.includes('usa')) return `🇺🇸 ${c}`;
        return `🌐 ${c}`;
    }

    function formatTime(sec) {
        if (!sec || isNaN(sec) || sec < 0) return '00:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    // -------------------------------------------------------------
    // SOUND & AUTONEXT CONTROLS
    // -------------------------------------------------------------
    function setMuted(muted) {
        state.isMuted = muted;
        if (iconSoundOn && iconSoundOff) {
            iconSoundOn.style.display = muted ? 'none' : 'block';
            iconSoundOff.style.display = muted ? 'block' : 'none';
        }
        if (btnToggleSound) {
            btnToggleSound.classList.toggle('active', !muted);
        }
        if (unmutePrompt) {
            if (!muted) unmutePrompt.classList.add('hidden');
        }

        // Áp dụng âm thanh ngay cho video hiện tại đang phát
        const curSlide = container.children[state.currentIndex];
        if (curSlide) {
            const vid = curSlide.querySelector('.tiktok-video');
            if (vid) {
                vid.muted = muted;
                vid.defaultMuted = muted;
                if (!muted && vid.paused && !vid.dataset.userPaused) {
                    vid.play().catch(() => {});
                }
            }
        }
        showToast(muted ? '🔇 Đã tắt âm thanh' : '🔊 Đã bật âm thanh');
    }

    function toggleSound() {
        setMuted(!state.isMuted);
    }

    function setAutoNext(enabled) {
        state.autoNext = enabled;
        if (btnToggleAutoNext) {
            btnToggleAutoNext.classList.toggle('active', enabled);
        }
        showToast(enabled ? '⚡ Đã bật tự lướt video tiếp theo' : '⏸ Đã tắt tự lướt video');
    }

    // -------------------------------------------------------------
    // FULLSCREEN HANDLER
    // -------------------------------------------------------------
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            }
        }
    }

    // -------------------------------------------------------------
    // RENDER SLIDE DOM
    // -------------------------------------------------------------
    function createSlideElement(video, index) {
        const slide = document.createElement('div');
        slide.className = 'tiktok-slide';
        slide.dataset.index = index;
        const videoId = video.id || video.path || `vid_${index}`;
        slide.dataset.id = videoId;

        const isLiked = state.likedIds.has(videoId);
        const isFav = state.favoritedIds.has(videoId);
        const creatorName = video.creator || 'Creator';
        const isFollowing = state.followedCreators.has(creatorName);
        const likesCount = getEstimatedLikes(videoId) + (isLiked ? 1 : 0);
        const streamUrl = video.stream_url || (video.id ? `/api/media/drive/stream?id=${video.id}&name=${encodeURIComponent(video.name || 'video.mp4')}` : '');
        slide.dataset.streamUrl = streamUrl;
        const posterUrl = video.thumbnail_url || (video.id ? `https://lh3.googleusercontent.com/d/${video.id}=w800` : '/static/placeholder.svg');
        const country = video.country || 'Việt Nam';
        const countryDisplay = formatCountryTag(country);
        const titleDisplay = formatVideoTitle(video.name, creatorName);
        const sizeStr = video.size_str ? `4K • ${video.size_str}` : '4K Ultra HD';

        // Tên đại diện và avatar cho creator
        const avatarLetter = (creatorName[0] || 'C').toUpperCase();

        // Chỉ gắn src cho 2 video đầu tiên để tránh nghẽn socket HTTP 206
        const shouldAttachSrc = index <= 1;
        const videoSrcAttr = shouldAttachSrc ? `src="${streamUrl}"` : '';
        const initialPreload = index === 0 ? 'auto' : (index === 1 ? 'metadata' : 'none');

        slide.innerHTML = `
            <!-- AMBIENT BLUR BACKDROP -->
            <div class="slide-ambient-blur" style="background-image: url('${posterUrl}')"></div>

            <!-- MAIN VIDEO STAGE -->
            <div class="slide-video-wrap">
                <video class="tiktok-video" 
                       ${videoSrcAttr}
                       playsinline 
                       webkit-playsinline 
                       x5-playsinline
                       loop 
                       muted
                       preload="${initialPreload}" 
                       poster="${posterUrl}">
                </video>

                <!-- CENTER PLAY / PAUSE PULSE INDICATOR -->
                <div class="slide-center-play-icon">
                    <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                        <polygon points="6 3 20 12 6 21 6 3"></polygon>
                    </svg>
                </div>

                <!-- RIGHT ACTION SIDEBAR -->
                <div class="slide-actions-bar">
                    <!-- AVATAR + FOLLOW -->
                    <div class="action-avatar-wrap">
                        <a href="/gallery?creator=${encodeURIComponent(creatorName)}" class="action-avatar-link" title="Xem toàn bộ video của @${creatorName}">
                            <div class="action-avatar-fallback">${avatarLetter}</div>
                        </a>
                        <div class="action-follow-badge ${isFollowing ? 'is-following' : ''}" title="${isFollowing ? 'Đang theo dõi' : 'Nhấn để theo dõi'}">
                            ${isFollowing ? '✓' : '+'}
                        </div>
                    </div>

                    <!-- LIKE BUTTON -->
                    <button class="action-btn-item action-btn-like ${isLiked ? 'is-liked' : ''}" title="Thích video (Phím L)">
                        <div class="action-icon-circle">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                        </div>
                        <span class="action-count-text">${formatNumber(likesCount)}</span>
                    </button>

                    <!-- FAVORITE / BOOKMARK BUTTON -->
                    <button class="action-btn-item action-btn-fav ${isFav ? 'is-fav' : ''}" title="Lưu vào mục Yêu thích">
                        <div class="action-icon-circle">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                            </svg>
                        </div>
                        <span class="action-count-text">Lưu</span>
                    </button>

                    <!-- SHARE BUTTON -->
                    <button class="action-btn-item action-btn-share" title="Sao chép liên kết video">
                        <div class="action-icon-circle">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="18" cy="5" r="3"></circle>
                                <circle cx="6" cy="12" r="3"></circle>
                                <circle cx="18" cy="19" r="3"></circle>
                                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                            </svg>
                        </div>
                        <span class="action-count-text">Chia sẻ</span>
                    </button>

                    <!-- SPINNING MUSIC DISC -->
                    <div class="action-music-disc">
                        <div class="disc-center-art" style="background-image: url('${posterUrl}')"></div>
                    </div>
                </div>

                <!-- BOTTOM-LEFT INFO OVERLAY -->
                <div class="slide-info-overlay">
                    <div class="slide-creator-row">
                        <a href="/gallery?creator=${encodeURIComponent(creatorName)}" class="slide-creator-handle">
                            @${creatorName}
                            <span class="slide-verified-tick" title="Đã xác thực nguồn">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                </svg>
                            </span>
                        </a>
                        <span class="slide-country-pill">${countryDisplay}</span>
                    </div>

                    <div class="slide-caption-row">
                        <span class="slide-filename">${titleDisplay}</span>
                        ${sizeStr ? `<span class="slide-size-pill">${sizeStr}</span>` : ''}
                    </div>

                    <!-- SOUND TICKER -->
                    <div class="slide-audio-ticker">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 18V5l12-2v13"></path>
                            <circle cx="6" cy="18" r="3"></circle>
                            <circle cx="18" cy="16" r="3"></circle>
                        </svg>
                        <span class="ticker-marquee-text">Âm thanh gốc - @${creatorName} • 18TUBE 4K</span>
                    </div>
                </div>

                <!-- BOTTOM PROGRESS BAR SCRUBBER -->
                <div class="slide-progress-bar-wrap" title="Kéo để tua video">
                    <div class="slide-progress-fill">
                        <div class="slide-progress-handle"></div>
                    </div>
                    <div class="slide-progress-tooltip">00:00 / 00:00</div>
                </div>
            </div>
        `;

        attachSlideEvents(slide, video, videoId, creatorName, likesCount);
        return slide;
    }

    // -------------------------------------------------------------
    // SLIDE EVENTS & INTERACTIONS
    // -------------------------------------------------------------
    function attachSlideEvents(slide, video, videoId, creatorName, baseLikes) {
        const videoEl = slide.querySelector('.tiktok-video');
        const playIcon = slide.querySelector('.slide-center-play-icon');
        const videoWrap = slide.querySelector('.slide-video-wrap');
        const btnLike = slide.querySelector('.action-btn-like');
        const likeCountEl = btnLike ? btnLike.querySelector('.action-count-text') : null;
        const btnFav = slide.querySelector('.action-btn-fav');
        const btnShare = slide.querySelector('.action-btn-share');
        const followBadge = slide.querySelector('.action-follow-badge');
        const disc = slide.querySelector('.action-music-disc');
        const progressWrap = slide.querySelector('.slide-progress-bar-wrap');
        const progressFill = slide.querySelector('.slide-progress-fill');

        // 1. Double Tap Flying Heart Effect
        function spawnFloatingHeart(clientX, clientY) {
            const rect = videoWrap.getBoundingClientRect();
            const relX = clientX - rect.left;
            const relY = clientY - rect.top;

            const heart = document.createElement('div');
            heart.className = 'heart-tap-particle';
            heart.style.left = `${relX}px`;
            heart.style.top = `${relY}px`;
            heart.innerHTML = `
                <svg viewBox="0 0 24 24">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
            `;
            videoWrap.appendChild(heart);
            setTimeout(() => heart.remove(), 900);

            // Tự động thích video nếu chưa thích
            if (!state.likedIds.has(videoId)) {
                toggleLikeVideo(videoId, btnLike, likeCountEl, baseLikes);
            }
        }

        // Single Tap / Double Tap Detection
        let clickTimeout = null;
        videoEl.addEventListener('click', (e) => {
            const now = Date.now();
            const timeDiff = now - state.lastTapTime;

            if (timeDiff < 320) {
                // Double tap!
                clearTimeout(clickTimeout);
                clickTimeout = null;
                spawnFloatingHeart(e.clientX, e.clientY);
                state.lastTapTime = 0;
            } else {
                // Single tap chờ xem có tap lần 2 không
                state.lastTapTime = now;
                clickTimeout = setTimeout(() => {
                    // Toggle Play / Pause
                    if (videoEl.paused) {
                        delete videoEl.dataset.userPaused;
                        videoEl.play().then(() => {
                            playIcon.classList.remove('visible');
                            playIcon.classList.remove('pulse-fade');
                            void playIcon.offsetWidth; // Trigger reflow for re-animation
                            playIcon.classList.add('pulse-fade');
                            setTimeout(() => playIcon.classList.remove('pulse-fade'), 380);
                            if (disc) disc.classList.add('playing');
                        }).catch(() => {});
                    } else {
                        videoEl.dataset.userPaused = 'true';
                        videoEl.pause();
                        playIcon.classList.remove('pulse-fade');
                        playIcon.classList.add('visible');
                        if (disc) disc.classList.remove('playing');
                    }
                    clickTimeout = null;
                }, 280);
            }
        });

        // 2. Like Button Click
        if (btnLike) {
            btnLike.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleLikeVideo(videoId, btnLike, likeCountEl, baseLikes);
            });
        }

        // 3. Favorite Button Click
        if (btnFav) {
            btnFav.addEventListener('click', (e) => {
                e.stopPropagation();
                const isFav = state.favoritedIds.has(videoId);
                if (isFav) {
                    state.favoritedIds.delete(videoId);
                    btnFav.classList.remove('is-fav');
                    showToast('Đã bỏ lưu video');
                } else {
                    state.favoritedIds.add(videoId);
                    btnFav.classList.add('is-fav');
                    showToast('⭐ Đã lưu vào mục Yêu thích');
                }
                localStorage.setItem('18tube_feed_favs', JSON.stringify(Array.from(state.favoritedIds)));
            });
        }

        // 4. Follow Badge Click
        if (followBadge) {
            followBadge.addEventListener('click', (e) => {
                e.stopPropagation();
                const isFollowing = state.followedCreators.has(creatorName);
                if (isFollowing) {
                    state.followedCreators.delete(creatorName);
                    followBadge.classList.remove('is-following');
                    followBadge.textContent = '+';
                    followBadge.title = 'Nhấn để theo dõi';
                    showToast(`Đã bỏ theo dõi @${creatorName}`);
                } else {
                    state.followedCreators.add(creatorName);
                    followBadge.classList.add('is-following');
                    followBadge.textContent = '✓';
                    followBadge.title = 'Đang theo dõi';
                    showToast(`✨ Đang theo dõi @${creatorName}`);
                }
                localStorage.setItem('18tube_feed_follows', JSON.stringify(Array.from(state.followedCreators)));
            });
        }

        // 5. Share Button Click
        if (btnShare) {
            btnShare.addEventListener('click', (e) => {
                e.stopPropagation();
                const shareUrl = `${window.location.origin}/feed?creator=${encodeURIComponent(creatorName)}&v=${videoId}`;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(shareUrl).then(() => {
                        showToast('🔗 Đã sao chép liên kết video vào clipboard!');
                    }).catch(() => {
                        showToast('Liên kết: ' + shareUrl);
                    });
                } else {
                    showToast('Liên kết: ' + shareUrl);
                }
            });
        }

        // 6. Interactive Scrubber with Dragging & Time Tooltip
        const progressTooltip = slide.querySelector('.slide-progress-tooltip');
        let isDraggingProgress = false;
        let wasPlayingBeforeDrag = false;

        function calcScrubPercent(clientX) {
            if (!progressWrap) return 0;
            const rect = progressWrap.getBoundingClientRect();
            if (rect.width <= 0) return 0;
            return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        }

        function updateScrubVisual(clientX) {
            const pct = calcScrubPercent(clientX);
            if (progressFill) progressFill.style.width = `${pct * 100}%`;
            if (videoEl.duration) {
                const curSec = pct * videoEl.duration;
                if (progressTooltip) {
                    progressTooltip.textContent = `${formatTime(curSec)} / ${formatTime(videoEl.duration)}`;
                    const pctClamped = Math.max(0.08, Math.min(0.92, pct));
                    progressTooltip.style.left = `${pctClamped * 100}%`;
                }
            }
        }

        videoEl.addEventListener('timeupdate', () => {
            if (!isDraggingProgress && videoEl.duration && progressFill) {
                const pct = (videoEl.currentTime / videoEl.duration) * 100;
                progressFill.style.width = `${pct}%`;
            }
        });

        if (progressWrap) {
            function onDragStart(e) {
                e.stopPropagation();
                if (e.cancelable) e.preventDefault();
                isDraggingProgress = true;
                progressWrap.classList.add('dragging');
                wasPlayingBeforeDrag = !videoEl.paused;
                videoEl.pause();
                const clientX = (e.clientX !== undefined)
                    ? e.clientX
                    : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
                updateScrubVisual(clientX);

                window.addEventListener('mousemove', onDragMove);
                window.addEventListener('touchmove', onDragMove, { passive: false });
                window.addEventListener('mouseup', onDragEnd);
                window.addEventListener('touchend', onDragEnd);
            }

            function onDragMove(e) {
                if (!isDraggingProgress) return;
                if (e.cancelable) e.preventDefault();
                const clientX = (e.clientX !== undefined)
                    ? e.clientX
                    : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
                updateScrubVisual(clientX);
            }

            function onDragEnd(e) {
                if (!isDraggingProgress) return;
                isDraggingProgress = false;
                progressWrap.classList.remove('dragging');

                window.removeEventListener('mousemove', onDragMove);
                window.removeEventListener('touchmove', onDragMove);
                window.removeEventListener('mouseup', onDragEnd);
                window.removeEventListener('touchend', onDragEnd);

                const clientX = (e.clientX !== undefined)
                    ? e.clientX
                    : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : 0);
                const pct = calcScrubPercent(clientX);
                if (videoEl.duration) {
                    videoEl.currentTime = pct * videoEl.duration;
                }
                if (wasPlayingBeforeDrag) {
                    videoEl.play().catch(() => {});
                }
            }

            progressWrap.addEventListener('mousedown', onDragStart);
            progressWrap.addEventListener('touchstart', onDragStart, { passive: false });

            // Hover tooltip update
            progressWrap.addEventListener('mousemove', (e) => {
                if (isDraggingProgress) return;
                updateScrubVisual(e.clientX);
            });
        }

        // 7. Video Ended Handler
        videoEl.addEventListener('ended', () => {
            if (state.autoNext) {
                scrollToNextVideo();
            }
        });
    }

    function toggleLikeVideo(videoId, btnLike, likeCountEl, baseLikes) {
        const isLiked = state.likedIds.has(videoId);
        if (isLiked) {
            state.likedIds.delete(videoId);
            btnLike.classList.remove('is-liked');
            if (likeCountEl) likeCountEl.textContent = formatNumber(baseLikes);
            showToast('Đã bỏ thích');
        } else {
            state.likedIds.add(videoId);
            btnLike.classList.add('is-liked');
            if (likeCountEl) likeCountEl.textContent = formatNumber(baseLikes + 1);
            showToast('❤️ Đã thích video');
        }
        localStorage.setItem('18tube_feed_likes', JSON.stringify(Array.from(state.likedIds)));
    }

    // -------------------------------------------------------------
    // VIRTUAL VIDEO WINDOW (PREVENTS CONNECTION STARVATION & STUTTER)
    // -------------------------------------------------------------
    function manageVideoWindow(centerIndex) {
        if (!container) return;
        const total = container.children.length;
        const BUFFER_RADIUS = 2; // Giữ video trong phạm vi [centerIndex - 2, centerIndex + 2]

        for (let i = 0; i < total; i++) {
            const slide = container.children[i];
            if (!slide || !slide.classList.contains('tiktok-slide')) continue;

            const vid = slide.querySelector('.tiktok-video');
            if (!vid) continue;

            const dist = Math.abs(i - centerIndex);
            const streamUrl = slide.dataset.streamUrl;

            if (dist <= BUFFER_RADIUS) {
                // Trong vùng đệm lướt: gắn src nếu chưa có để sẵn sàng phát tức thì
                if (streamUrl && (!vid.src || vid.src === '' || vid.src === window.location.href)) {
                    vid.src = streamUrl;
                    vid.preload = (dist === 0 || dist === 1) ? 'auto' : 'metadata';
                    vid.load();
                } else if (dist === 1 && vid.preload !== 'auto') {
                    vid.preload = 'auto';
                }
            } else {
                // Ngoài vùng đệm (> 2 slide): dọn dẹp triệt để giải phóng TCP connection & GPU buffer
                if (vid.src && vid.src !== '' && vid.src !== window.location.href) {
                    vid.pause();
                    vid.removeAttribute('src');
                    vid.load(); // Ngắt kết nối socket HTTP 206 ngay lập tức
                    delete vid.dataset.userPaused;
                }
            }
        }
    }

    // -------------------------------------------------------------
    // SINGLE-ACTIVE-SLIDE VIDEO CONTROLLER
    // -------------------------------------------------------------
    let currentActiveIndex = -1;

    function playActiveSlide(index) {
        if (index < 0 || index >= container.children.length) return;

        // Nếu đã ở slide này, đảm bảo video đang phát trừ khi người dùng chủ động Pause
        if (currentActiveIndex === index) {
            const curSlide = container.children[index];
            if (curSlide) {
                const vid = curSlide.querySelector('.tiktok-video');
                if (vid && vid.paused && !vid.dataset.userPaused) {
                    vid.play().catch(() => {});
                }
            }
            return;
        }

        currentActiveIndex = index;
        state.currentIndex = index;

        // 1. Quản lý cửa sổ trượt nạp video (giải phóng kết nối mạng & GPU RAM)
        manageVideoWindow(index);

        // 2. DỪNG TRIỆT ĐỂ TOÀN BỘ VIDEO KHÁC (NGĂN CHẶN 100% LỖI PHÁT NGẦM KHI LƯỚT QUA)
        Array.from(container.children).forEach((slide, i) => {
            if (i !== index) {
                const otherVid = slide.querySelector('.tiktok-video');
                const otherDisc = slide.querySelector('.action-music-disc');
                const otherPlayIcon = slide.querySelector('.slide-center-play-icon');

                if (otherVid) {
                    otherVid.pause();
                    if (otherVid.currentTime > 0) otherVid.currentTime = 0;
                    delete otherVid.dataset.userPaused;
                }
                if (otherDisc) otherDisc.classList.remove('playing');
                if (otherPlayIcon) otherPlayIcon.classList.remove('visible');
            }
        });

        // 3. PHÁT VIDEO MỤC TIÊU
        const activeSlide = container.children[index];
        if (!activeSlide) return;

        const activeVid = activeSlide.querySelector('.tiktok-video');
        const activeDisc = activeSlide.querySelector('.action-music-disc');
        const activePlayIcon = activeSlide.querySelector('.slide-center-play-icon');

        if (activeVid) {
            // Đảm bảo có streamUrl
            if (!activeVid.src || activeVid.src === '' || activeVid.src === window.location.href) {
                const streamUrl = activeSlide.dataset.streamUrl;
                if (streamUrl) {
                    activeVid.src = streamUrl;
                    activeVid.load();
                }
            }

            activeVid.muted = state.isMuted;
            activeVid.defaultMuted = state.isMuted;
            delete activeVid.dataset.userPaused;

            const playPromise = activeVid.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    // Kiểm tra người dùng còn ở slide này không (tránh race condition khi lướt nhanh)
                    if (currentActiveIndex === index) {
                        if (activeDisc) activeDisc.classList.add('playing');
                        if (activePlayIcon) activePlayIcon.classList.remove('visible');
                    } else {
                        // Người dùng đã lướt đi nơi khác -> pause ngay lập tức
                        activeVid.pause();
                    }
                }).catch((err) => {
                    // Nếu người dùng đã lướt đi nơi khác, bỏ qua
                    if (currentActiveIndex !== index) return;

                    // Nếu do pause() can thiệp (AbortError), KHÔNG BAO GIỜ gọi lại play()
                    if (err && err.name === 'AbortError') return;

                    // Trình duyệt chặn autoplay unmuted -> fallback sang muted autoplay
                    activeVid.muted = true;
                    activeVid.defaultMuted = true;
                    activeVid.play().then(() => {
                        if (currentActiveIndex === index) {
                            if (activeDisc) activeDisc.classList.add('playing');
                            if (activePlayIcon) activePlayIcon.classList.remove('visible');
                        } else {
                            activeVid.pause();
                        }
                    }).catch(() => {
                        // Hiển thị icon Play to ở giữa để người dùng chạm phát nếu trình duyệt chặn hoàn toàn
                        if (activePlayIcon) activePlayIcon.classList.add('visible');
                    });
                });
            }
        }

        // 4. Tải trước tiếp theo (preload auto)
        const nextSlide = container.children[index + 1];
        if (nextSlide) {
            const nextVid = nextSlide.querySelector('.tiktok-video');
            if (nextVid && nextVid.preload !== 'auto') {
                nextVid.preload = 'auto';
            }
        }

        // 5. Nạp thêm video vô tận khi còn cách cuối 5 video
        if (index >= state.videos.length - 5 && !state.isLoadingMore && state.hasMore) {
            fetchMoreVideos();
        }
    }

    // -------------------------------------------------------------
    // INTERSECTION OBSERVER & SCROLL SYNC
    // -------------------------------------------------------------
    let observer = null;

    function setupObserver() {
        if (observer) observer.disconnect();

        observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
                    const slideIndex = parseInt(entry.target.dataset.index, 10);
                    if (!isNaN(slideIndex)) {
                        playActiveSlide(slideIndex);
                    }
                }
            });
        }, {
            root: container,
            threshold: [0.65]
        });

        Array.from(container.children).forEach((slide) => {
            if (slide.classList.contains('tiktok-slide')) {
                observer.observe(slide);
            }
        });
    }

    // Lắng nghe sự kiện scrollend & scroll để đồng bộ dứt khoát khi cuộn dừng
    let scrollDebounceTimer = null;
    if (container) {
        function syncScrollSnapTarget() {
            const clientH = container.clientHeight || window.innerHeight;
            if (clientH > 0) {
                const targetIdx = Math.round(container.scrollTop / clientH);
                if (targetIdx >= 0 && targetIdx < container.children.length && targetIdx !== currentActiveIndex) {
                    playActiveSlide(targetIdx);
                }
            }
        }

        if ('onscrollend' in window || 'onscrollend' in container) {
            container.addEventListener('scrollend', syncScrollSnapTarget, { passive: true });
        }

        container.addEventListener('scroll', () => {
            if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
            scrollDebounceTimer = setTimeout(syncScrollSnapTarget, 80);
        }, { passive: true });
    }

    // -------------------------------------------------------------
    // NAVIGATION (SCROLL TO PREV / NEXT)
    // -------------------------------------------------------------
    function scrollToSlide(index) {
        if (index < 0 || index >= container.children.length) return;
        const targetSlide = container.children[index];
        if (targetSlide) {
            playActiveSlide(index);
            targetSlide.scrollIntoView({ behavior: 'smooth' });
        }
    }

    function scrollToNextVideo() {
        if (state.currentIndex + 1 < container.children.length) {
            scrollToSlide(state.currentIndex + 1);
        } else if (state.hasMore && !state.isLoadingMore) {
            fetchMoreVideos(() => {
                scrollToSlide(state.currentIndex + 1);
            });
        }
    }

    function scrollToPrevVideo() {
        if (state.currentIndex > 0) {
            scrollToSlide(state.currentIndex - 1);
        }
    }

    // -------------------------------------------------------------
    // INFINITE SCROLL: FETCH MORE VIDEOS
    // -------------------------------------------------------------
    function fetchMoreVideos(callback) {
        if (state.isLoadingMore || !state.hasMore) return;
        state.isLoadingMore = true;

        const nextQueryPage = state.videos.length === 0 ? 1 : state.page + 1;
        const excludeList = Array.from(state.seenIds).slice(-100).join(',');
        const params = new URLSearchParams({
            page: nextQueryPage,
            limit: 15,
            mode: state.activeTab,
            exclude_ids: excludeList
        });
        if (state.targetCreator) {
            params.set('creator', state.targetCreator);
        }

        fetch(`/api/feed/videos?${params.toString()}`)
            .then(res => res.json())
            .then(data => {
                if (data.success && data.videos && data.videos.length > 0) {
                    state.page = nextQueryPage;
                    state.hasMore = (data.has_more !== undefined ? data.has_more : data.hasMore) !== false;

                    const startIndex = state.videos.length;
                    data.videos.forEach((vid, i) => {
                        const vidId = vid.id || vid.path;
                        state.seenIds.add(vidId);
                        state.videos.push(vid);
                        const slideEl = createSlideElement(vid, startIndex + i);
                        container.appendChild(slideEl);
                        if (observer) observer.observe(slideEl);
                    });

                    // Cập nhật cửa sổ trượt nạp video cho các slide vừa thêm
                    manageVideoWindow(state.currentIndex);

                    if (typeof callback === 'function') {
                        callback();
                    }
                } else {
                    state.hasMore = false;
                    if (state.videos.length === 0) {
                        renderEmptyState();
                    }
                }
            })
            .catch(err => {
                console.error('Lỗi nạp thêm video:', err);
                if (state.videos.length === 0) {
                    renderEmptyState();
                }
            })
            .finally(() => {
                state.isLoadingMore = false;
            });
    }

    function renderEmptyState() {
        if (!container || container.querySelector('.tiktok-slide')) return;
        container.innerHTML = `
            <div class="feed-empty-state" style="height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; color: #94a3b8; text-align: center; padding: 2rem;">
                <div style="font-size: 3rem;">🎬</div>
                <h3 style="color: #fff; font-size: 1.25rem;">Chưa có video trong kho Shorts</h3>
                <p style="max-width: 400px; font-size: 0.9rem; line-height: 1.5; color: #cbd5e1;">Kho video Google Drive đang được đồng bộ hoặc creator chưa có video nào. Bạn có thể quay lại Thư viện Gallery để khám phá toàn bộ media.</p>
                <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem;">
                    <button onclick="window.location.reload()" style="padding: 0.6rem 1.2rem; background: #fe2c55; border: none; border-radius: 99px; color: #fff; font-weight: 700; cursor: pointer;">🔄 Thử lại</button>
                    <a href="/gallery" style="padding: 0.6rem 1.2rem; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); border-radius: 99px; color: #fff; font-weight: 600; text-decoration: none;">Thư viện Gallery</a>
                </div>
            </div>
        `;
    }

    // -------------------------------------------------------------
    // RANDOM FEED VIDEO JUMP
    // -------------------------------------------------------------
    function jumpToRandomVideo() {
        if (!container) return;
        const total = container.children.length;
        if (total <= 1) return;
        let randIdx = Math.floor(Math.random() * total);
        if (randIdx === state.currentIndex) {
            randIdx = (randIdx + 1) % total;
        }
        showToast('🎲 Đang nhảy ngẫu nhiên tới video mới!');
        scrollToSlide(randIdx);
    }

    // -------------------------------------------------------------
    // KEYBOARD SHORTCUTS
    // -------------------------------------------------------------
    function handleKeyDown(e) {
        // Tránh can thiệp khi đang gõ vào input
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

        switch (e.key) {
            case 'ArrowDown':
            case 'j':
            case 'J':
            case 's':
            case 'S':
                e.preventDefault();
                scrollToNextVideo();
                break;

            case 'ArrowUp':
            case 'k':
            case 'K':
            case 'w':
            case 'W':
                e.preventDefault();
                scrollToPrevVideo();
                break;

            case 'r':
            case 'R':
                e.preventDefault();
                jumpToRandomVideo();
                break;

            case ' ': // Spacebar: Play/Pause
                e.preventDefault();
                const curSlide = container.children[state.currentIndex];
                if (curSlide) {
                    const vid = curSlide.querySelector('.tiktok-video');
                    const playIcon = curSlide.querySelector('.slide-center-play-icon');
                    const disc = curSlide.querySelector('.action-music-disc');
                    if (vid) {
                        if (vid.paused) {
                            vid.play().then(() => {
                                if (playIcon) playIcon.classList.remove('visible');
                                if (disc) disc.classList.add('playing');
                            }).catch(() => {});
                        } else {
                            vid.pause();
                            if (playIcon) playIcon.classList.add('visible');
                            if (disc) disc.classList.remove('playing');
                        }
                    }
                }
                break;

            case 'm':
            case 'M':
                e.preventDefault();
                toggleSound();
                break;

            case 'l':
            case 'L':
                e.preventDefault();
                const activeSlide = container.children[state.currentIndex];
                if (activeSlide) {
                    const btnLike = activeSlide.querySelector('.action-btn-like');
                    if (btnLike) btnLike.click();
                }
                break;

            case 'f':
            case 'F':
                e.preventDefault();
                toggleFullscreen();
                break;
        }
    }

    // -------------------------------------------------------------
    // TAB SWITCHING (FOR YOU / FOLLOWING)
    // -------------------------------------------------------------
    function switchTab(mode) {
        if (state.activeTab === mode) return;
        state.activeTab = mode;

        if (tabFyp && tabFollowing) {
            tabFyp.classList.toggle('active', mode === 'fyp');
            tabFollowing.classList.toggle('active', mode === 'following');
        }

        // Dừng triệt để toàn bộ video cũ trước khi dọn dẹp container
        Array.from(container.children).forEach(slide => {
            const vid = slide.querySelector('.tiktok-video');
            if (vid) {
                vid.pause();
                vid.src = '';
                vid.load();
            }
        });
        currentActiveIndex = -1;

        // Reset feed và nạp lại nguồn video theo tab
        container.innerHTML = `
            <div style="height: 100dvh; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 0.95rem;">
                Đang chuyển sang tab ${mode === 'following' ? 'Đang theo dõi' : 'Dành cho bạn'}...
            </div>
        `;

        state.videos = [];
        state.page = 1;
        state.currentIndex = 0;
        state.hasMore = true;

        fetchMoreVideos(() => {
            // Xóa loading placeholder
            const placeholder = container.firstElementChild;
            if (placeholder && placeholder.tagName === 'DIV' && !placeholder.classList.contains('tiktok-slide')) {
                placeholder.remove();
            }
            setupObserver();
            playActiveSlide(0);
        });
    }

    // -------------------------------------------------------------
    // INITIALIZATION & SERVER HYDRATION
    // -------------------------------------------------------------
    function init() {
        // Đọc dữ liệu Server-Side Hydration (0ms load)
        const scriptData = document.getElementById('__FEED_PRELOADED_DATA__');
        let preloaded = null;
        if (scriptData && scriptData.textContent) {
            try {
                preloaded = JSON.parse(scriptData.textContent);
            } catch (e) {
                console.warn('Lỗi parse preloaded JSON feed:', e);
            }
        }

        // Lấy creator từ URL nếu có
        const urlParams = new URLSearchParams(window.location.search);
        state.targetCreator = urlParams.get('creator') || (preloaded ? preloaded.target_creator : '') || '';

        // Đổ video từ Server Hydration ngay lập tức (0s chờ)
        if (preloaded && preloaded.videos && preloaded.videos.length > 0) {
            container.innerHTML = '';
            preloaded.videos.forEach((vid, i) => {
                const vidId = vid.id || vid.path;
                state.seenIds.add(vidId);
                state.videos.push(vid);
                const slide = createSlideElement(vid, i);
                container.appendChild(slide);
            });
            setupObserver();
            // Tự động phát ngay lập tức video đầu tiên
            setTimeout(() => {
                playActiveSlide(0);
            }, 60);
        } else {
            // Fallback gọi API nếu chưa có hydrate
            fetchMoreVideos(() => {
                setupObserver();
                playActiveSlide(0);
            });
        }

        // Gắn sự kiện giao diện
        if (unmutePrompt) {
            unmutePrompt.addEventListener('click', () => setMuted(false));
        }
        if (btnToggleSound) {
            btnToggleSound.addEventListener('click', toggleSound);
        }
        if (btnToggleAutoNext) {
            btnToggleAutoNext.addEventListener('click', () => setAutoNext(!state.autoNext));
        }
        if (btnToggleFullscreen) {
            btnToggleFullscreen.addEventListener('click', toggleFullscreen);
        }
        if (btnDeskPrev) {
            btnDeskPrev.addEventListener('click', scrollToPrevVideo);
        }
        if (btnDeskNext) {
            btnDeskNext.addEventListener('click', scrollToNextVideo);
        }
        if (tabFyp) {
            tabFyp.addEventListener('click', () => switchTab('fyp'));
        }
        if (tabFollowing) {
            tabFollowing.addEventListener('click', () => switchTab('following'));
        }

        // Lắng nghe bàn phím
        window.addEventListener('keydown', handleKeyDown);

        // Chạm vào bất kỳ đâu trên màn hình lần đầu cũng kích hoạt âm thanh nếu người dùng tương tác
        document.body.addEventListener('click', function onFirstUserGesture() {
            if (unmutePrompt && !state.isMuted) {
                unmutePrompt.classList.add('hidden');
            }
        }, { once: true });
    }

    // Khởi chạy khi DOM sẵn sàng
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
