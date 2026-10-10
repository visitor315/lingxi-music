// ================== 全局 MediaSession 动作注册 ==================
if ('mediaSession' in navigator) {
  try {
    navigator.mediaSession.setActionHandler('play', () => togglePlayState());
    navigator.mediaSession.setActionHandler('pause', () => togglePlayState());
    navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
    navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
  } catch(e) {}
}

// ================== 悬浮窗 / 画中画模式状态监听 ==================
window.onPipModeChanged = function(isInPip) {
  document.body.classList.toggle('in-pip-mode', isInPip);
  isPipActive = isInPip;
  if (typeof updateDesktopLyricsUI === 'function') updateDesktopLyricsUI();
};

// ================== 首次进入新手教程逻辑 ==================
function checkFirstLaunchTutorial() {
  try {
    if (!localStorage.getItem('lingxi_seen_tutorial_v2')) {
      setTimeout(() => {
        openBeginnerGuideModal();
        localStorage.setItem('lingxi_seen_tutorial_v2', 'true');
      }, 600);
    }
  } catch(e) {}
}

window.addEventListener('load', () => {
  checkFirstLaunchTutorial();
  if (typeof initProgressBarDrag === 'function') initProgressBarDrag();
  if (defaultHomeTab === 'library' && typeof switchHomeNavTab === 'function') {
    switchHomeNavTab('library');
  }
  if (typeof updateDefaultHomeTabUI === 'function') updateDefaultHomeTabUI();
  setTimeout(() => checkAppUpdate(false), 1500);
});
/* ================== 顶部唱片滑动切歌 (全区域左右滑动手势直接切换上下曲) ================== */
(function initVinylSwipeGesture() {
  function bindGesture() {
    const stage = document.querySelector('.radio-stage-viewport');
    if (!stage) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchDeltaX = 0;
    let touchDeltaY = 0;
    let isSwiping = false;

    stage.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchDeltaX = 0;
        touchDeltaY = 0;
        isSwiping = true;
      }
    }, { passive: true });

    stage.addEventListener('touchmove', (e) => {
      if (!isSwiping || !e.touches || e.touches.length !== 1) return;
      touchDeltaX = e.touches[0].clientX - touchStartX;
      touchDeltaY = e.touches[0].clientY - touchStartY;
    }, { passive: true });

    const handleSwipeEnd = () => {
      if (!isSwiping) return;
      isSwiping = false;

      const absX = Math.abs(touchDeltaX);
      const absY = Math.abs(touchDeltaY);

      if (absX > 25 && absX > absY * 0.6) {
        const total = topRecommendedTracks ? topRecommendedTracks.length : 0;
        if (total > 1) {
          if (touchDeltaX < 0) {
            // 左滑 -> 下一曲
            const nextIdx = (activeTopTrackIndex + 1) % total;
            playTopRecommendedTrack(nextIdx, false);
          } else {
            // 右滑 -> 上一曲
            const prevIdx = (activeTopTrackIndex - 1 + total) % total;
            playTopRecommendedTrack(prevIdx, false);
          }
        }
      }
    };

    stage.addEventListener('touchend', handleSwipeEnd, { passive: true });
    stage.addEventListener('touchcancel', handleSwipeEnd, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindGesture);
  } else {
    bindGesture();
  }
})();
/* ================== 主页标签左右滑动切换 (发现页与乐库页手势互通) ================== */
(function initHomeTabSwipeGesture() {
  function bindGesture() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let isTracking = false;

    document.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length !== 1) return;

      const fullP = document.getElementById('viewPlayerFull');
      const searchP = document.getElementById('viewSearchFull');
      const themeP = document.getElementById('viewThemeSettings');
      const detailP = document.getElementById('viewPlaylistDetail');
      const editP = document.getElementById('viewEditPlaylist');
      if (
        (fullP && fullP.classList.contains('active')) ||
        (searchP && searchP.classList.contains('active')) ||
        (themeP && themeP.classList.contains('active')) ||
        (detailP && detailP.classList.contains('active')) ||
        (editP && editP.classList.contains('active'))
      ) {
        isTracking = false;
        return;
      }

      if (document.querySelector('.create-playlist-sheet-overlay.active, .choose-playlist-modal.active, .song-menu-overlay.active, .playlist-drawer.open, .beginner-guide-modal.active, .cover-preview-modal.active, .audio-quality-modal.active, .universal-confirm-modal.active, .app-update-modal.active')) {
        isTracking = false;
        return;
      }

      const touch = e.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;

      if (startX < 22 || startX > window.innerWidth - 22) {
        isTracking = false;
        return;
      }

      const target = e.target;
      if (
        target.closest('.radio-stage-viewport') ||
        target.closest('.vinyl-scroll-channel') ||
        target.closest('.library-album-pills-bar') ||
        target.closest('.discover-columns-scroll') ||
        target.closest('.slider-track') ||
        target.closest('input, textarea, select')
      ) {
        isTracking = false;
        return;
      }

      // 切页手势仅在顶部导航标题栏有效，严禁在页面内容滚动区域拦截滑动手势造成意外切页
      if (!target.closest('#listenHeaderBar')) {
        isTracking = false;
        return;
      }

      touchStartX = startX;
      touchStartY = startY;
      touchStartTime = Date.now();
      isTracking = true;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      if (!isTracking) return;
      isTracking = false;

      const touch = e.changedTouches ? e.changedTouches[0] : null;
      if (!touch) return;

      const diffX = touch.clientX - touchStartX;
      const diffY = touch.clientY - touchStartY;
      const duration = Date.now() - touchStartTime;

      if (duration > 650) return;

      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);

      if (absX > 80 && absX > absY * 1.5) {
        if (currentHomeTab === 'discover' && diffX < -80) {
          switchHomeNavTab('library');
        } else if (currentHomeTab === 'library' && diffX > 80) {
          switchHomeNavTab('discover');
        }
      }
    }, { passive: true });

    document.addEventListener('touchcancel', () => {
      isTracking = false;
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindGesture);
  } else {
    bindGesture();
  }
})();
/* ================== 发现页真实弹性下拉刷新交互 (100% 灵敏稳定零概率失效) ================== */
(function initDiscoverPulldownRefresh() {
  function bindPulldown() {
    const scrollEl = document.getElementById('paneDiscover');
    const indicator = document.getElementById('discoverPullRefresh');
    const textEl = document.getElementById('discoverPullRefreshText');
    if (!scrollEl || !indicator || !textEl) return;

    let touchStartY = 0;
    let touchStartX = 0;
    let isPulling = false;
    let isRefreshing = false;

    scrollEl.addEventListener('touchstart', (e) => {
      if (currentHomeTab !== 'discover' || isRefreshing) return;
      if (e.touches && e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        isPulling = (scrollEl.scrollTop <= 6);
      }
    }, { passive: true });

    scrollEl.addEventListener('touchmove', (e) => {
      if (isRefreshing || !e.touches || e.touches.length !== 1) return;
      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const deltaY = currentY - touchStartY;
      const deltaX = Math.abs(currentX - touchStartX);

      // 滑动中触顶且下拉动态激活
      if (!isPulling && scrollEl.scrollTop <= 2 && deltaY > 0) {
        isPulling = true;
        touchStartY = currentY;
        return;
      }

      if (isPulling && scrollEl.scrollTop <= 2 && deltaY > 0 && deltaY > deltaX * 0.85) {
        const visualHeight = Math.min(68, deltaY * 0.45);
        indicator.style.transition = 'none';
        indicator.style.height = visualHeight + 'px';
        indicator.classList.add('pulling');

        if (visualHeight >= 46) {
          indicator.classList.add('ready');
          textEl.textContent = '释放立即刷新';
        } else {
          indicator.classList.remove('ready');
          textEl.textContent = '下拉刷新推荐';
        }

        if (deltaY > 6 && e.cancelable) {
          e.preventDefault();
        }
      } else if (deltaY < 0 && indicator.classList.contains('pulling')) {
        indicator.style.height = '0px';
        indicator.classList.remove('pulling', 'ready');
      }
    }, { passive: false });

    const finishPull = () => {
      if (!isPulling || isRefreshing) return;
      isPulling = false;

      const currentHeight = parseFloat(indicator.style.height) || 0;
      indicator.style.transition = 'height 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';

      if (currentHeight >= 46) {
        isRefreshing = true;
        indicator.classList.remove('ready');
        indicator.classList.add('refreshing');
        indicator.style.height = '48px';
        textEl.textContent = '正在刷新曲目...';

        refreshRecommendations(true);
        setTimeout(() => {
          indicator.style.height = '0px';
          indicator.classList.remove('pulling', 'refreshing');
          textEl.textContent = '下拉刷新推荐';
          isRefreshing = false;
          toast('已刷新发现推荐');
        }, 900);
      } else {
        indicator.style.height = '0px';
        indicator.classList.remove('pulling', 'ready');
      }
    };

    scrollEl.addEventListener('touchend', finishPull, { passive: true });
    scrollEl.addEventListener('touchcancel', finishPull, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindPulldown);
  } else {
    bindPulldown();
  }
})();


/* ================== Google Material 3 物理水波纹引擎 (全面升级：强力抗手势误触) ================== */
(function initGlobalRippleEngine() {
  const PRESS_GROW_MS = 450;
  const MINIMUM_PRESS_MS = 200;
  const INITIAL_ORIGIN_SCALE = 0.2;
  const PADDING = 10;
  const SOFT_EDGE_MINIMUM_SIZE = 75;
  const SOFT_EDGE_CONTAINER_RATIO = 0.35;
  const EASING_STANDARD = 'cubic-bezier(0.2, 0, 0, 1)';
  const TOUCH_GESTURE_DELAY_MS = 75; // 严格判定时间：滑动前绝对不生成波纹，杜绝闪烁

  let activeRipple = null;
  let growAnimation = null;
  let pressTimestamp = 0;
  let pendingTimer = null;
  let startX = 0, startY = 0;
  let activeBtn = null;
  let pendingPoint = null;
  let isPointerCancelled = false;

  const spawnRipple = (btn, clientX, clientY) => {
    if (!btn || !btn.isConnected || isPointerCancelled) return;
    if (window.getComputedStyle(btn).pointerEvents === 'none') return;

    // 清理旧波纹
    btn.querySelectorAll('.m3-ripple-ink').forEach(r => r.remove());

    const rect = btn.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const maxDim = Math.max(height, width);
    const softEdgeSize = Math.max(SOFT_EDGE_CONTAINER_RATIO * maxDim, SOFT_EDGE_MINIMUM_SIZE);
    const initialSize = Math.max(1, Math.floor(maxDim * INITIAL_ORIGIN_SCALE));
    const hypotenuse = Math.hypot(width, height);
    const maxRadius = hypotenuse + PADDING;
    const rippleScale = (maxRadius + softEdgeSize) / initialSize;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const startPoint = {
      x: x - initialSize / 2,
      y: y - initialSize / 2
    };
    const endPoint = {
      x: (width - initialSize) / 2,
      y: (height - initialSize) / 2
    };

    const ripple = document.createElement('span');
    ripple.className = 'm3-ripple-ink';
    ripple.style.width = initialSize + 'px';
    ripple.style.height = initialSize + 'px';

    btn.appendChild(ripple);
    activeRipple = ripple;
    pressTimestamp = Date.now();

    // 淡入：按压态 105ms 线性淡入
    requestAnimationFrame(() => {
      if (ripple.parentNode) ripple.classList.add('is-pressed');
    });

    // 运行官方原版展开动画
    if (typeof ripple.animate === 'function') {
      growAnimation = ripple.animate({
        transform: [
          `translate(${startPoint.x}px, ${startPoint.y}px) scale(1)`,
          `translate(${endPoint.x}px, ${endPoint.y}px) scale(${rippleScale})`
        ]
      }, {
        duration: PRESS_GROW_MS,
        easing: EASING_STANDARD,
        fill: 'forwards'
      });
    }
  };

  const cancelPending = () => {
    isPointerCancelled = true;
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    if (activeRipple) {
      const r = activeRipple;
      activeRipple = null;
      // 滑动手势触发时：立即彻底清除 DOM，绝不产生视觉残影
      if (r.parentNode) r.remove();
    }
    activeBtn = null;
    pendingPoint = null;
  };

  const RIPPLE_SELECTOR = '.ripple-btn, .group-menu-item, .cap-switch-row, .settings-item-row, .song-row, .discover-card-row, .library-album-pill, .voice-modal-btn, .modern-pill-btn, .icon-btn, .nav-btn, .search-back-btn, .more-dots-btn, .song-action-btn, .circle-btn, .color-option-row, .popup-menu-item, .modal-action-btn, .drawer-row, .add-clean-row, .choose-item-row, .choose-capsule-btn';

  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.target.closest('.multi-select-check-box')) return;
    if (e.target.closest('.fav-btn, .discover-card-fav')) return;

    const btn = e.target.closest(RIPPLE_SELECTOR);
    if (!btn) return;
    if (btn.classList.contains('no-ripple') || btn.classList.contains('fav-btn') || btn.classList.contains('discover-card-fav')) return;
    if (window.getComputedStyle(btn).pointerEvents === 'none') return;

    cancelPending();
    isPointerCancelled = false;

    startX = e.clientX;
    startY = e.clientY;
    activeBtn = btn;
    pendingPoint = { x: e.clientX, y: e.clientY };

    // 触控防误触机制：若为触摸或手写笔，延迟 75ms 确认是否为手势滑动
    if (e.pointerType === 'mouse') {
      spawnRipple(btn, e.clientX, e.clientY);
    } else {
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        if (activeBtn && pendingPoint && !isPointerCancelled) {
          spawnRipple(activeBtn, pendingPoint.x, pendingPoint.y);
        }
      }, TOUCH_GESTURE_DELAY_MS);
    }
  }, { passive: true, capture: true });

  document.addEventListener('pointermove', (e) => {
    if (!activeBtn && !pendingTimer && !activeRipple) return;
    // 灵敏滑动判定：位移超过 5px 立即判定为手势滑动，取消波纹生成并清理
    const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
    if (dist > 5) {
      cancelPending();
    }
  }, { passive: true, capture: true });

  window.addEventListener('scroll', () => {
    cancelPending();
  }, { passive: true, capture: true });

  const finishRipple = () => {
    if (isPointerCancelled) {
      cancelPending();
      return;
    }

    // 快速轻触 (tap)：如果在 75ms 内抬手，立即生成饱满波纹，零感知延迟
    if (pendingTimer && activeBtn && pendingPoint) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
      spawnRipple(activeBtn, pendingPoint.x, pendingPoint.y);
    }

    activeBtn = null;
    pendingPoint = null;

    if (!activeRipple) return;
    const ripple = activeRipple;
    activeRipple = null;

    const elapsed = Date.now() - pressTimestamp;
    const remainingPressTime = Math.max(0, MINIMUM_PRESS_MS - elapsed);

    setTimeout(() => {
      ripple.classList.remove('is-pressed');
      setTimeout(() => {
        if (ripple.parentNode) ripple.remove();
      }, 380);
    }, remainingPressTime);
  };

  document.addEventListener('pointerup', finishRipple, { passive: true });
  document.addEventListener('pointercancel', cancelPending, { passive: true });
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.ripple-btn')) e.preventDefault();
  });

  // 点击开关行任意区域（文字/图标/留白）自动联动触发其开关切换，手感顺滑自然 (1:1 复刻自 hhznx)
  document.addEventListener('click', (e) => {
    const row = e.target.closest('.cap-switch-row, .dual-switch-row');
    if (!row) return;
    if (e.target.closest('.blue-toggle-switch, .sheet-toggle-switch')) return;
    if (row.getAttribute('onclick')) return;

    const sw = row.querySelector('.blue-toggle-switch, .sheet-toggle-switch');
    if (sw) {
      sw.click();
    }
  });
})();

