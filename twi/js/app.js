/**
 * Twitter Simulator - 主应用逻辑
 * 
 * 功能：
 * - 渲染 Timeline 和推文详情
 * - 点击编辑任意元素
 * - 头像/图片点击更换
 * - 数据持久化到 IndexedDB（locale/sort 仍在 localStorage）
 */

// ========================================
// 全局状态
// ========================================

let currentView = 'timeline';
let currentTweetId = null;
let editingElement = null;
let editingField = null;
let editingTweetId = null;
let editingReplyId = null;
let timelineSearchQuery = '';
let imageEditMode = 'avatar';
let selectedImageFiles = [];
let cropPreviewImageSrc = '';
let cropPreviewImage = null;
let editingAccountId = null;
let cropBoxState = { x: 0, y: 0, width: 0, height: 0 };
let cropPointerState = null;
const TIMELINE_SORT_KEY = 'tukuyomi-timeline-sort';
const COMMUNITY_FEATURES_ENABLED = false;
let composeDraftMediaIds = [];
const replyDraftMap = new Map();
let storyModalTextCache = null;
let storyModalLoadPromise = null;

// ========================================
// Mobile overlays (right drawer + tools)
// ========================================

function setSidebarToolsOpen(open) {
    const sidebar = document.querySelector('.left-sidebar');
    if (!sidebar) return;
    const next = !!open;
    sidebar.classList.toggle('tools-open', next);
    document.body.classList.toggle('sidebar-tools-open', next);
}

function closeSidebarTools() {
    setSidebarToolsOpen(false);
}

function toggleSidebarTools() {
    const sidebar = document.querySelector('.left-sidebar');
    const next = !(sidebar && sidebar.classList.contains('tools-open'));
    setSidebarToolsOpen(next);
    if (next) closeRightSidebarDrawer();
}

function isRightSidebarDrawerEnabled() {
    try {
        return window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
    } catch {
        return false;
    }
}

function setRightSidebarDrawerOpen(open) {
    if (!isRightSidebarDrawerEnabled()) {
        document.body.classList.remove('mobile-drawer-open');
        return;
    }
    document.body.classList.toggle('mobile-drawer-open', !!open);
}

function closeRightSidebarDrawer() {
    setRightSidebarDrawerOpen(false);
}

function toggleRightSidebarDrawer() {
    const next = !document.body.classList.contains('mobile-drawer-open');
    setRightSidebarDrawerOpen(next);
    if (next) closeSidebarTools();
}



// ========================================
// 初始化
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    // 初始化 IndexedDB
    await ImageStore.init();
    if (window.ensureAppStateReady) {
        await window.ensureAppStateReady();
    }

    // 迁移旧数据（如果有 base64 图片在 localStorage 中）
    await migrateOldImages();

    const searchInput = document.querySelector('.search-box input');
    if (searchInput) searchInput.value = '';
    timelineSearchQuery = '';

    const ui = getUIState();
    const accounts = getAccounts();
    const fallbackViewerId = ui.defaultAuthorId || accounts[0]?.id || null;
    const fallbackComposeId = ui.composeAuthorId || fallbackViewerId;
    if (fallbackViewerId && ui.defaultAuthorId !== fallbackViewerId) {
        setDefaultAuthorId(fallbackViewerId);
    }
    if (fallbackComposeId && ui.composeAuthorId !== fallbackComposeId) {
        setComposeAuthorId(fallbackComposeId);
    }

    setupEventListeners();
    renderTimeline();
});

// ========================================
// IndexedDB 图片辅助函数
// ========================================

/**
 * 检查字符串是否是 IndexedDB 图片 ID
 */
function isIndexedDBImageId(str) {
    return str && str.startsWith('img_');
}

/**
 * 异步加载图片元素
 * 对于 IndexedDB ID，从数据库加载；对于其他 URL，直接使用
 */
async function loadImageAsync(imgElement, imageUrl) {
    if (!imageUrl) return;

    if (isIndexedDBImageId(imageUrl)) {
        try {
            const imageData = await ImageStore.getImage(imageUrl);
            if (imageData) {
                imgElement.src = imageData;
            } else {
                console.warn('Image not found in IndexedDB:', imageUrl);
            }
        } catch (e) {
            console.error('Failed to load image from IndexedDB:', e);
        }
    } else {
        imgElement.src = imageUrl;
    }
}

/**
 * 迁移旧的 base64 图片到 IndexedDB
 */
async function migrateOldImages() {
    let hasChanges = false;

    for (const tweet of currentData) {
        // 迁移头像
        if (tweet.user.avatar && tweet.user.avatar.startsWith('data:image')) {
            try {
                const id = await ImageStore.saveImage(tweet.user.avatar);
                tweet.user.avatar = id;
                hasChanges = true;
                console.log(`Migrated avatar for tweet ${tweet.id}`);
            } catch (e) {
                console.error('Failed to migrate avatar:', e);
            }
        }

        // 迁移媒体图片（兼容单图/多图）
        if (tweet.media) {
            const mediaImages = getTweetMediaImages(tweet);
            if (mediaImages.length) {
                const migratedImages = [];
                for (const imageRef of mediaImages) {
                    if (typeof imageRef === 'string' && imageRef.startsWith('data:image')) {
                        try {
                            const id = await ImageStore.saveImage(imageRef);
                            migratedImages.push(id);
                            hasChanges = true;
                        } catch (e) {
                            console.error('Failed to migrate media:', e);
                            migratedImages.push(imageRef);
                        }
                    } else {
                        migratedImages.push(imageRef);
                    }
                }
                setTweetMediaImages(tweet, migratedImages);
                if (migratedImages.length) {
                    console.log(`Migrated media for tweet ${tweet.id}`);
                }
            }
        }

        // 迁移回复中的头像
        if (tweet.replies) {
            const allReplies = [];
            walkReplyTree(tweet.replies, r => allReplies.push(r));
            for (const reply of allReplies) {
                if (reply.user.avatar && reply.user.avatar.startsWith('data:image')) {
                    try {
                        const id = await ImageStore.saveImage(reply.user.avatar);
                        reply.user.avatar = id;
                        hasChanges = true;
                        console.log(`Migrated reply avatar for reply ${reply.id}`);
                    } catch (e) {
                        console.error('Failed to migrate reply avatar:', e);
                    }
                }
            }
        }
    }

    if (hasChanges) {
        saveData(currentData);
        console.log('Migration complete - data saved');
    }
}

// ========================================
// 视图切换
// ========================================

function showTimeline() {
    document.getElementById('timeline-view').classList.add('active');
    document.getElementById('tweet-detail-view').classList.remove('active');
    currentView = 'timeline';
    currentTweetId = null;
}

function showTweetDetail(tweetId) {
    document.getElementById('timeline-view').classList.remove('active');
    document.getElementById('tweet-detail-view').classList.add('active');
    currentView = 'detail';
    currentTweetId = tweetId;
    renderTweetDetail(tweetId);
}

// ========================================
// 渲染 Timeline
// ========================================

function renderTimeline() {
    if (!Array.isArray(currentData)) {
        currentData = loadData();
    }
    if (Array.isArray(currentData) && currentData.length === 0) {
        currentData = loadData();
        if (currentData.length === 0 && Array.isArray(tweetsData)) {
            currentData = JSON.parse(JSON.stringify(tweetsData));
            saveData(currentData);
        }
    }

    const container = document.getElementById('timeline-posts');
    container.innerHTML = '';

    const q = (timelineSearchQuery || '').trim().toLowerCase();
    const ui = getUIState();
    let visibleTweets = !q ? [...currentData] : currentData.filter(tweet => {
        const hay = [
            tweet.user?.name || '',
            tweet.user?.handle || '',
            tweet.content || '',
            tweet.translation?.text || '',
            tweet.time || ''
        ].join(' ').toLowerCase();
        return hay.includes(q);
    });

    if (ui?.guideTweetHidden) {
        visibleTweets = visibleTweets.filter(tweet => !tweet.isGuide);
    }

    visibleTweets.sort((a, b) => {
        const pinDiff = (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
        if (pinDiff !== 0) return pinDiff;
        if (getTimelineSortMode() === 'date') {
            return parseTweetTimeToTimestamp(b.time) - parseTweetTimeToTimestamp(a.time);
        }
        return 0;
    });

    // 渲染推文列表
    visibleTweets.forEach(tweet => {
        const card = createTweetCard(tweet, false);
        container.appendChild(card);
    });

    // 异步加载 IndexedDB 中的图片
    loadAsyncImages(container);
}

/**
 * 异步加载容器中所有带有 data-image-id 的图片
 */
async function loadAsyncImages(container) {
    const asyncImages = container.querySelectorAll('.async-image[data-image-id]');

    for (const img of asyncImages) {
        const imageId = img.dataset.imageId;
        if (imageId) {
            try {
                const imageData = await ImageStore.getImage(imageId);
                if (imageData) {
                    img.src = imageData;
                } else {
                    console.warn('Image not found in IndexedDB:', imageId);
                }
            } catch (e) {
                console.error('Failed to load image from IndexedDB:', e);
            }
        }
    }
}


// ========================================
// 创建推文卡片
// ========================================

// 格式化文本（处理 hashtags 等）
function formatText(text) {
    if (!text) return '';
    let html = text;
    html = html.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a class="tweet-link" href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    html = html.replace(/(^|\s)(#[\w\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ff]+)/g, '$1<span class="hashtag">$2</span>');
    return html;
}

function ti(key, vars = {}) {
    let text = t(key);
    Object.entries(vars).forEach(([name, value]) => {
        text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value ?? ''));
    });
    return text;
}

function getDefaultTranslationSource() {
    return getLocale() === 'ja-JP' ? '中国語' : '中文';
}

function getTukuyomiBrandHtml() {
    return '<span class="tukuyomi-brand"><span class="t">t</span><span class="u">u</span><span class="k">k</span><span class="u2">u</span><span class="y">y</span><span class="o">o</span><span class="m">m</span><span class="i">i</span></span>';
}

function buildTranslationHeaderHtml(tweetId, source) {
    const brand = getTukuyomiBrandHtml();
    const sourceLabel = source || getDefaultTranslationSource();
    if (getLocale() === 'ja-JP') {
        return `${brand} が<span class="editable" data-tweet-id="${tweetId}" data-field="translationSource">${sourceLabel}</span>から翻訳`;
    }
    return `由 ${brand} 翻译自<span class="editable" data-tweet-id="${tweetId}" data-field="translationSource">${sourceLabel}</span>`;
}

function stripCardEditing(card) {
    if (!card) return;
    card.querySelector('.delete-btn')?.remove();
    card.querySelectorAll('.translation-editor').forEach(node => node.remove());
    card.querySelectorAll('.media-remove-btn').forEach(node => node.remove());
    card.querySelectorAll('.editable, .editable-number, .editable-avatar, .editable-media').forEach(node => {
        node.classList.remove('editable', 'editable-number', 'editable-avatar', 'editable-media');
    });
}

function isGuideTweetById(tweetId) {
    if (!Number.isFinite(tweetId)) return false;
    return !!currentData.find(tw => tw.id === tweetId)?.isGuide;
}

function getTweetIdFromEditableTarget(target) {
    if (!target) return NaN;
    const direct = target.dataset?.tweetId;
    if (direct) return parseInt(direct, 10);
    const host = target.closest?.('[data-tweet-id]');
    if (!host) return NaN;
    return parseInt(host.dataset.tweetId, 10);
}

function createTweetCard(tweet, isDetail = false) {
    const card = document.createElement('div');
    card.className = isDetail ? 'tweet-detail' : 'tweet-card';
    card.dataset.tweetId = tweet.id;

    if (!isDetail) {
        card.onclick = (e) => {
            // 如果点击的是可编辑元素，不跳转
            if (e.target.classList.contains('editable') ||
                e.target.classList.contains('editable-avatar') ||
                e.target.closest('.editable-avatar') ||
                e.target.closest('.tweet-media') ||
                e.target.closest('.action-btn') ||
                e.target.closest('.delete-btn') ||
                e.target.closest('.guide-hide-btn') ||
                e.target.closest('a') ||
                e.target.closest('.translation-editor')) {
                return;
            }
            showTweetDetail(tweet.id);
        };
    }

    // 处理头像 - 使用 data 属性存储 IndexedDB ID 以便异步加载
    let avatarHtml;
    if (tweet.user.avatar) {
        if (isIndexedDBImageId(tweet.user.avatar)) {
            // IndexedDB ID - 先放空图片，后续异步加载
            avatarHtml = `<img data-image-id="${tweet.user.avatar}" alt="${tweet.user.name}" class="async-image">`;
        } else {
            // 普通 URL（包括 base64 或外部链接）
            avatarHtml = `<img src="${tweet.user.avatar}" alt="${tweet.user.name}">`;
        }
    } else {
        avatarHtml = `<div class="avatar-placeholder">${tweet.user.name.charAt(0)}</div>`;
    }

    const verifiedBadge = tweet.user.verified
        ? `<span class="verified-badge"><svg viewBox="0 0 22 22"><path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/></svg></span>`
        : '';

    // 处理媒体图片 - 支持单图/多图
    let mediaHtml = '';
    const mediaImages = getTweetMediaImages(tweet);
    if (tweet.media && tweet.media.type === 'video' && tweet.media.url) {
        mediaHtml = `
            <div class="tweet-media editable-media" data-tweet-id="${tweet.id}" data-field="media">
                <video src="${tweet.media.url}" loop muted autoplay playsinline></video>
                ${tweet.media.duration ? `<span class="video-duration">${tweet.media.duration}</span>` : ''}
            </div>
        `;
    } else if (mediaImages.length) {
        const mediaItemsHtml = mediaImages.map((imageRef, index) => {
            const imgHtml = isIndexedDBImageId(imageRef)
                ? `<img data-image-id="${imageRef}" alt="Tweet media ${index + 1}" class="async-image">`
                : `<img src="${imageRef}" alt="Tweet media ${index + 1}">`;
            return `
                <div class="tweet-media-item">
                    ${imgHtml}
                    ${appMode !== 'view'
                    ? `<button class="media-remove-btn editor-only" data-tweet-id="${tweet.id}" data-media-index="${index}" title="${t('removeMediaItem')}">×</button>`
                    : ''}
                </div>
            `;
        }).join('');

        mediaHtml = `
            <div class="tweet-media editable-media ${getMediaLayoutClass(mediaImages.length)}" data-tweet-id="${tweet.id}" data-field="media">
                <div class="tweet-media-grid">
                    ${mediaItemsHtml}
                </div>
            </div>
        `;
    }


    // 翻译区域HTML
    let translationHtml = '';
    if (tweet.translation && tweet.translation.visible !== false) {
        translationHtml = `
            <div class="tweet-translation">
                <div class="tweet-translation-header">
                    <svg class="translate-icon" viewBox="0 0 24 24"><path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>
                    <span>${buildTranslationHeaderHtml(tweet.id, tweet.translation.source)}</span>
                </div>
                <div class="tweet-translation-text editable" data-tweet-id="${tweet.id}" data-field="translationText">${formatText(tweet.translation.text)}</div>
            </div>
        `;
    }

    let translationEditorHtml = '';
    if (appMode !== 'view') {
        const visible = tweet.translation ? tweet.translation.visible !== false : false;
        translationEditorHtml = `
            <div class="translation-editor editor-only">
                <button class="inline-mini-btn subtle-btn translation-toggle-btn ${visible ? 'active' : ''}" data-tweet-id="${tweet.id}" data-visible="${visible ? '1' : '0'}">${visible ? t('hideTranslation') : t('showTranslation')}</button>
                <button class="inline-mini-btn subtle-btn media-upload-btn" data-tweet-id="${tweet.id}">${mediaImages.length ? t('addMedia') : t('uploadMedia')}</button>
            </div>
        `;
    }

    if (isDetail) {
        // Ensure stats exist for detail meta rendering.
        tweet.stats = tweet.stats || { comments: 0, retweets: 0, likes: 0, bookmarks: 0 };
        if (tweet.stats.bookmarks === undefined) tweet.stats.bookmarks = 0;
        if (tweet.stats.comments === undefined) tweet.stats.comments = 0;
        if (tweet.stats.retweets === undefined) tweet.stats.retweets = 0;
        if (tweet.stats.likes === undefined) tweet.stats.likes = 0;

        const sortMode = getTimelineSortMode();
        const sortLabel = sortMode === 'date' ? t('sortByDate') : t('sortByPost');
        card.innerHTML = `
            <div class="tweet-header">
                <div class="tweet-avatar editable-avatar" data-tweet-id="${tweet.id}" data-field="avatar">
                    ${avatarHtml}
                </div>
                <div class="tweet-main">
                    <div class="tweet-user-info">
                        <div class="tweet-user-name-row">
                            <span class="tweet-user-name editable" data-tweet-id="${tweet.id}" data-field="userName">${tweet.user.name}</span>
                            ${verifiedBadge}
                        </div>
                        <span class="tweet-user-handle editable" data-tweet-id="${tweet.id}" data-field="userHandle">${tweet.user.handle}</span>
                    </div>
                </div>
                <button class="tweet-more-btn">
                    <svg viewBox="0 0 24 24"><path d="M3 12c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm9 2c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm7 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/></svg>
                </button>
            </div>
            <div class="tweet-content editable" data-tweet-id="${tweet.id}" data-field="content">${formatText(tweet.content || '点击添加内容...')}</div>
            ${translationEditorHtml}
            ${translationHtml}
            ${mediaHtml}
            <div class="tweet-detail-time">
                <span class="editable" data-tweet-id="${tweet.id}" data-field="time">${formatTweetTimeForDisplay(tweet.time)}</span> · 
                <span class="editable-number" data-tweet-id="${tweet.id}" data-field="views">${tweet.views}</span> 查看
            </div>
            <div class="tweet-actions">
                ${createActionButtons(tweet, true)}
            </div>
            <div class="related-section tweet-related-row" data-tweet-id="${tweet.id}">
                <div class="related-sort">
                    <span class="related-label">${t('related')}</span>
                    <button class="related-sort-arrow" type="button" data-action="toggle-related-sort-menu" aria-haspopup="menu" aria-expanded="false" title="${sortLabel}">∨</button>
                    <div class="related-sort-menu" role="menu" hidden>
                        <button type="button" class="related-sort-option ${sortMode === 'date' ? 'active' : ''}" role="menuitemradio" aria-checked="${sortMode === 'date' ? 'true' : 'false'}" data-action="set-related-sort" data-sort="date">${t('sortByDate')}</button>
                        <button type="button" class="related-sort-option ${sortMode !== 'date' ? 'active' : ''}" role="menuitemradio" aria-checked="${sortMode !== 'date' ? 'true' : 'false'}" data-action="set-related-sort" data-sort="post">${t('sortByPost')}</button>
                    </div>
                </div>
                <button class="view-quotes-btn" type="button" data-action="view-quotes">${t('viewQuotes')} ›</button>
            </div>
        `;
    } else {
        const pinLabelHtml = tweet.isPinned
            ? `<div class="tweet-pin-label">${getLocale() === 'ja-JP' ? '固定表示' : '置顶推文'}</div>`
            : '';
        const guideHideBtnHtml = tweet.isGuide
            ? `<button class="guide-hide-btn" type="button" data-tweet-id="${tweet.id}">${getLocale() === 'ja-JP' ? 'この案内を隠す' : '隐藏本教程'}</button>`
            : '';
        const tweetMetaRowHtml = (pinLabelHtml || guideHideBtnHtml)
            ? `<div class="tweet-meta-row">${pinLabelHtml}${guideHideBtnHtml}</div>`
            : '';
        card.innerHTML = `
            <button class="delete-btn" onclick="deleteTweet(${tweet.id}); event.stopPropagation();">×</button>
            ${tweetMetaRowHtml}
            <div class="tweet-header">
                <div class="tweet-avatar editable-avatar" data-tweet-id="${tweet.id}" data-field="avatar">
                    ${avatarHtml}
                </div>
                <div class="tweet-main">
                    <div class="tweet-user-info">
                        <span class="tweet-user-name editable" data-tweet-id="${tweet.id}" data-field="userName">${tweet.user.name}</span>
                        ${verifiedBadge}
                        <span class="tweet-user-handle editable" data-tweet-id="${tweet.id}" data-field="userHandle">${tweet.user.handle}</span>
                        <span class="tweet-time">· <span class="editable" data-tweet-id="${tweet.id}" data-field="time">${formatTweetTimeForDisplay(tweet.time)}</span></span>
                    </div>
                    <div class="tweet-content editable" data-tweet-id="${tweet.id}" data-field="content">${formatText(tweet.content || '点击添加内容...')}</div>
                    ${translationEditorHtml}
                    ${translationHtml}
                    ${mediaHtml}
                    <div class="tweet-actions">
                        ${createActionButtons(tweet, false)}
                    </div>
                </div>
            </div>
        `;
    }

    if (tweet.isGuide) {
        stripCardEditing(card);
    }

    return card;
}

// ========================================
// 创建操作按钮
// ========================================

function createActionButtons(tweet, isDetail = false) {
    const liked = !!tweet.userLiked;
    const likeIconPath = liked
        ? 'M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91z'
        : 'M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z';
    return `
        <button class="action-btn comment">
            <svg viewBox="0 0 24 24"><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"/></svg>
            <span class="editable-number" data-tweet-id="${tweet.id}" data-field="comments">${tweet.stats.comments}</span>
        </button>
        <button class="action-btn retweet">
            <svg viewBox="0 0 24 24"><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/></svg>
            <span class="editable-number" data-tweet-id="${tweet.id}" data-field="retweets">${formatNumber(tweet.stats.retweets)}</span>
        </button>
        <button class="action-btn like ${liked ? 'liked' : ''}" data-like-target="tweet" data-tweet-id="${tweet.id}">
            <svg viewBox="0 0 24 24"><path d="${likeIconPath}"/></svg>
            <span class="editable-number" data-tweet-id="${tweet.id}" data-field="likes">${formatNumber(tweet.stats.likes)}</span>
        </button>
        ${isDetail ? '' : `
        <button class="action-btn views">
            <svg viewBox="0 0 24 24"><path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"/></svg>
            <span class="editable-number" data-tweet-id="${tweet.id}" data-field="views">${tweet.views}</span>
        </button>
        `}
        <button class="action-btn bookmark">
            <svg viewBox="0 0 24 24"><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"/></svg>
        </button>
        <button class="action-btn share">
            <svg viewBox="0 0 24 24"><path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"/></svg>
        </button>
    `;
}

function createReplyThread(reply, tweetId) {
    const thread = document.createElement('div');
    thread.className = 'reply-thread';
    thread.dataset.tweetId = tweetId;
    thread.dataset.replyId = reply.id;

    const parentCard = createReplyCard(reply, tweetId);
    parentCard.classList.add('reply-parent-card');
    thread.appendChild(parentCard);

    const nestedCompose = document.createElement('div');
    nestedCompose.className = 'nested-reply-compose editor-only';
    nestedCompose.dataset.tweetId = tweetId;
    nestedCompose.dataset.parentReplyId = reply.id;
    nestedCompose.innerHTML = `
        <div class="tweet-avatar editable-avatar" data-field="reply-compose-avatar">
            <div class="avatar-placeholder">我</div>
        </div>
        <div class="nested-reply-tools">
            <input type="text" class="nested-reply-input" data-tweet-id="${tweetId}" data-parent-reply-id="${reply.id}" placeholder="${getLocale() === 'ja-JP' ? '返信を投稿' : '发布你的回复'}">
            <div class="reply-compose-controls editor-only" data-tweet-id="${tweetId}" data-parent-reply-id="${reply.id}">
                <button type="button" class="inline-mini-btn subtle-btn reply-media-upload-btn" data-tweet-id="${tweetId}" data-parent-reply-id="${reply.id}">${t('uploadMedia')}</button>
                <div class="compose-time-fields reply-time-fields" title="${t('postTime')}">
                    <label class="compose-time-piece"><input class="compose-time-part year" data-part="year" inputmode="numeric" maxlength="4"><span>年</span></label>
                    <label class="compose-time-piece"><input class="compose-time-part" data-part="month" inputmode="numeric" maxlength="2"><span>月</span></label>
                    <label class="compose-time-piece"><input class="compose-time-part" data-part="day" inputmode="numeric" maxlength="2"><span>日</span></label>
                    <label class="compose-time-piece"><input class="compose-time-part" data-part="hour" inputmode="numeric" maxlength="2"><span>时</span></label>
                    <label class="compose-time-piece"><input class="compose-time-part" data-part="minute" inputmode="numeric" maxlength="2"><span>分</span></label>
                </div>
            </div>
            <div class="reply-media-preview" data-tweet-id="${tweetId}" data-parent-reply-id="${reply.id}" style="display:none"></div>
        </div>
        <button class="reply-btn nested-reply-btn" type="button" data-tweet-id="${tweetId}" data-parent-reply-id="${reply.id}" disabled>回复</button>
    `;
    thread.appendChild(nestedCompose);

    const nestedInput = nestedCompose.querySelector('.nested-reply-input');
    const nestedBtn = nestedCompose.querySelector('.nested-reply-btn');
    const updateNestedState = () => {
        if (!nestedInput || !nestedBtn) return;
        const hasText = (nestedInput.value || '').trim().length > 0;
        const hasMedia = getReplyDraft(tweetId, reply.id).mediaIds.length > 0;
        const canPost = appMode !== 'view' && (hasText || hasMedia);
        nestedBtn.disabled = !canPost;
        nestedBtn.classList.toggle('active', canPost);
        thread.classList.toggle('has-nested', canPost || (reply.replies && reply.replies.length > 0) || nestedCompose.classList.contains('active'));
    };
    nestedInput?.addEventListener('input', updateNestedState);
    nestedCompose.querySelectorAll('.compose-time-part').forEach(input => {
        input.addEventListener('input', () => {
            input.value = (input.value || '').replace(/\D/g, '');
        });
    });
    updateNestedState();
    renderReplyMediaPreview(tweetId, reply.id);

    const nestedReplies = document.createElement('div');
    nestedReplies.className = 'nested-replies';
    nestedReplies.dataset.parentReplyId = reply.id;

    const children = Array.isArray(reply.replies) ? reply.replies : [];
    if (children.length) {
        const items = [...children];
        if (getTimelineSortMode() === 'date') {
            items.sort((a, b) => parseTweetTimeToTimestamp(b.time) - parseTweetTimeToTimestamp(a.time));
        }
        items.forEach(child => {
            const childCard = createReplyCard(child, tweetId);
            childCard.classList.add('nested-reply-card');
            nestedReplies.appendChild(childCard);
        });
        thread.classList.add('has-nested');
    }
    thread.appendChild(nestedReplies);

    return thread;
}

// ========================================
// 渲染推文详情
// ========================================

function renderTweetDetail(tweetId) {
    const tweet = currentData.find(t => t.id === tweetId);
    if (!tweet) return;

    const container = document.getElementById('tweet-detail-content');
    container.innerHTML = '';

    // 主推文
    const tweetCard = createTweetCard(tweet, true);
    container.appendChild(tweetCard);

    // 回复输入区
    const replyInput = document.createElement('div');
    replyInput.className = 'reply-input-section';
    replyInput.innerHTML = `
        <div class="tweet-avatar editable-avatar" data-field="reply-compose-avatar">
            <div class="avatar-placeholder">我</div>
        </div>
        <div class="reply-inline-tools">
            <select class="reply-account-select editor-only" data-tweet-id="${tweetId}">
                ${buildInlineAccountOptions(getComposeAccountId())}
            </select>
            <input type="text" class="reply-input" data-tweet-id="${tweetId}" placeholder="${getLocale() === 'ja-JP' ? '返信を投稿' : '发布你的回复'}">
            <div class="reply-compose-controls editor-only" data-tweet-id="${tweetId}">
                <button type="button" class="inline-mini-btn subtle-btn reply-media-upload-btn" data-tweet-id="${tweetId}">${t('uploadMedia')}</button>
                <div class="compose-time-fields reply-time-fields" title="${t('postTime')}">
                    <label class="compose-time-piece"><input class="compose-time-part year" data-part="year" inputmode="numeric" maxlength="4"><span>年</span></label>
                    <label class="compose-time-piece"><input class="compose-time-part" data-part="month" inputmode="numeric" maxlength="2"><span>月</span></label>
                    <label class="compose-time-piece"><input class="compose-time-part" data-part="day" inputmode="numeric" maxlength="2"><span>日</span></label>
                    <label class="compose-time-piece"><input class="compose-time-part" data-part="hour" inputmode="numeric" maxlength="2"><span>时</span></label>
                    <label class="compose-time-piece"><input class="compose-time-part" data-part="minute" inputmode="numeric" maxlength="2"><span>分</span></label>
                </div>
            </div>
            <div class="reply-media-preview" data-tweet-id="${tweetId}" style="display:none"></div>
        </div>
        <button class="reply-btn" data-tweet-id="${tweetId}">回复</button>
    `;
    container.appendChild(replyInput);

    const replyTextInput = replyInput.querySelector('.reply-input[data-tweet-id]');
    const replyAccountSelect = replyInput.querySelector('.reply-account-select[data-tweet-id]');
    const replySubmitBtn = replyInput.querySelector('.reply-btn[data-tweet-id]');
    const updateReplySubmitState = () => {
        if (!replyTextInput || !replySubmitBtn) return;
        const hasText = (replyTextInput.value || '').trim().length > 0;
        const hasMedia = getReplyDraft(tweetId, null).mediaIds.length > 0;
        const canPost = appMode !== 'view' && (hasText || hasMedia);
        replySubmitBtn.disabled = !canPost;
        replySubmitBtn.classList.toggle('active', canPost);
    };
    if (replyTextInput && !replyTextInput.dataset.bound) {
        replyTextInput.dataset.bound = '1';
        replyTextInput.addEventListener('input', updateReplySubmitState);
    }
    if (replyAccountSelect && !replyAccountSelect.dataset.bound) {
        replyAccountSelect.dataset.bound = '1';
        replyAccountSelect.addEventListener('change', () => {
            setComposeAuthorId(replyAccountSelect.value || null);
            renderViewerProfile();
            fillAccountSelectors();
        });
    }
    if (replySubmitBtn) replySubmitBtn.disabled = true;
    replyInput.querySelectorAll('.compose-time-part').forEach(input => {
        input.addEventListener('input', () => {
            input.value = (input.value || '').replace(/\D/g, '');
        });
    });
    updateReplySubmitState();
    renderReplyMediaPreview(tweetId);

    // 回复列表
    if (tweet.replies && tweet.replies.length > 0) {
        const repliesSection = document.createElement('div');
        repliesSection.className = 'replies-section';

        const replies = [...tweet.replies];
        if (getTimelineSortMode() === 'date') {
            replies.sort((a, b) => parseTweetTimeToTimestamp(b.time) - parseTweetTimeToTimestamp(a.time));
        }

        replies.forEach(reply => {
            const thread = createReplyThread(reply, tweetId);
            repliesSection.appendChild(thread);
        });

        container.appendChild(repliesSection);
    }

    // 异步加载 IndexedDB 中的图片
    loadAsyncImages(container);
}

// ========================================
// 创建回复卡片
// ========================================

function createReplyCard(reply, tweetId) {
    const card = document.createElement('div');
    card.className = 'reply-card';
    card.dataset.replyId = reply.id;

    // 处理头像 - 支持异步加载 IndexedDB 图片
    let avatarHtml;
    if (reply.user.avatar) {
        if (isIndexedDBImageId(reply.user.avatar)) {
            avatarHtml = `<img data-image-id="${reply.user.avatar}" alt="${reply.user.name}" class="async-image">`;
        } else {
            avatarHtml = `<img src="${reply.user.avatar}" alt="${reply.user.name}">`;
        }
    } else {
        avatarHtml = `<div class="avatar-placeholder small">${reply.user.name.charAt(0)}</div>`;
    }

    const verifiedBadge = reply.user.verified
        ? `<span class="verified-badge"><svg viewBox="0 0 22 22"><path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/></svg></span>`
        : '';

    // 确保 reply.stats 存在
    if (!reply.stats) {
        reply.stats = { comments: 0, retweets: 0, likes: 0, views: 0 };
    }
    if (reply.stats.views === undefined) {
        reply.stats.views = 0;
    }
    const liked = !!reply.userLiked;
    const likeIconPath = liked
        ? 'M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91z'
        : 'M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z';

    // 翻译区域HTML
    let translationHtml = '';
    if (reply.translation && reply.translation.visible !== false) {
        translationHtml = `
            <div class="reply-translation-text editable" data-tweet-id="${tweetId}" data-reply-id="${reply.id}" data-field="translationText">${formatText(reply.translation.text)}</div>
        `;
    }

    let replyTranslationEditorHtml = '';
    if (appMode !== 'view') {
        const visible = reply.translation ? reply.translation.visible !== false : false;
        replyTranslationEditorHtml = `
            <div class="translation-editor editor-only">
                <button class="inline-mini-btn subtle-btn reply-translation-toggle-btn ${visible ? 'active' : ''}" data-tweet-id="${tweetId}" data-reply-id="${reply.id}" data-visible="${visible ? '1' : '0'}">${visible ? t('hideTranslation') : t('showTranslation')}</button>
            </div>
        `;
    }

    let mediaHtml = '';
    const mediaImages = getTweetMediaImages(reply);
    if (mediaImages.length) {
        mediaHtml = `
            <div class="tweet-media ${getMediaLayoutClass(mediaImages.length)}">
                <div class="tweet-media-grid">
                    ${mediaImages.map((imageRef, index) => `
                        <div class="tweet-media-item">
                            ${isIndexedDBImageId(imageRef)
                    ? `<img data-image-id="${imageRef}" alt="Reply media ${index + 1}" class="async-image">`
                    : `<img src="${imageRef}" alt="Reply media ${index + 1}">`}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    card.innerHTML = `
        <button class="delete-btn" onclick="deleteReply(${tweetId}, ${reply.id}); event.stopPropagation();">×</button>
        <div class="tweet-header">
            <div class="tweet-avatar editable-avatar" data-tweet-id="${tweetId}" data-reply-id="${reply.id}" data-field="avatar">
                ${avatarHtml}
            </div>
            <div class="tweet-main">
                <div class="tweet-user-info">
                    <span class="tweet-user-name editable" data-tweet-id="${tweetId}" data-reply-id="${reply.id}" data-field="userName">${reply.user.name}</span>
                    ${verifiedBadge}
                    <span class="tweet-user-handle editable" data-tweet-id="${tweetId}" data-reply-id="${reply.id}" data-field="userHandle">${reply.user.handle}</span>
                    <span class="tweet-time">· <span class="editable" data-tweet-id="${tweetId}" data-reply-id="${reply.id}" data-field="time">${formatTweetTimeForDisplay(reply.time)}</span></span>
                </div>
                <div class="tweet-content editable" data-tweet-id="${tweetId}" data-reply-id="${reply.id}" data-field="content">${formatText(reply.content)}</div>
                ${replyTranslationEditorHtml}
                ${translationHtml}
                ${mediaHtml}
                <div class="tweet-actions">
                    <button class="action-btn comment reply-thread-toggle-btn" type="button" data-action="toggle-nested-reply" data-tweet-id="${tweetId}" data-reply-id="${reply.id}">
                        <svg viewBox="0 0 24 24"><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"/></svg>
                        <span class="editable-number" data-tweet-id="${tweetId}" data-reply-id="${reply.id}" data-field="comments">${reply.stats.comments}</span>
                    </button>
                    <button class="action-btn retweet">
                        <svg viewBox="0 0 24 24"><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/></svg>
                        <span class="editable-number" data-tweet-id="${tweetId}" data-reply-id="${reply.id}" data-field="retweets">${reply.stats.retweets}</span>
                    </button>
                    <button class="action-btn like ${liked ? 'liked' : ''}" data-like-target="reply" data-tweet-id="${tweetId}" data-reply-id="${reply.id}">
                        <svg viewBox="0 0 24 24"><path d="${likeIconPath}"/></svg>
                        <span class="editable-number" data-tweet-id="${tweetId}" data-reply-id="${reply.id}" data-field="likes">${reply.stats.likes}</span>
                    </button>
                    <button class="action-btn views">
                        <svg viewBox="0 0 24 24"><path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"/></svg>
                        <span class="editable-number" data-tweet-id="${tweetId}" data-reply-id="${reply.id}" data-field="views">${reply.stats.views}</span>
                    </button>
                    <button class="action-btn bookmark">
                        <svg viewBox="0 0 24 24"><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"/></svg>
                    </button>
                    <button class="action-btn share">
                        <svg viewBox="0 0 24 24"><path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"/></svg>
                    </button>
                </div>
            </div>
        </div>
    `;

    return card;
}

// ========================================
// 事件监听器设置
// ========================================

function setupEventListeners() {
    // 点击可编辑文本
    document.addEventListener('click', async (e) => {
        if (e.target.closest('a')) {
            return;
        }
        if (e.target.closest('.media-remove-btn') || e.target.closest('.translation-editor')) {
            e.stopPropagation();
            return;
        }
        const editable = e.target.closest('.editable');
        const editableNumber = e.target.closest('.editable-number');
        const editableAvatar = e.target.closest('.editable-avatar');

        if (editable) {
            const tweetId = getTweetIdFromEditableTarget(editable);
            if (isGuideTweetById(tweetId)) return;
            e.stopPropagation();
            startTextEdit(editable);
        } else if (editableNumber) {
            const tweetId = getTweetIdFromEditableTarget(editableNumber);
            if (isGuideTweetById(tweetId)) return;
            e.stopPropagation();
            startNumberEdit(editableNumber);
        } else if (editableAvatar) {
            const tweetId = getTweetIdFromEditableTarget(editableAvatar);
            if (isGuideTweetById(tweetId)) return;
            e.stopPropagation();
            startAvatarEdit(editableAvatar);
        }
    });

    // ESC 取消编辑
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeTextModal();
            closeImageModal();
            closeStoryModal();
            closeSidebarTools();
            closeRightSidebarDrawer();
        }
    });

    // 点击模态框外部关闭
    document.getElementById('image-modal').addEventListener('click', (e) => {
        if (e.target.id === 'image-modal') {
            closeImageModal();
        }
    });

    document.getElementById('text-modal').addEventListener('click', (e) => {
        if (e.target.id === 'text-modal') {
            closeTextModal();
        }
    });

    document.getElementById('story-modal')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'story-modal') {
            closeStoryModal();
        }
    });

    const imageInput = document.getElementById('image-input');
    if (imageInput) {
        imageInput.addEventListener('change', handleImageInputChange);
    }
    setupCropBoxInteractions();

    const exploreNav = document.getElementById('nav-explore');
    if (exploreNav && !exploreNav.dataset.boundDrawer) {
        exploreNav.dataset.boundDrawer = '1';
        exploreNav.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleRightSidebarDrawer();
        });
    }

    const notificationsNav = document.getElementById('nav-notifications');
    if (notificationsNav && !notificationsNav.dataset.boundGuideRestore) {
        notificationsNav.dataset.boundGuideRestore = '1';
        notificationsNav.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.setGuideTweetHidden === 'function') {
                window.setGuideTweetHidden(false);
            }
            closeRightSidebarDrawer();
            closeSidebarTools();
            if (currentView === 'timeline') {
                renderTimeline();
            } else {
                showTimeline();
            }
        });
    }

    const rightBackdrop = document.getElementById('right-sidebar-backdrop');
    if (rightBackdrop && !rightBackdrop.dataset.boundClose) {
        rightBackdrop.dataset.boundClose = '1';
        rightBackdrop.addEventListener('click', () => closeRightSidebarDrawer());
    }

    const toolsBackdrop = document.getElementById('sidebar-tools-backdrop');
    if (toolsBackdrop && !toolsBackdrop.dataset.boundClose) {
        toolsBackdrop.dataset.boundClose = '1';
        toolsBackdrop.addEventListener('click', () => closeSidebarTools());
    }

    const searchInput = document.querySelector('.search-box input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            timelineSearchQuery = (e.target.value || '').trim();
            if (currentView === 'timeline') renderTimeline();
        });
    }

}

function getTweetMediaImages(tweet) {
    if (!tweet || !tweet.media) return [];
    if (Array.isArray(tweet.media.images)) {
        return tweet.media.images.filter(Boolean).slice(0, 4);
    }
    if (tweet.media.url) {
        return [tweet.media.url];
    }
    return [];
}

function setTweetMediaImages(tweet, images) {
    const mediaImages = (images || []).filter(Boolean).slice(0, 4);
    if (!mediaImages.length) {
        tweet.media = null;
        return;
    }
    tweet.media = {
        type: 'image',
        url: mediaImages[0],
        images: mediaImages
    };
}

function getMediaAspectRatio(imageCount) {
    return imageCount > 1 ? 1 : (16 / 9);
}

function getMediaLayoutClass(imageCount) {
    if (imageCount >= 4) return 'tweet-media-count-4';
    if (imageCount === 3) return 'tweet-media-count-3';
    if (imageCount === 2) return 'tweet-media-count-2';
    return 'tweet-media-count-1';
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('read file failed'));
        reader.readAsDataURL(file);
    });
}

async function pickImagesAndStore(maxCount = 4) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = maxCount > 1;

    const files = await new Promise((resolve) => {
        input.onchange = () => resolve(Array.from(input.files || []));
        input.click();
    });

    if (!files.length) return [];

    const selected = files.slice(0, Math.max(1, maxCount));
    const result = [];
    for (const file of selected) {
        try {
            const dataUrl = await readFileAsDataUrl(file);
            if (!dataUrl) continue;
            const id = await ImageStore.saveImage(dataUrl);
            if (id) result.push(id);
        } catch (e) {
            console.error('Failed to store selected image:', e);
        }
    }
    return result;
}

function getReplyDraftKey(tweetId, parentReplyId = null) {
    return parentReplyId ? `tweet_${tweetId}_reply_${parentReplyId}` : `tweet_${tweetId}_root`;
}

function getReplyDraft(tweetId, parentReplyId = null) {
    const key = getReplyDraftKey(tweetId, parentReplyId);
    if (!replyDraftMap.has(key)) {
        replyDraftMap.set(key, { mediaIds: [] });
    }
    return replyDraftMap.get(key);
}

function clearReplyDraft(tweetId, parentReplyId = null) {
    const key = getReplyDraftKey(tweetId, parentReplyId);
    replyDraftMap.delete(key);
}

function shouldSyncAvatarFromAccount(user) {
    return user?.avatarLinked !== false;
}

function collectTimeFromFields(container) {
    if (!container) return '';
    const pick = (part) => (container.querySelector(`.compose-time-part[data-part="${part}"]`)?.value || '').trim();
    const y = pick('year');
    const m = pick('month');
    const d = pick('day');
    const h = pick('hour');
    const min = pick('minute');
    if (!y && !m && !d && !h && !min) return '';
    if (!y || !m || !d) return '';

    const yi = Number(y);
    const mi = Number(m);
    const di = Number(d);
    if (!Number.isFinite(yi) || !Number.isFinite(mi) || !Number.isFinite(di)) return '';
    if (mi < 1 || mi > 12 || di < 1 || di > 31) return '';

    if (!h && !min) return `${yi}年${mi}月${di}日`;
    if (!h || !min) return '';

    const hi = Number(h);
    const mini = Number(min);
    if (!Number.isFinite(hi) || !Number.isFinite(mini)) return '';
    if (hi < 0 || hi > 23 || mini < 0 || mini > 59) return '';

    const ampm = hi >= 12 ? '下午' : '上午';
    const hour12 = hi % 12 === 0 ? 12 : hi % 12;
    const mm = String(mini).padStart(2, '0');
    return `${ampm} ${hour12}:${mm} · ${yi}年${mi}月${di}日`;
}

function renderComposeMediaPreview() {
    const host = document.getElementById('compose-media-preview');
    if (!host) return;

    if (!composeDraftMediaIds.length) {
        host.innerHTML = '';
        host.style.display = 'none';
        return;
    }

    host.style.display = '';
    host.innerHTML = composeDraftMediaIds.map((id, index) => `
        <div class="composer-media-chip">
            <img data-image-id="${id}" class="async-image" alt="compose media ${index + 1}">
            <button type="button" class="composer-media-remove-btn" data-media-index="${index}" title="${t('removeMediaItem')}">×</button>
        </div>
    `).join('');

    loadAsyncImages(host);
}

function renderReplyMediaPreview(tweetId, parentReplyId = null) {
    const selector = parentReplyId
        ? `.reply-media-preview[data-tweet-id="${tweetId}"][data-parent-reply-id="${parentReplyId}"]`
        : `.reply-media-preview[data-tweet-id="${tweetId}"]:not([data-parent-reply-id])`;
    const host = document.querySelector(selector);
    if (!host) return;

    const draft = getReplyDraft(tweetId, parentReplyId);
    if (!draft.mediaIds.length) {
        host.innerHTML = '';
        host.style.display = 'none';
        refreshReplySubmitState(tweetId, parentReplyId);
        return;
    }

    host.style.display = '';
    host.innerHTML = draft.mediaIds.map((id, index) => `
        <div class="composer-media-chip">
            <img data-image-id="${id}" class="async-image" alt="reply media ${index + 1}">
            <button type="button" class="composer-media-remove-btn reply-media-remove-btn" data-media-index="${index}" data-tweet-id="${tweetId}" ${parentReplyId ? `data-parent-reply-id="${parentReplyId}"` : ''} title="${t('removeMediaItem')}">×</button>
        </div>
    `).join('');

    loadAsyncImages(host);
    refreshReplySubmitState(tweetId, parentReplyId);
}

function refreshReplySubmitState(tweetId, parentReplyId = null) {
    const inputSelector = parentReplyId
        ? `.nested-reply-input[data-tweet-id="${tweetId}"][data-parent-reply-id="${parentReplyId}"]`
        : `.reply-input[data-tweet-id="${tweetId}"]`;
    const buttonSelector = parentReplyId
        ? `.nested-reply-btn[data-tweet-id="${tweetId}"][data-parent-reply-id="${parentReplyId}"]`
        : `.reply-btn[data-tweet-id="${tweetId}"]:not(.nested-reply-btn)`;

    const input = document.querySelector(inputSelector);
    const button = document.querySelector(buttonSelector);
    if (!button) return;

    const hasText = !!((input?.value || '').trim());
    const hasMedia = getReplyDraft(tweetId, parentReplyId).mediaIds.length > 0;
    const canPost = appMode !== 'view' && (hasText || hasMedia);
    button.disabled = !canPost;
    button.classList.toggle('active', canPost);
}

// ========================================
// 文本编辑
// ========================================

function startTextEdit(element) {
    editingElement = element;
    editingField = element.dataset.field;
    editingTweetId = element.dataset.tweetId ? parseInt(element.dataset.tweetId, 10) : null;
    editingReplyId = element.dataset.replyId ? parseInt(element.dataset.replyId) : null;

    const modal = document.getElementById('text-modal');
    const input = document.getElementById('text-input');

    input.value = element.textContent.trim();
    modal.classList.add('active');
    input.focus();
    input.select();
}

function closeTextModal() {
    document.getElementById('text-modal').classList.remove('active');
    editingElement = null;
    editingField = null;
    editingTweetId = null;
    editingReplyId = null;
}

function closeStoryModal() {
    document.getElementById('story-modal')?.classList.remove('active');
}

async function openStoryModal() {
    const modal = document.getElementById('story-modal');
    const body = document.getElementById('story-modal-body');
    if (!modal || !body) return;

    modal.classList.add('active');
    if (storyModalTextCache) {
        body.textContent = storyModalTextCache;
        return;
    }

    body.textContent = '加载中...';
    if (!storyModalLoadPromise) {
        storyModalLoadPromise = (async () => {
            const res = await fetch('STORY_FOR_CREATORS.md');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            storyModalTextCache = text;
            return text;
        })().catch((err) => {
            storyModalLoadPromise = null;
            throw err;
        });
    }

    try {
        body.textContent = await storyModalLoadPromise;
    } catch (err) {
        body.textContent = '加载失败，请稍后重试。\\n\\n' + String(err?.message || err);
    }
}

function confirmText() {
    const input = document.getElementById('text-input');
    const newValue = input.value.trim();

    if (editingElement && editingField) {
        if (editingTweetId === null) {
            editingElement.textContent = newValue;
            setUITextField(editingField, newValue);
        } else {
            updateData(editingTweetId, editingReplyId, editingField, newValue);
        }
    }

    closeTextModal();

    // 刷新视图
    if (currentView === 'timeline') {
        renderTimeline();
    } else {
        renderTweetDetail(currentTweetId);
    }
}

// ========================================
// 数字编辑
// ========================================

function startNumberEdit(element) {
    const field = element.dataset.field;
    const tweetId = element.dataset.tweetId ? parseInt(element.dataset.tweetId, 10) : null;
    const replyId = element.dataset.replyId ? parseInt(element.dataset.replyId) : null;

    const currentValue = element.textContent.trim();
    const newValue = prompt(ti('editFieldPrompt', { field: getFieldLabel(field) }), currentValue);

    if (newValue !== null) {
        if (tweetId === null) {
            element.textContent = newValue;
            setUITextField(field, newValue);
        } else {
            updateData(tweetId, replyId, field, newValue);
        }

        // 刷新视图
        if (currentView === 'timeline') {
            renderTimeline();
        } else {
            renderTweetDetail(currentTweetId);
        }
    }
}

// ========================================
// 头像编辑
// ========================================

function startAvatarEdit(element) {
    editingElement = element;
    editingField = element.dataset.field || 'avatar';
    editingTweetId = element.dataset.tweetId ? parseInt(element.dataset.tweetId) : null;
    editingReplyId = element.dataset.replyId ? parseInt(element.dataset.replyId) : null;
    imageEditMode = 'avatar';
    openImageModal(false);
}

function closeImageModal() {
    document.getElementById('image-modal').classList.remove('active');
    selectedImageFiles = [];
    cropPreviewImage = null;
    cropPreviewImageSrc = '';
    cropBoxState = { x: 0, y: 0, width: 0, height: 0 };
    cropPointerState = null;
    const previewImage = document.getElementById('crop-preview-image');
    if (previewImage) previewImage.removeAttribute('src');
    const stage = document.getElementById('crop-stage');
    if (stage) stage.classList.remove('has-image');
    const cropBox = document.getElementById('crop-box');
    if (cropBox) cropBox.style.display = 'none';
    editingElement = null;
    editingField = null;
    editingTweetId = null;
    editingReplyId = null;
    editingAccountId = null;
}

function openImageModal(multiple = false) {
    const modal = document.getElementById('image-modal');
    const input = document.getElementById('image-input');
    if (!modal || !input) return;

    selectedImageFiles = [];
    cropPreviewImage = null;
    cropPreviewImageSrc = '';
    cropBoxState = { x: 0, y: 0, width: 0, height: 0 };
    cropPointerState = null;
    input.value = '';
    input.multiple = !!multiple;
    modal.classList.add('active');
    const stage = document.getElementById('crop-stage');
    if (stage) stage.classList.remove('has-image');

    const syncWrap = document.getElementById('sync-account-avatar-option-wrap');
    const syncInput = document.getElementById('sync-account-avatar-option');
    const showSyncOption = editingField === 'avatar' && editingTweetId !== null && editingReplyId === null;
    if (syncWrap) syncWrap.style.display = showSyncOption ? 'flex' : 'none';
    if (syncInput) syncInput.checked = false;
}

async function loadFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function handleImageInputChange() {
    const input = document.getElementById('image-input');
    if (!input) return;
    const maxCount = imageEditMode === 'media' ? 4 : 1;
    selectedImageFiles = Array.from(input.files || []).slice(0, maxCount);
    if (!selectedImageFiles.length) {
        cropPreviewImage = null;
        cropPreviewImageSrc = '';
        const previewImage = document.getElementById('crop-preview-image');
        if (previewImage) previewImage.removeAttribute('src');
        const stage = document.getElementById('crop-stage');
        if (stage) stage.classList.remove('has-image');
        const cropBox = document.getElementById('crop-box');
        if (cropBox) cropBox.style.display = 'none';
        renderCropPreview();
        return;
    }
    cropPreviewImageSrc = await loadFileAsDataURL(selectedImageFiles[0]);
    cropPreviewImage = new Image();
    cropPreviewImage.src = cropPreviewImageSrc;
    cropPreviewImage.onload = () => {
        const previewImage = document.getElementById('crop-preview-image');
        const stage = document.getElementById('crop-stage');
        if (previewImage) previewImage.src = cropPreviewImageSrc;
        if (stage) stage.classList.add('has-image');
        initializeCropBox();
        updateCropBoxElement();
    };
    cropPreviewImage.onerror = () => {
        const previewImage = document.getElementById('crop-preview-image');
        const stage = document.getElementById('crop-stage');
        if (previewImage) previewImage.removeAttribute('src');
        if (stage) stage.classList.remove('has-image');
    };
}

function buildCroppedDataURL(img, crop, outWidth, outHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, outWidth, outHeight);
    return canvas.toDataURL('image/png');
}

function isCropRatioLocked() {
    return false;
}

function renderCropPreview() {
    updateCropBoxElement();
}

function getCropStageMetrics() {
    const stage = document.getElementById('crop-stage');
    if (!stage || !cropPreviewImage) return null;
    const stageRect = stage.getBoundingClientRect();
    if (!stageRect.width || !stageRect.height) return null;

    const imgRatio = cropPreviewImage.width / cropPreviewImage.height;
    const stageRatio = stageRect.width / stageRect.height;
    let width = stageRect.width;
    let height = stageRect.height;
    let x = 0;
    let y = 0;

    if (imgRatio > stageRatio) {
        height = width / imgRatio;
        y = (stageRect.height - height) / 2;
    } else {
        width = height * imgRatio;
        x = (stageRect.width - width) / 2;
    }

    return { stage, stageRect, imageRect: { x, y, width, height } };
}

function initializeCropBox() {
    const metrics = getCropStageMetrics();
    if (!metrics) return;
    const imageRect = metrics.imageRect;
    const lockRatio = isCropRatioLocked();
    const ratio = lockRatio ? 1 : null;
    const maxW = imageRect.width * 0.86;
    const maxH = imageRect.height * 0.86;
    let width = maxW;
    let height = lockRatio ? (width / ratio) : maxH;
    if (lockRatio && height > maxH) {
        height = maxH;
        width = height * ratio;
    }
    const x = imageRect.x + (imageRect.width - width) / 2;
    const y = imageRect.y + (imageRect.height - height) / 2;
    cropBoxState = { x, y, width, height };
}

function clampCropBox() {
    const metrics = getCropStageMetrics();
    if (!metrics) return;
    const lockRatio = isCropRatioLocked();
    const ratio = lockRatio ? 1 : null;
    const imageRect = metrics.imageRect;
    const minWidth = Math.max(40, imageRect.width * 0.14);
    const minHeight = Math.max(40, imageRect.height * 0.14);
    let width = Math.max(minWidth, Math.min(cropBoxState.width, imageRect.width));
    let height = Math.max(minHeight, Math.min(cropBoxState.height, imageRect.height));

    if (lockRatio) {
        height = width / ratio;
        if (height > imageRect.height) {
            height = imageRect.height;
            width = height * ratio;
        }
    }

    let x = cropBoxState.x;
    let y = cropBoxState.y;
    x = Math.max(imageRect.x, Math.min(x, imageRect.x + imageRect.width - width));
    y = Math.max(imageRect.y, Math.min(y, imageRect.y + imageRect.height - height));
    cropBoxState = { x, y, width, height };
}

function updateCropBoxElement() {
    const cropBox = document.getElementById('crop-box');
    if (!cropBox) return;
    if (!cropPreviewImage) {
        cropBox.style.display = 'none';
        return;
    }
    clampCropBox();
    cropBox.style.display = 'block';
    cropBox.style.left = `${cropBoxState.x}px`;
    cropBox.style.top = `${cropBoxState.y}px`;
    cropBox.style.width = `${cropBoxState.width}px`;
    cropBox.style.height = `${cropBoxState.height}px`;
}

function getNormalizedCropBox() {
    const metrics = getCropStageMetrics();
    if (!metrics || !cropPreviewImage) {
        return { x: 0, y: 0, width: 1, height: 1 };
    }
    clampCropBox();
    const ir = metrics.imageRect;
    return {
        x: (cropBoxState.x - ir.x) / ir.width,
        y: (cropBoxState.y - ir.y) / ir.height,
        width: cropBoxState.width / ir.width,
        height: cropBoxState.height / ir.height
    };
}

function getImageCropRectFromNormalized(img, normalizedCrop) {
    const nx = Math.max(0, Math.min(1, normalizedCrop.x));
    const ny = Math.max(0, Math.min(1, normalizedCrop.y));
    const nw = Math.max(0.01, Math.min(1 - nx, normalizedCrop.width));
    const nh = Math.max(0.01, Math.min(1 - ny, normalizedCrop.height));
    return {
        sx: Math.round(nx * img.width),
        sy: Math.round(ny * img.height),
        sw: Math.max(1, Math.round(nw * img.width)),
        sh: Math.max(1, Math.round(nh * img.height))
    };
}

function setupCropBoxInteractions() {
    const stage = document.getElementById('crop-stage');
    const cropBox = document.getElementById('crop-box');
    const resizeHandle = document.getElementById('crop-box-resize');
    const edgeHandles = cropBox ? Array.from(cropBox.querySelectorAll('.crop-handle[data-handle]')) : [];
    if (!stage || !cropBox || !resizeHandle || stage.dataset.bound === '1') return;
    stage.dataset.bound = '1';

    cropBox.addEventListener('pointerdown', (e) => {
        if (!cropPreviewImage) return;
        if (e.target === resizeHandle || e.target.closest('#crop-box-resize') || e.target.closest('.crop-handle')) return;
        cropPointerState = {
            type: 'move',
            startX: e.clientX,
            startY: e.clientY,
            origin: { ...cropBoxState }
        };
        cropBox.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    });

    resizeHandle.addEventListener('pointerdown', (e) => {
        if (!cropPreviewImage) return;
        cropPointerState = {
            type: 'resize-corner',
            startX: e.clientX,
            startY: e.clientY,
            origin: { ...cropBoxState }
        };
        resizeHandle.setPointerCapture?.(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
    });

    edgeHandles.forEach(handle => {
        handle.addEventListener('pointerdown', (e) => {
            if (!cropPreviewImage) return;
            const edge = handle.dataset.handle;
            if (!edge) return;
            cropPointerState = {
                type: `resize-${edge}`,
                startX: e.clientX,
                startY: e.clientY,
                origin: { ...cropBoxState }
            };
            handle.setPointerCapture?.(e.pointerId);
            e.preventDefault();
            e.stopPropagation();
        });
    });

    window.addEventListener('pointermove', (e) => {
        if (!cropPointerState || !cropPreviewImage) return;
        const dx = e.clientX - cropPointerState.startX;
        const dy = e.clientY - cropPointerState.startY;
        const lockRatio = isCropRatioLocked();
        const ratio = lockRatio ? 1 : null;
        if (cropPointerState.type === 'move') {
            cropBoxState.x = cropPointerState.origin.x + dx;
            cropBoxState.y = cropPointerState.origin.y + dy;
        } else if (cropPointerState.type === 'resize-corner') {
            const byWidth = cropPointerState.origin.width + dx;
            const byHeight = cropPointerState.origin.height + dy;
            if (lockRatio) {
                cropBoxState.width = Math.max(byWidth, byHeight * ratio);
                cropBoxState.height = cropBoxState.width / ratio;
            } else {
                cropBoxState.width = byWidth;
                cropBoxState.height = byHeight;
            }
        } else if (cropPointerState.type === 'resize-right') {
            cropBoxState.width = cropPointerState.origin.width + dx;
            if (lockRatio) cropBoxState.height = cropBoxState.width / ratio;
        } else if (cropPointerState.type === 'resize-left') {
            cropBoxState.x = cropPointerState.origin.x + dx;
            cropBoxState.width = cropPointerState.origin.width - dx;
            if (lockRatio) {
                const newHeight = cropBoxState.width / ratio;
                const centerY = cropPointerState.origin.y + cropPointerState.origin.height / 2;
                cropBoxState.height = newHeight;
                cropBoxState.y = centerY - newHeight / 2;
            }
        } else if (cropPointerState.type === 'resize-bottom') {
            cropBoxState.height = cropPointerState.origin.height + dy;
            if (lockRatio) cropBoxState.width = cropBoxState.height * ratio;
        } else if (cropPointerState.type === 'resize-top') {
            cropBoxState.y = cropPointerState.origin.y + dy;
            cropBoxState.height = cropPointerState.origin.height - dy;
            if (lockRatio) {
                const newWidth = cropBoxState.height * ratio;
                const centerX = cropPointerState.origin.x + cropPointerState.origin.width / 2;
                cropBoxState.width = newWidth;
                cropBoxState.x = centerX - newWidth / 2;
            }
        }
        updateCropBoxElement();
    });

    window.addEventListener('pointerup', () => {
        cropPointerState = null;
    });

    window.addEventListener('resize', () => {
        if (!cropPreviewImage) return;
        initializeCropBox();
        updateCropBoxElement();
    });
}

function upsertTweetMediaImages(tweetId, newImages) {
    const tweet = currentData.find(t => t.id === tweetId);
    if (!tweet) return;
    const existing = getTweetMediaImages(tweet);
    setTweetMediaImages(tweet, [...existing, ...newImages]);
    saveData(currentData);
}

async function confirmImage() {
    const input = document.getElementById('image-input');
    if (!editingElement && editingTweetId === null && !editingAccountId) {
        closeImageModal();
        return;
    }

    const files = selectedImageFiles.length ? selectedImageFiles : Array.from(input?.files || []);
    if (!files.length) {
        closeImageModal();
        return;
    }

    try {
        const normalizedCrop = getNormalizedCropBox();
        const longSideBase = imageEditMode === 'avatar' ? 768 : 1600;

        const processedImageIds = [];
        for (const file of files.slice(0, imageEditMode === 'media' ? 4 : 1)) {
            const src = await loadFileAsDataURL(file);
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = src;
            });
            const cropRect = getImageCropRectFromNormalized(img, normalizedCrop);
            const cropRatio = Math.max(0.2, cropRect.sw / Math.max(1, cropRect.sh));
            let outWidth = longSideBase;
            let outHeight = longSideBase;
            if (cropRatio >= 1) {
                outWidth = longSideBase;
                outHeight = Math.max(200, Math.round(longSideBase / cropRatio));
            } else {
                outHeight = longSideBase;
                outWidth = Math.max(200, Math.round(longSideBase * cropRatio));
            }
            const cropped = buildCroppedDataURL(img, cropRect, outWidth, outHeight);
            const imageId = await ImageStore.saveImage(cropped);
            processedImageIds.push(imageId);
        }

        if (!processedImageIds.length) {
            closeImageModal();
            return;
        }

        if (editingField === 'media') {
            upsertTweetMediaImages(editingTweetId, processedImageIds);
        } else if (editingField === 'account-avatar' && editingAccountId) {
            const account = getAccounts().find(a => a.id === editingAccountId);
            if (account) {
                const updated = upsertAccount({ ...account, avatar: processedImageIds[0] });
                applyAccountChangesToTweets(updated);
                renderAccountManager();
            }
        } else if (editingTweetId === null) {
            renderUIAvatar(editingElement, processedImageIds[0]);
            setUIAvatarField(editingField, processedImageIds[0]);
            loadAsyncImages(document);
        } else if (editingField === 'avatar' || editingField.includes('avatar')) {
            const targetTweet = currentData.find(t => t.id === editingTweetId);
            const targetUser = editingReplyId ? findReplyById(targetTweet, editingReplyId)?.user : targetTweet?.user;
            updateData(editingTweetId, editingReplyId, 'avatar', processedImageIds[0]);

            const accountId = targetUser?.accountId || null;
            const accounts = getAccounts();
            // Default tweets may not have accountId. Fall back to matching by handle.
            const account = (accountId ? accounts.find(a => a.id === accountId) : null)
                || (targetUser?.handle ? accounts.find(a => a.handle === targetUser.handle) : null);
            if (account) {
                const shouldSyncToAccount = !!document.getElementById('sync-account-avatar-option')?.checked;
                if (shouldSyncToAccount) {
                    const updated = upsertAccount({ ...account, avatar: processedImageIds[0] });
                    if (targetUser) targetUser.avatarLinked = true;
                    applyAccountChangesToTweets(updated);
                }
            }
        }

        if (currentView === 'timeline') {
            renderTimeline();
        } else {
            renderTweetDetail(currentTweetId);
        }
    } catch (error) {
        console.error('Failed to process image:', error);
        alert('图片处理失败：' + error.message);
    } finally {
        closeImageModal();
    }
}


// ========================================
// 数据更新
// ========================================

function walkReplyTree(replies, visitor) {
    if (!Array.isArray(replies)) return;
    for (const reply of replies) {
        visitor(reply);
        if (Array.isArray(reply.replies) && reply.replies.length) {
            walkReplyTree(reply.replies, visitor);
        }
    }
}

function findReplyById(tweet, replyId) {
    const walk = (list) => {
        if (!Array.isArray(list)) return null;
        for (const reply of list) {
            if (reply?.id === replyId) return reply;
            const child = walk(reply?.replies);
            if (child) return child;
        }
        return null;
    };
    return walk(tweet?.replies);
}

function removeReplyById(tweet, replyId) {
    const walk = (list) => {
        if (!Array.isArray(list)) return false;
        for (let i = 0; i < list.length; i++) {
            const reply = list[i];
            if (reply?.id === replyId) {
                list.splice(i, 1);
                return true;
            }
            if (walk(reply?.replies)) return true;
        }
        return false;
    };
    return walk(tweet?.replies);
}

function updateData(tweetId, replyId, field, value) {
    const tweet = currentData.find(t => t.id === tweetId);
    if (!tweet) return;

    if (replyId) {
        // 更新回复
        const reply = findReplyById(tweet, replyId);
        if (!reply) return;

        switch (field) {
            case 'userName':
                reply.user.name = value;
                break;
            case 'userHandle':
                reply.user.handle = value;
                break;
            case 'content':
                reply.content = value;
                break;
            case 'time':
                reply.time = value;
                break;
            case 'avatar':
                reply.user.avatar = value;
                reply.user.avatarLinked = false;
                break;
            case 'comments':
                reply.stats.comments = parseNumber(value);
                break;
            case 'retweets':
                reply.stats.retweets = parseNumber(value);
                break;
            case 'likes':
                reply.stats.likes = parseNumber(value);
                break;
            case 'views':
                reply.stats.views = parseNumber(value);
                break;
            case 'translationText':
                if (!reply.translation) reply.translation = { text: '', source: getDefaultTranslationSource(), visible: true };
                reply.translation.text = value;
                break;
            case 'translationSource':
                if (!reply.translation) reply.translation = { text: '', source: getDefaultTranslationSource(), visible: true };
                reply.translation.source = value || getDefaultTranslationSource();
                break;
            case 'translationVisible':
                if (!reply.translation) reply.translation = { text: '', source: getDefaultTranslationSource(), visible: true };
                reply.translation.visible = value === true || value === 'true';
                break;
        }
    } else {
        // 更新推文
        switch (field) {
            case 'userName':
                tweet.user.name = value;
                break;
            case 'userHandle':
                tweet.user.handle = value;
                break;
            case 'content':
                tweet.content = value;
                break;
            case 'time':
                tweet.time = value;
                break;
            case 'avatar':
                tweet.user.avatar = value;
                tweet.user.avatarLinked = false;
                break;
            case 'views':
                tweet.views = value;
                break;
            case 'comments':
                tweet.stats.comments = parseNumber(value);
                break;
            case 'retweets':
                tweet.stats.retweets = parseNumber(value);
                break;
            case 'likes':
                tweet.stats.likes = parseNumber(value);
                break;
            case 'bookmarks':
                tweet.stats.bookmarks = parseNumber(value);
                break;
            case 'mediaUrl':
                setTweetMediaImages(tweet, [value]);
                break;
            case 'translationText':
                if (!tweet.translation) tweet.translation = { text: '', source: getDefaultTranslationSource(), visible: true };
                tweet.translation.text = value;
                break;
            case 'translationSource':
                if (!tweet.translation) tweet.translation = { text: '', source: getDefaultTranslationSource(), visible: true };
                tweet.translation.source = value || getDefaultTranslationSource();
                break;
            case 'translationVisible':
                if (!tweet.translation) tweet.translation = { text: '', source: getDefaultTranslationSource(), visible: true };
                tweet.translation.visible = value === true || value === 'true';
                break;
        }
    }

    // 保存到统一状态（IndexedDB）
    saveData(currentData);
}

// ========================================
// 删除推文/回复
// ========================================

function deleteTweet(tweetId) {
    if (confirm(t('deleteTweetConfirm'))) {
        currentData = currentData.filter(t => t.id !== tweetId);
        saveData(currentData);
        renderTimeline();
    }
}

function deleteReply(tweetId, replyId) {
    if (confirm(t('deleteReplyConfirm'))) {
        const tweet = currentData.find(t => t.id === tweetId);
        if (tweet && tweet.replies) {
            removeReplyById(tweet, replyId);
            saveData(currentData);
            renderTweetDetail(tweetId);
        }
    }
}

// ========================================
// 工具函数
// ========================================

function formatNumber(num) {
    if (typeof num === 'string') {
        num = parseNumber(num);
    }

    if (num >= 10000) {
        return (num / 10000).toFixed(1) + '万';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

function parseNumber(str) {
    if (typeof str === 'number') return str;

    str = str.trim();

    if (str.includes('万')) {
        return parseFloat(str) * 10000;
    } else if (str.includes('K') || str.includes('k')) {
        return parseFloat(str) * 1000;
    }

    return parseInt(str) || 0;
}

function getFieldLabel(field) {
    const labels = {
        comments: t('fieldComments'),
        retweets: t('fieldRetweets'),
        likes: t('fieldLikes'),
        bookmarks: t('fieldBookmarks'),
        views: t('fieldViews')
    };
    return labels[field] || field;
}

// ========================================
// Enhancements
// ========================================
// V3 Enhancements (clean)
// ========================================

let appMode = 'edit';
const APP_LOCALE_KEY = 'tukuyomi-locale';

const I18N = {
    'zh-CN': {
        nav: ['主页', '入口', '2ch', '探索', '通知', '聊天', 'ヤチヨ', '书签', '创作者工作室', 'Premium', '个人资料', '更多'],
        home: '主页',
        detail: '帖子',
        account: '账户资料',
        search: '搜索',
        premiumTitle: '订阅 ツクヨミ Premium',
        premiumDesc: '订阅以解锁新功能，享受ツクヨミ世界的完整体验。',
        subscribe: '订阅',
        whatsNew: '有什么新鲜事',
        forYou: '为你推荐',
        following: '正在关注',
        post: '发帖',
        composePlaceholder: '有什么新鲜事？',
        showTranslation: '显示翻译',
        hideTranslation: '隐藏翻译',
        editTranslation: '编辑翻译',
        addMedia: '添加图片',
        removeMedia: '移除图片',
        uploadMedia: '上传图片',
        removeMediaItem: '删除这张',
        accountManager: '账户管理',
        modeEdit: '编辑模式',
        modeView: '查看模式',
        viewer: '浏览账户',
        sendAs: '发送账户',
        postTime: '显示时间',
        withTranslation: '附带翻译',
        exportHtml: '导出HTML',
        addAccount: '新增账户',
        importData: '导入数据',
        exportData: '导出数据',
        submitToCommunity: '投稿',
        language: '语言',
        sortByPost: '按发帖顺序',
        sortByDate: '按日期',
        related: '相关',
        viewQuotes: '查看引用',
        followAction: '关注',
        followingAction: '已关注',
        noAccount: '无账户',
        close: '关闭',
        edit: '编辑',
        avatar: '头像',
        delete: '删除',
        accountEmpty: '还没有账户',
        deleteTweetConfirm: '确定要删除这条推文吗？',
        deleteReplyConfirm: '确定要删除这条回复吗？',
        confirmDeleteAccount: '确定删除账户 {name} ({handle})？',
        promptAccountName: '昵称',
        promptAccountHandle: 'ID(@handle)',
        newRoleName: '新角色',
        newRoleHandle: '@new_role',
        editFieldPrompt: '编辑 {field}:',
        fieldComments: '评论数',
        fieldRetweets: '转发数',
        fieldLikes: '点赞数',
        fieldBookmarks: '书签数',
        fieldViews: '查看数',
        translationPlaceholder: '翻译文本',
        syncAccountAvatar: '同时同步为该账号头像',
        cropHelp: '拖动边中点可改长宽比，右下角可自由缩放',
        communityGallery: '社区',
        communityGalleryTitle: '社区项目',
        communityGalleryHint: '合并到仓库后的投稿会出现在这里，可一键导入。',
        communityGallerySearch: '搜索',
        communityGalleryRefresh: '刷新',
        communityGalleryLoad: '导入',
        communityGalleryEmpty: '(空)',
        communityGalleryLoading: '加载中...',
        communityGalleryLoadConfirm: '导入会替换当前项目，继续？',
        communityGalleryLoadOk: '已导入。',
        communityGalleryLoadError: '加载失败：'
    },
    'ja-JP': {
        nav: ['ホーム', 'Hub', '2ch', '話題を検索', '通知', 'メッセージ', 'ヤチヨ', 'ブックマーク', 'クリエイタースタジオ', 'Premium', 'プロフィール', 'もっと見る'],
        home: 'ホーム',
        detail: 'ポスト',
        account: 'アカウント',
        search: '検索',
        premiumTitle: 'ツクヨミ Premium を購読',
        premiumDesc: '新機能を解放して、ツクヨミの世界をフル体験。',
        subscribe: '購読',
        whatsNew: 'いまどうしてる？',
        forYou: 'おすすめ',
        following: 'フォロー中',
        post: 'ポスト',
        composePlaceholder: 'いまどうしてる？',
        showTranslation: '翻訳を表示',
        hideTranslation: '翻訳を隠す',
        editTranslation: '翻訳を編集',
        addMedia: '画像を追加',
        removeMedia: '画像を削除',
        uploadMedia: '画像をアップ',
        removeMediaItem: 'この画像を削除',
        accountManager: 'アカウント管理',
        modeEdit: '編集モード',
        modeView: '閲覧モード',
        viewer: '閲覧アカウント',
        sendAs: '投稿アカウント',
        postTime: '表示時間',
        withTranslation: '翻訳を付ける',
        exportHtml: 'HTMLを書き出す',
        addAccount: 'アカウント追加',
        importData: 'データ読込',
        exportData: 'データ書出',
        submitToCommunity: '投稿',
        language: '言語',
        sortByPost: '投稿順',
        sortByDate: '日付順',
        related: '関連',
        viewQuotes: '引用を表示',
        followAction: 'フォロー',
        followingAction: 'フォロー中',
        noAccount: 'アカウントなし',
        close: '閉じる',
        edit: '編集',
        avatar: 'アイコン',
        delete: '削除',
        accountEmpty: 'まだアカウントがありません',
        deleteTweetConfirm: 'このポストを削除しますか？',
        deleteReplyConfirm: 'この返信を削除しますか？',
        confirmDeleteAccount: 'アカウント {name} ({handle}) を削除しますか？',
        promptAccountName: '表示名',
        promptAccountHandle: 'ID(@handle)',
        newRoleName: '新しいキャラ',
        newRoleHandle: '@new_role',
        editFieldPrompt: '{field}を編集:',
        fieldComments: '返信数',
        fieldRetweets: 'リポスト数',
        fieldLikes: 'いいね数',
        fieldBookmarks: 'ブックマーク数',
        fieldViews: '表示数',
        translationPlaceholder: '翻訳テキスト',
        syncAccountAvatar: 'このポストのアイコンをアカウントにも同期',
        cropHelp: '辺の中央で比率調整、右下で自由リサイズ',
        communityGallery: 'コミュニティ',
        communityGalleryTitle: 'コミュニティ',
        communityGalleryHint: 'マージされた投稿はここに表示され、ワンクリックで読み込めます。',
        communityGallerySearch: '検索',
        communityGalleryRefresh: '更新',
        communityGalleryLoad: '読み込む',
        communityGalleryEmpty: '(空)',
        communityGalleryLoading: '読み込み中...',
        communityGalleryLoadConfirm: '現在のプロジェクトを置き換えます。続行しますか？',
        communityGalleryLoadOk: '読み込みました。',
        communityGalleryLoadError: '読み込み失敗：'
    }
};

function getLocale() {
    return localStorage.getItem(APP_LOCALE_KEY) || 'zh-CN';
}

function setLocale(locale) {
    localStorage.setItem(APP_LOCALE_KEY, locale);
    applyLocale();
}

function t(key) {
    const locale = getLocale();
    return I18N[locale]?.[key] || I18N['zh-CN'][key] || key;
}

function getTimelineSortMode() {
    const mode = localStorage.getItem(TIMELINE_SORT_KEY);
    return mode === 'date' ? 'date' : 'post';
}

function setTimelineSortMode(mode) {
    localStorage.setItem(TIMELINE_SORT_KEY, mode === 'date' ? 'date' : 'post');
}

function formatDateYMD(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return `${year}年${month}月${day}日`;
}

function formatTweetTimeForDisplay(text) {
    const str = (text || '').trim();
    if (!str) return '';

    const mYmd = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (mYmd) return `${mYmd[1]}年${Number(mYmd[2])}月${Number(mYmd[3])}日`;

    const mSlash = str.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (mSlash) return `${mSlash[1]}年${Number(mSlash[2])}月${Number(mSlash[3])}日`;

    const ts = Date.parse(str);
    if (Number.isFinite(ts)) return formatDateYMD(new Date(ts)) || str;
    return str;
}

function parseTweetTimeToTimestamp(text) {
    const str = (text || '').trim();
    const m = str.match(/(上午|下午)\s*(\d{1,2}):(\d{2})\s*·\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (m) {
        const isPm = m[1] === '下午';
        let hour = parseInt(m[2], 10);
        if (hour === 12) hour = isPm ? 12 : 0;
        else if (isPm) hour += 12;
        const minute = parseInt(m[3], 10);
        const year = parseInt(m[4], 10);
        const month = parseInt(m[5], 10) - 1;
        const day = parseInt(m[6], 10);
        return new Date(year, month, day, hour, minute, 0, 0).getTime();
    }

    const mYmd = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (mYmd) {
        const year = parseInt(mYmd[1], 10);
        const month = parseInt(mYmd[2], 10) - 1;
        const day = parseInt(mYmd[3], 10);
        return new Date(year, month, day, 0, 0, 0, 0).getTime();
    }

    const mSlash = str.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (mSlash) {
        const year = parseInt(mSlash[1], 10);
        const month = parseInt(mSlash[2], 10) - 1;
        const day = parseInt(mSlash[3], 10);
        return new Date(year, month, day, 0, 0, 0, 0).getTime();
    }

    const ts = Date.parse(str);
    return Number.isFinite(ts) ? ts : 0;
}

function applyMode(mode) {
    appMode = mode === 'view' ? 'view' : 'edit';
    setAppMode(appMode);
    document.body.classList.toggle('mode-view', appMode === 'view');
    document.body.classList.toggle('mode-edit', appMode !== 'view');

    const modeBtn = document.getElementById('mode-toggle-btn');
    if (modeBtn) {
        const modeLabel = appMode === 'view' ? t('modeView') : t('modeEdit');
        modeBtn.title = modeLabel;
        modeBtn.innerHTML = appMode === 'view'
            ? `<svg viewBox="0 0 24 24"><path d="M12 5c-7.633 0-11 6.726-11 7s3.367 7 11 7 11-6.726 11-7-3.367-7-11-7zm0 12c-2.765 0-5-2.235-5-5s2.235-5 5-5 5 2.235 5 5-2.235 5-5 5z"/></svg><span id="sidebar-mode-label">${modeLabel}</span>`
            : `<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm18.71-11.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 2-1.66z"/></svg><span id="sidebar-mode-label">${modeLabel}</span>`;
    }

    const composeInput = document.getElementById('compose-editor-input');
    if (composeInput) {
        composeInput.setAttribute('contenteditable', appMode === 'view' ? 'false' : 'true');
    }

    const submitBtn = document.querySelector('.compose-submit-btn');
    if (submitBtn) {
        if (appMode === 'view') {
            submitBtn.disabled = true;
            submitBtn.classList.remove('active');
        } else {
            updateComposeSubmitState();
        }
    }

    // Sync reply/nested-reply submit button states with current mode.
    document.querySelectorAll('.reply-input[data-tweet-id], .nested-reply-input[data-tweet-id]').forEach(input => {
        try {
            input.dispatchEvent(new Event('input', { bubbles: true }));
        } catch { }
    });
}

function toggleAppMode() {
    applyMode(appMode === 'view' ? 'edit' : 'view');
    if (currentView === 'timeline') renderTimeline();
    if (currentView === 'detail') renderTweetDetail(currentTweetId);
}

function applyLocale() {
    const locale = getLocale();
    const nav = I18N[locale].nav;

    document.querySelectorAll('.left-sidebar .nav-item span').forEach((el, idx) => {
        if (nav[idx]) el.textContent = nav[idx];
    });

    const setText = (selector, val) => {
        const el = document.querySelector(selector);
        if (el) el.textContent = val;
    };

    const setAttr = (selector, attr, val) => {
        const el = document.querySelector(selector);
        if (el) el.setAttribute(attr, val);
    };

    setText('#timeline-view .main-header h1', t('home'));
    setText('#tweet-detail-view .main-header h1', t('detail'));
    setText('#account-view .main-header h1', t('account'));
    setAttr('.search-box input', 'placeholder', t('search'));
    setText('.premium-section h2', t('premiumTitle'));
    setText('.premium-section .premium-desc', t('premiumDesc'));
    setText('.premium-section .subscribe-btn', t('subscribe'));
    setText('.trending h2', t('whatsNew'));
    setText('.timeline-tabs .tab.active', t('forYou'));
    setText('.timeline-tabs .tab:last-child', t('following'));
    setText('.left-sidebar .post-btn', t('post'));
    setText('.compose-submit-btn', t('post'));
    setText('#account-add-btn', t('addAccount'));
    setText('#sidebar-account-manager-label', t('accountManager'));
    setText('#sidebar-import-label', t('importData'));
    setText('#sidebar-export-label', t('exportData'));
    setText('#sidebar-export-html-label', t('exportHtml'));
    setText('#sidebar-mode-label', appMode === 'view' ? t('modeView') : t('modeEdit'));
    setText('#sidebar-locale-label', t('language'));
    setText('#sidebar-sort-label', getTimelineSortMode() === 'date' ? t('sortByDate') : t('sortByPost'));
    setText('#compose-translation-toggle-btn', t('withTranslation'));
    setText('#account-manager-close', t('close'));
    setText('#sync-account-avatar-option-wrap span', t('syncAccountAvatar'));
    setText('#image-modal .crop-help', t('cropHelp'));

    const transInput = document.getElementById('compose-translation-text');
    if (transInput) {
        transInput.setAttribute('placeholder', t('translationPlaceholder'));
    }

    // Tweet detail "相关 / 查看引用" row
    document.querySelectorAll('.tweet-related-row .related-label').forEach(el => {
        el.textContent = t('related');
    });
    document.querySelectorAll('.tweet-related-row .view-quotes-btn').forEach(el => {
        el.textContent = `${t('viewQuotes')} ›`;
    });

    const sortMode = getTimelineSortMode();
    document.querySelectorAll('.tweet-related-row .related-sort-arrow').forEach(el => {
        el.title = sortMode === 'date' ? t('sortByDate') : t('sortByPost');
    });
    document.querySelectorAll('.tweet-related-row .related-sort-option[data-sort="date"]').forEach(el => {
        el.textContent = t('sortByDate');
        el.classList.toggle('active', sortMode === 'date');
        el.setAttribute('aria-checked', sortMode === 'date' ? 'true' : 'false');
    });
    document.querySelectorAll('.tweet-related-row .related-sort-option[data-sort="post"]').forEach(el => {
        el.textContent = t('sortByPost');
        el.classList.toggle('active', sortMode !== 'date');
        el.setAttribute('aria-checked', sortMode !== 'date' ? 'true' : 'false');
    });

    const composeInput = document.getElementById('compose-editor-input');
    if (composeInput) {
        composeInput.dataset.placeholder = t('composePlaceholder');
        if (composeInput.classList.contains('is-placeholder') || !composeInput.innerText.trim()) {
            composeInput.textContent = t('composePlaceholder');
            composeInput.classList.add('is-placeholder');
        }
    }

    document.querySelectorAll('.follow-btn').forEach(btn => {
        btn.textContent = btn.classList.contains('following') ? t('followingAction') : t('followAction');
    });

    if (document.getElementById('account-manager-list')) {
        renderAccountManager();
    }
}

function ensureTopTools() {
    const sidebar = document.querySelector('.left-sidebar');
    const navContent = document.querySelector('.left-sidebar .nav-content');
    const postBtn = navContent?.querySelector('.post-btn');
    if (!sidebar || !navContent || !postBtn) return;

    const moreNav = document.getElementById('nav-more') || navContent.querySelector('.nav-item:last-of-type');
    if (moreNav && !moreNav.dataset.boundToolsToggle) {
        moreNav.dataset.boundToolsToggle = '1';
        moreNav.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleSidebarTools();
        });
    }

    if (!document.getElementById('sidebar-tools')) {
        const tools = document.createElement('div');
        tools.id = 'sidebar-tools';
        tools.className = 'sidebar-tools';
        tools.innerHTML = `
            <button id="sidebar-sort-btn" class="sidebar-tool-btn" type="button">
                <svg viewBox="0 0 24 24"><path d="M3.75 6.5h10.5v2H3.75v-2zm0 4.5h16.5v2H3.75v-2zm0 4.5h7.5v2h-7.5v-2z"/></svg>
                <span id="sidebar-sort-label"></span>
            </button>
            <button id="sidebar-account-manager-btn" class="sidebar-tool-btn" type="button">
                <svg viewBox="0 0 24 24"><path d="M7.501 19.917L7.471 21H.472l.029-1.027c.184-6.618 3.736-8.977 7-8.977.963 0 1.95.212 2.87.672-.761.557-1.408 1.267-1.862 2.085-.567-.157-1.224-.257-1.908-.257-1.957 0-4.152.924-4.6 5.421h4.606l-.106.004zM10.996 15c-1.52 0-2.762-1.243-2.762-2.762 0-1.52 1.243-2.762 2.762-2.762s2.762 1.243 2.762 2.762c0 1.52-1.243 2.762-2.762 2.762zm0-2c.421 0 .762-.341.762-.762 0-.421-.341-.762-.762-.762s-.762.341-.762.762c0 .421.341.762.762.762zm-6.49-4.486c-1.794 0-3.252-1.458-3.252-3.252S2.712 2.01 4.506 2.01s3.252 1.458 3.252 3.252-1.458 3.252-3.252 3.252zm0-2c.691 0 1.252-.56 1.252-1.252s-.56-1.252-1.252-1.252-1.252.56-1.252 1.252.56 1.252 1.252 1.252zM19.498 21h-7.995c-.274 0-.497-.224-.497-.5 0-2.761 2.238-5 5-5s5 2.239 5 5c0 .276-.223.5-.497.5h-.011zm-7.428-1h6.891c-.24-1.722-1.707-3.053-3.461-3.053s-3.221 1.331-3.43 3.053zM16.01 14.005c-1.795 0-3.252-1.458-3.252-3.253S14.214 7.5 16.01 7.5s3.252 1.458 3.252 3.252-1.458 3.253-3.252 3.253zm0-2c.691 0 1.252-.561 1.252-1.253S16.7 9.5 16.009 9.5s-1.252.56-1.252 1.252.56 1.253 1.252 1.253z"/></svg>
                <span id="sidebar-account-manager-label"></span>
            </button>
            <button id="mode-toggle-btn" class="sidebar-tool-btn mode-toggle-btn" type="button">
                <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm18.71-11.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 2-1.66z"/></svg>
                <span id="sidebar-mode-label"></span>
            </button>
            <button id="sidebar-import-btn" class="sidebar-tool-btn editor-only" type="button">
                <svg viewBox="0 0 24 24"><path d="M12 21.41l-5.7-5.7 1.41-1.42L11 17.59V8h2v9.59l3.29-3.3 1.41 1.42-5.7 5.7zM3 7V3.5C3 2.12 4.12 1 5.5 1h13C19.88 1 21 2.12 21 3.5V7h-2V3.5c0-.28-.22-.5-.5-.5H5.5c-.28 0-.5.22-.5.5V7H3z"/></svg>
                <span id="sidebar-import-label"></span>
            </button>
            <button id="sidebar-export-btn" class="sidebar-tool-btn editor-only" type="button">
                <svg viewBox="0 0 24 24"><path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"/></svg>
                <span id="sidebar-export-label"></span>
            </button>
            <button id="sidebar-export-html-btn" class="sidebar-tool-btn editor-only" type="button">
                <svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
                <span id="sidebar-export-html-label"></span>
            </button>
            <div class="sidebar-tool-row">
                <span id="sidebar-locale-label"></span>
                <select id="locale-select" class="sidebar-locale-select">
                    <option value="zh-CN">中文</option>
                    <option value="ja-JP">日本語</option>
                </select>
            </div>
        `;
        navContent.insertBefore(tools, postBtn);
    } else {
        const tools = document.getElementById('sidebar-tools');
        if (tools && tools.parentElement !== navContent) {
            navContent.insertBefore(tools, postBtn);
        } else if (tools && tools.nextElementSibling !== postBtn) {
            navContent.insertBefore(tools, postBtn);
        }
    }

    const tools = document.getElementById('sidebar-tools');
    if (tools) {
        tools.querySelector('#sidebar-submit-btn')?.remove();
        tools.querySelector('#sidebar-community-btn')?.remove();
    }

    if (tools && !tools.dataset.boundAutoClose) {
        tools.dataset.boundAutoClose = '1';
        tools.addEventListener('click', (e) => {
            const btn = e.target.closest('.sidebar-tool-btn');
            if (!btn) return;
            if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
                closeSidebarTools();
            }
        });
    }

    const accountManagerBtn = document.getElementById('sidebar-account-manager-btn');
    if (accountManagerBtn && !accountManagerBtn.dataset.bound) {
        accountManagerBtn.dataset.bound = '1';
        accountManagerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            renderAccountManager();
            document.getElementById('account-manager-modal')?.classList.add('active');
        });
    }

    const modeBtn = document.getElementById('mode-toggle-btn');
    if (modeBtn && !modeBtn.dataset.bound) {
        modeBtn.dataset.bound = '1';
        modeBtn.onclick = toggleAppMode;
    }

    const select = document.getElementById('locale-select');
    if (select) {
        select.value = getLocale();
        select.onchange = () => setLocale(select.value);
    }

    const importBtn = document.getElementById('sidebar-import-btn');
    if (importBtn && !importBtn.dataset.bound) {
        importBtn.dataset.bound = '1';
        importBtn.onclick = importData;
    }

    const exportBtn = document.getElementById('sidebar-export-btn');
    if (exportBtn && !exportBtn.dataset.bound) {
        exportBtn.dataset.bound = '1';
        exportBtn.onclick = exportData;
    }

    const exportHtmlBtn = document.getElementById('sidebar-export-html-btn');
    if (exportHtmlBtn && !exportHtmlBtn.dataset.bound) {
        exportHtmlBtn.dataset.bound = '1';
        exportHtmlBtn.onclick = exportHtmlSnapshot;
    }

    const sortBtn = document.getElementById('sidebar-sort-btn');
    if (sortBtn && !sortBtn.dataset.bound) {
        sortBtn.dataset.bound = '1';
        sortBtn.onclick = () => {
            const next = getTimelineSortMode() === 'date' ? 'post' : 'date';
            setTimelineSortMode(next);
            applyLocale();
            if (currentView === 'timeline') renderTimeline();
            if (currentView === 'detail') renderTweetDetail(currentTweetId);
        };
    }

}

function ensureComposeControls() {
    const area = document.querySelector('.compose-input-area');
    if (!area) return;

    const composeInput = area.querySelector('.compose-input');
    if (composeInput && !composeInput.id) {
        composeInput.id = 'compose-editor-input';
        composeInput.classList.remove('editable');
        composeInput.removeAttribute('data-field');
        composeInput.dataset.placeholder = t('composePlaceholder');
        composeInput.classList.add('is-placeholder');
        composeInput.textContent = t('composePlaceholder');
        composeInput.setAttribute('contenteditable', 'true');
        composeInput.addEventListener('focus', () => {
            if (composeInput.classList.contains('is-placeholder')) {
                composeInput.textContent = '';
                composeInput.classList.remove('is-placeholder');
            }
        });
        composeInput.addEventListener('blur', () => {
            const text = (composeInput.innerText || '').trim();
            if (!text) {
                composeInput.textContent = t('composePlaceholder');
                composeInput.classList.add('is-placeholder');
            }
            updateComposeSubmitState();
        });
        composeInput.addEventListener('input', () => {
            composeInput.classList.remove('is-placeholder');
            updateComposeSubmitState();
        });
    }

    const composeImageBtn = document.querySelector('.compose-icons .compose-icon');
    if (composeImageBtn && !composeImageBtn.dataset.boundUpload) {
        composeImageBtn.dataset.boundUpload = '1';
        composeImageBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (appMode === 'view') return;
            const remain = Math.max(0, 4 - composeDraftMediaIds.length);
            if (remain <= 0) return;
            const ids = await pickImagesAndStore(remain);
            if (!ids.length) return;
            composeDraftMediaIds = [...composeDraftMediaIds, ...ids].slice(0, 4);
            renderComposeMediaPreview();
            updateComposeSubmitState();
        });
    }

    if (document.getElementById('compose-meta-tools')) {
        renderComposeMediaPreview();
        updateComposeSubmitState();
        return;
    }

    const box = document.createElement('div');
    box.className = 'compose-extra editor-only';
    box.id = 'compose-meta-tools';
    box.innerHTML = `
        <div class="compose-meta-row">
            <div class="compose-meta-left">
                <select id="composer-account-select" class="composer-account-select"></select>
                <div class="compose-time-fields" id="compose-time-fields" title="${t('postTime')}">
                    <label class="compose-time-piece"><input id="compose-time-year" class="compose-time-part year" data-part="year" inputmode="numeric" maxlength="4"><span>年</span></label>
                    <label class="compose-time-piece"><input id="compose-time-month" class="compose-time-part" data-part="month" inputmode="numeric" maxlength="2"><span>月</span></label>
                    <label class="compose-time-piece"><input id="compose-time-day" class="compose-time-part" data-part="day" inputmode="numeric" maxlength="2"><span>日</span></label>
                    <label class="compose-time-piece"><input id="compose-time-hour" class="compose-time-part" data-part="hour" inputmode="numeric" maxlength="2"><span>时</span></label>
                    <label class="compose-time-piece"><input id="compose-time-minute" class="compose-time-part" data-part="minute" inputmode="numeric" maxlength="2"><span>分</span></label>
                </div>
            </div>
            <button id="compose-translation-toggle-btn" class="inline-mini-btn subtle-btn compose-translation-btn" type="button">${t('withTranslation')}</button>
        </div>
        <textarea id="compose-translation-text" class="compose-translation-input" placeholder="${t('translationPlaceholder')}" style="display:none"></textarea>
        <div id="compose-media-preview" class="composer-media-preview" style="display:none"></div>
    `;

    area.insertBefore(box, area.querySelector('.compose-tools'));

    const showToggleBtn = document.getElementById('compose-translation-toggle-btn');
    const transInput = document.getElementById('compose-translation-text');
    showToggleBtn?.addEventListener('click', () => {
        const active = showToggleBtn.classList.toggle('active');
        transInput.style.display = active ? '' : 'none';
    });

    document.querySelectorAll('.compose-time-part').forEach(input => {
        input.addEventListener('input', () => {
            input.value = (input.value || '').replace(/\D/g, '');
        });
    });

    const submitBtn = document.querySelector('.compose-submit-btn');
    if (submitBtn) {
        submitBtn.onclick = submitComposeTweet;
        submitBtn.disabled = true;
    }
    renderComposeMediaPreview();
    updateComposeSubmitState();
}

function getComposeInputText() {
    const composeInput = document.getElementById('compose-editor-input');
    if (!composeInput) return '';
    if (composeInput.classList.contains('is-placeholder')) return '';
    return (composeInput.innerText || '').trim();
}

function updateComposeSubmitState() {
    const submitBtn = document.querySelector('.compose-submit-btn');
    if (!submitBtn) return;
    const hasText = getComposeInputText().length > 0;
    const hasMedia = composeDraftMediaIds.length > 0;
    const canPost = hasText || hasMedia;
    submitBtn.classList.toggle('active', canPost);
    submitBtn.disabled = !canPost;
}

function fillAccountSelectors() {
    const accounts = getAccounts();
    const selectedId = getComposeAccountId() || '';

    const select = document.getElementById('composer-account-select');
    if (select) {
        select.innerHTML = '';
        if (!accounts.length) {
            select.innerHTML = `<option value="">${t('sendAs')}: ${t('noAccount')}</option>`;
            return;
        }
        accounts.forEach(acc => {
            const opt = document.createElement('option');
            opt.value = acc.id;
            opt.textContent = `${acc.name || ''} (${acc.handle || ''})`;
            if (acc.id === selectedId) opt.selected = true;
            select.appendChild(opt);
        });
        if (!select.value && accounts[0]) {
            select.value = accounts[0].id;
            setComposeAuthorId(accounts[0].id);
        }
        select.onchange = () => {
            setComposeAuthorId(select.value || null);
            renderViewerProfile();
        };
    }
}

function buildInlineAccountOptions(selectedId) {
    const accounts = getAccounts();
    if (!accounts.length) return `<option value="">${t('sendAs')}: ${t('noAccount')}</option>`;
    let html = '';
    accounts.forEach(acc => {
        html += `<option value="${acc.id}" ${acc.id === selectedId ? 'selected' : ''}>${acc.name} (${acc.handle})</option>`;
    });
    return html;
}

function getComposeAccountId() {
    const ui = getUIState();
    return ui.composeAuthorId || ui.defaultAuthorId || getAccounts()[0]?.id || null;
}

function submitComposeTweet() {
    const contentInput = document.getElementById('compose-editor-input');
    const select = document.getElementById('composer-account-select');
    const timeFields = document.getElementById('compose-time-fields');
    const transToggleBtn = document.getElementById('compose-translation-toggle-btn');
    const transText = document.getElementById('compose-translation-text');

    const content = getComposeInputText();
    if (!content && composeDraftMediaIds.length === 0) return;

    const accountId = select?.value || getComposeAccountId();
    const account = getAccounts().find(a => a.id === accountId);

    const manualTimeText = collectTimeFromFields(timeFields);

    const tweet = {
        id: Date.now(),
        user: {
            name: account?.name || '新用户',
            handle: account?.handle || '@new_user',
            avatar: account?.avatar || '',
            verified: !!account?.verified,
            accountId: account?.id || null,
            avatarLinked: true
        },
        content,
        media: null,
        time: manualTimeText || formatDateYMD(new Date()),
        views: '0',
        stats: { comments: 0, retweets: 0, likes: 0, bookmarks: 0 },
        translation: transToggleBtn?.classList.contains('active') ? { text: transText?.value || '', source: getDefaultTranslationSource(), visible: true } : null,
        replies: []
    };
    if (composeDraftMediaIds.length) {
        setTweetMediaImages(tweet, composeDraftMediaIds);
    }

    currentData.unshift(tweet);
    saveData(currentData);

    if (contentInput) {
        contentInput.textContent = t('composePlaceholder');
        contentInput.classList.add('is-placeholder');
    }
    timeFields?.querySelectorAll('.compose-time-part').forEach(input => {
        input.value = '';
    });
    if (transToggleBtn) transToggleBtn.classList.remove('active');
    if (transText) {
        transText.value = '';
        transText.style.display = 'none';
    }
    composeDraftMediaIds = [];
    renderComposeMediaPreview();

    updateComposeSubmitState();
    renderTimeline();
}

function submitInlineReply(tweetId) {
    const input = document.querySelector(`.reply-input[data-tweet-id="${tweetId}"]`);
    const select = document.querySelector(`.reply-account-select[data-tweet-id="${tweetId}"]`);
    const controls = document.querySelector(`.reply-compose-controls[data-tweet-id="${tweetId}"]:not([data-parent-reply-id])`);
    if (!input) return;

    const content = input.value.trim();
    const draft = getReplyDraft(tweetId, null);
    if (!content && !draft.mediaIds.length) return;

    const accountId = select?.value || getComposeAccountId();
    const timeText = collectTimeFromFields(controls);
    addNewReply(tweetId, content, accountId, { time: timeText, mediaIds: draft.mediaIds });
    clearReplyDraft(tweetId, null);
    input.value = '';
    controls?.querySelectorAll('.compose-time-part').forEach(field => {
        field.value = '';
    });
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function submitNestedReply(tweetId, parentReplyId) {
    const input = document.querySelector(`.nested-reply-input[data-tweet-id="${tweetId}"][data-parent-reply-id="${parentReplyId}"]`);
    const controls = document.querySelector(`.reply-compose-controls[data-tweet-id="${tweetId}"][data-parent-reply-id="${parentReplyId}"]`);
    if (!input) return;

    const content = input.value.trim();
    const draft = getReplyDraft(tweetId, parentReplyId);
    if (!content && !draft.mediaIds.length) return;

    const timeText = collectTimeFromFields(controls);
    addNestedReply(tweetId, parentReplyId, content, null, { time: timeText, mediaIds: draft.mediaIds });
    clearReplyDraft(tweetId, parentReplyId);
    input.value = '';
    controls?.querySelectorAll('.compose-time-part').forEach(field => {
        field.value = '';
    });
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function addNewReply(tweetId, content = '请编辑回复内容...', forcedAccountId = null, options = null) {
    const tweet = currentData.find(t => t.id === tweetId);
    if (!tweet) return;

    const accountId = forcedAccountId || getComposeAccountId();
    const account = getAccounts().find(a => a.id === accountId);

    const reply = {
        id: Date.now(),
        user: {
            name: account?.name || '新回复用户',
            handle: account?.handle || '@reply_user',
            avatar: account?.avatar || '',
            verified: !!account?.verified,
            accountId: account?.id || null,
            avatarLinked: true
        },
        content,
        time: options?.time || formatDateYMD(new Date()),
        translation: null,
        stats: { comments: 0, retweets: 0, likes: 0, views: 0 },
        replies: []
    };
    if (Array.isArray(options?.mediaIds) && options.mediaIds.length) {
        setTweetMediaImages(reply, options.mediaIds);
    }

    tweet.replies = tweet.replies || [];
    tweet.replies.unshift(reply);
    saveData(currentData);
    renderTweetDetail(tweetId);
}

function addNestedReply(tweetId, parentReplyId, content, forcedAccountId = null, options = null) {
    const tweet = currentData.find(t => t.id === tweetId);
    if (!tweet) return;

    const parent = findReplyById(tweet, parentReplyId);
    if (!parent) return;

    const accountId = forcedAccountId || getComposeAccountId();
    const account = getAccounts().find(a => a.id === accountId);

    const reply = {
        id: Date.now(),
        user: {
            name: account?.name || '新回复用户',
            handle: account?.handle || '@reply_user',
            avatar: account?.avatar || '',
            verified: !!account?.verified,
            accountId: account?.id || null,
            avatarLinked: true
        },
        content,
        time: options?.time || formatDateYMD(new Date()),
        translation: null,
        stats: { comments: 0, retweets: 0, likes: 0, views: 0 },
        replies: []
    };
    if (Array.isArray(options?.mediaIds) && options.mediaIds.length) {
        setTweetMediaImages(reply, options.mediaIds);
    }

    parent.replies = parent.replies || [];
    parent.replies.unshift(reply);
    if (parent.stats) {
        parent.stats.comments = parseNumber(parent.stats.comments ?? 0) + 1;
    }

    saveData(currentData);
    renderTweetDetail(tweetId);
}

function ensureAccountManager() {
    if (document.getElementById('account-manager-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'account-manager-modal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content account-manager-content">
            <h3>${t('accountManager')}</h3>
            <div class="modal-actions" style="justify-content:flex-start; margin-bottom:8px;">
                <button type="button" id="account-add-btn">${t('addAccount')}</button>
            </div>
            <div id="account-manager-list"></div>
            <div class="modal-actions">
                <button type="button" id="account-manager-close">${t('close')}</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'account-manager-modal') modal.classList.remove('active');
    });

    document.getElementById('account-manager-close').onclick = () => modal.classList.remove('active');
    document.getElementById('account-add-btn').onclick = () => {
        const id = `acc_${Date.now()}`;
        upsertAccount({ id, name: t('newRoleName'), handle: t('newRoleHandle'), avatar: '', verified: false });
        renderAccountManager();
        fillAccountSelectors();
    };
}

function ensureViewerSwitcher() {
    if (document.getElementById('viewer-switcher-menu')) return;
    const menu = document.createElement('div');
    menu.id = 'viewer-switcher-menu';
    menu.className = 'viewer-switcher-menu';
    menu.style.display = 'none';
    document.body.appendChild(menu);
}

function closeViewerSwitcher() {
    const menu = document.getElementById('viewer-switcher-menu');
    if (!menu) return;
    menu.style.display = 'none';
    menu.innerHTML = '';
}

function fillAccountAvatars(container, accounts) {
    if (!container) return;
    const accountMap = new Map((accounts || []).map(acc => [acc.id, acc]));
    container.querySelectorAll('[data-account-id]').forEach(node => {
        const accountId = node.dataset.accountId;
        const account = accountMap.get(accountId);
        const avatarHost = node.querySelector('.viewer-switcher-avatar, .account-manager-avatar');
        if (!avatarHost) return;
        const fallback = (account?.name || '?').trim().charAt(0) || '?';
        avatarHost.textContent = fallback;
        renderUIAvatar(avatarHost, account?.avatar || '');
    });
    loadAsyncImages(container);
}

function openViewerSwitcher(anchorEl) {
    ensureViewerSwitcher();
    const menu = document.getElementById('viewer-switcher-menu');
    if (!menu || !anchorEl) return;

    const accounts = getAccounts();
    const viewerId = getUIState().defaultAuthorId;
    let html = `<div class="viewer-switcher-title">${t('viewer')}</div>`;
    accounts.forEach(acc => {
        html += `
            <button class="viewer-switcher-item" data-account-id="${acc.id}">
                <span class="viewer-switcher-avatar"></span>
                <span class="viewer-switcher-name">${acc.name || ''}</span>
                <span class="viewer-switcher-handle">${acc.handle || ''}</span>
                <span class="viewer-switcher-check">${viewerId === acc.id ? '✓' : ''}</span>
            </button>
        `;
    });
    html += `<button class="viewer-switcher-manage">${t('accountManager')}</button>`;
    menu.innerHTML = html;
    fillAccountAvatars(menu, accounts);

    const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    menu.classList.toggle('mobile', !!isMobile);

    if (isMobile) {
        const safeTop = 56;
        menu.style.left = '12px';
        menu.style.right = '12px';
        menu.style.top = `${safeTop}px`;
    } else {
        menu.style.right = '';
        const rect = anchorEl.getBoundingClientRect();
        const menuWidth = 260;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1280;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
        const estimatedHeight = Math.min(520, Math.max(220, 48 + (getAccounts().length * 68)));

        const leftMin = 8;
        const leftMax = Math.max(leftMin, viewportWidth - menuWidth - 8);
        const left = Math.min(leftMax, Math.max(leftMin, rect.right - menuWidth));

        const topMin = 8;
        const topMax = Math.max(topMin, viewportHeight - estimatedHeight - 8);
        const top = Math.min(topMax, Math.max(topMin, rect.top - 8));

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }

    menu.style.display = 'block';
}

function renderAccountManager() {
    const list = document.getElementById('account-manager-list');
    if (!list) return;

    const accounts = getAccounts();

    if (!accounts.length) {
        list.innerHTML = `<div class="account-manager-empty">${t('accountEmpty')}</div>`;
        return;
    }

    list.innerHTML = accounts.map(acc => `
        <div class="account-manager-item" data-account-id="${acc.id}">
            <div class="account-manager-main">
                <div class="account-manager-avatar"></div>
                <div class="account-manager-meta">
                    <div class="account-manager-name">${acc.name || ''}</div>
                    <div class="account-manager-handle">${acc.handle || ''}</div>
                </div>
            </div>
            <div class="account-manager-actions">
                <button class="account-action-btn" data-action="edit">${t('edit')}</button>
                <button class="account-action-btn" data-action="avatar">${t('avatar')}</button>
                <button class="account-action-btn danger" data-action="delete">${t('delete')}</button>
            </div>
        </div>
    `).join('');
    fillAccountAvatars(list, accounts);
}

async function selectAndSaveAvatar(account) {
    editingElement = null;
    editingField = 'account-avatar';
    editingTweetId = null;
    editingReplyId = null;
    editingAccountId = account?.id || null;
    imageEditMode = 'avatar';
    openImageModal(false);
}

function applyAccountChangesToTweets(account) {
    currentData.forEach(tw => {
        if (tw.user?.accountId === account.id || tw.user?.handle === account.handle) {
            tw.user.name = account.name;
            tw.user.handle = account.handle;
            if (shouldSyncAvatarFromAccount(tw.user)) {
                tw.user.avatar = account.avatar || '';
                tw.user.avatarLinked = true;
            }
            tw.user.verified = !!account.verified;
            tw.user.accountId = account.id;
        }
        walkReplyTree(tw.replies || [], r => {
            if (r.user?.accountId === account.id || r.user?.handle === account.handle) {
                r.user.name = account.name;
                r.user.handle = account.handle;
                if (shouldSyncAvatarFromAccount(r.user)) {
                    r.user.avatar = account.avatar || '';
                    r.user.avatarLinked = true;
                }
                r.user.verified = !!account.verified;
                r.user.accountId = account.id;
            }
        });
    });
    saveData(currentData);
}

function toggleLikeState(tweetId, replyId = null) {
    const tweet = currentData.find(t => t.id === tweetId);
    if (!tweet) return false;

    if (replyId) {
        const reply = findReplyById(tweet, replyId);
        if (!reply) return false;
        const currentlyLiked = !!reply.userLiked;
        reply.userLiked = !currentlyLiked;
        const baseLikes = parseNumber(reply.stats?.likes ?? 0);
        reply.stats.likes = Math.max(0, baseLikes + (reply.userLiked ? 1 : -1));
    } else {
        const currentlyLiked = !!tweet.userLiked;
        tweet.userLiked = !currentlyLiked;
        const baseLikes = parseNumber(tweet.stats?.likes ?? 0);
        tweet.stats.likes = Math.max(0, baseLikes + (tweet.userLiked ? 1 : -1));
    }

    saveData(currentData);
    return true;
}

function renderViewerProfile() {
    const viewerId = getUIState().defaultAuthorId;
    const accounts = getAccounts();
    const account = accounts.find(a => a.id === viewerId) || accounts[0];
    if (!account) return;
    const composeAccountId = getComposeAccountId();
    const composeAccount = accounts.find(a => a.id === composeAccountId) || account;

    const nameEl = document.querySelector('[data-field="sidebar-name"]');
    const handleEl = document.querySelector('[data-field="sidebar-handle"]');
    const avatarEl = document.querySelector('.user-profile .editable-avatar[data-field="sidebar-avatar"]');
    const composeAvatarEl = document.querySelector('.compose-box .editable-avatar[data-field="compose-avatar"]');
    const replyComposeAvatarEls = document.querySelectorAll('.editable-avatar[data-field="reply-compose-avatar"]');
    const moreIconEl = document.querySelector('.user-profile .more-icon');

    if (nameEl) nameEl.textContent = account.name || '';
    if (handleEl) handleEl.textContent = account.handle || '';
    if (avatarEl) renderUIAvatar(avatarEl, account.avatar || '');
    if (composeAvatarEl) renderUIAvatar(composeAvatarEl, composeAccount.avatar || '');
    replyComposeAvatarEls.forEach(el => renderUIAvatar(el, composeAccount.avatar || ''));
    if (moreIconEl) moreIconEl.setAttribute('title', t('viewer'));
}

function renderUIAvatar(element, avatarRef) {
    if (!element) return;
    const fallbackChar = (element.textContent || '?').trim().charAt(0) || '?';
    if (!avatarRef) {
        element.innerHTML = `<div class="avatar-placeholder">${fallbackChar}</div>`;
        return;
    }
    if (isIndexedDBImageId(avatarRef)) {
        element.innerHTML = `<img data-image-id="${avatarRef}" class="async-image" alt="avatar">`;
        loadAsyncImages(element);
    } else {
        element.innerHTML = `<img src="${avatarRef}" alt="avatar">`;
    }
}

function applyUIOverrides(root = document) {
    const ui = getUIState();
    const textFields = ui?.textFields && typeof ui.textFields === 'object' ? ui.textFields : {};
    const avatarFields = ui?.avatarFields && typeof ui.avatarFields === 'object' ? ui.avatarFields : {};

    root.querySelectorAll('[data-field]:not([data-tweet-id])').forEach(el => {
        const key = el.dataset.field;
        if (!key) return;

        if (el.classList.contains('editable-avatar')) {
            if (Object.prototype.hasOwnProperty.call(avatarFields, key)) {
                renderUIAvatar(el, avatarFields[key] || '');
            }
            return;
        }

        if (Object.prototype.hasOwnProperty.call(textFields, key)) {
            el.textContent = textFields[key];
        }
    });
}

function exportHtmlSnapshot() {
    const payload = { tweets: currentData, accounts: getAccounts(), ui: getUIState(), locale: getLocale() };
    const safe = JSON.stringify(payload).replace(/</g, '\\u003c');
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TUKUYOMI Snapshot</title><style>body{background:#000;color:#e7e9ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0}.wrap{max-width:760px;margin:0 auto;padding:18px}.p{border-bottom:1px solid #2f3336;padding:14px 0}.m{color:#71767b;font-size:13px}.t{white-space:pre-wrap;margin-top:8px}</style></head><body><div class="wrap" id="app"></div><script>const d=${safe};const map=new Map((d.accounts||[]).map(a=>[a.id,a]));document.getElementById('app').innerHTML=(d.tweets||[]).map(p=>{const a=map.get(p.user?.accountId)||p.user||{};return '<article class="p"><div><b>'+(a.name||'')+'</b> '+(a.handle||'')+'</div><div class="m">'+(p.time||'')+'</div><div class="t">'+(p.content||'').replace(/</g,'&lt;')+'</div></article>'}).join('')</script></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tukuyomi-snapshot.html';
    a.click();
    URL.revokeObjectURL(url);
}

exportData = function () {
    const payload = { schemaVersion: 3, exportedAt: new Date().toISOString(), tweets: currentData, accounts: getAccounts(), ui: getUIState(), locale: getLocale() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tukuyomi-project.json';
    a.click();
    URL.revokeObjectURL(url);
};

function getSubmissionConfig() {
    const cfg = (window.APP_SUBMISSION_CONFIG && typeof window.APP_SUBMISSION_CONFIG === 'object')
        ? window.APP_SUBMISSION_CONFIG
        : {};
    const endpoint = typeof cfg.endpoint === 'string' && cfg.endpoint.trim() ? cfg.endpoint.trim() : '/api/submissions';
    const projectKey = typeof cfg.projectKey === 'string' ? cfg.projectKey.trim() : '';
    return { endpoint, projectKey };
}

function ensureCommunitySubmissionModal() {
    if (document.getElementById('community-submission-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'community-submission-modal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>投稿到社区</h3>
            <div class="modal-field">
                <label class="modal-label" for="community-submission-author">署名（可选）</label>
                <input id="community-submission-author" type="text" autocomplete="nickname" placeholder="显示名" />
            </div>
            <div class="modal-field">
                <label class="modal-label" for="community-submission-contact">联系方式（可选）</label>
                <input id="community-submission-contact" type="text" autocomplete="email" placeholder="Email / 其他" />
            </div>
            <label class="modal-check-option">
                <input type="checkbox" id="community-submission-show-author" checked />
                <span>在内容中展示署名</span>
            </label>
            <div class="modal-field">
                <label class="modal-label" for="community-submission-note">备注（可选）</label>
                <textarea id="community-submission-note" placeholder="补充说明 / 注意事项"></textarea>
            </div>
            <div id="community-submission-status" class="modal-hint" aria-live="polite"></div>
            <div class="modal-actions">
                <button id="community-submission-cancel" type="button">取消</button>
                <button id="community-submission-send" type="button">提交</button>
            </div>
        </div>
    `;

    modal.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'community-submission-modal') {
            closeCommunitySubmissionModal();
        }
    });

    document.body.appendChild(modal);

    const cancelBtn = document.getElementById('community-submission-cancel');
    if (cancelBtn) cancelBtn.onclick = closeCommunitySubmissionModal;

    const sendBtn = document.getElementById('community-submission-send');
    if (sendBtn) sendBtn.onclick = submitCommunitySubmission;
}

function openCommunitySubmissionModal() {
    if (!COMMUNITY_FEATURES_ENABLED) {
        alert('社区投稿功能暂时关闭。');
        return;
    }
    ensureCommunitySubmissionModal();
    document.getElementById('community-submission-status').textContent = '';
    document.getElementById('community-submission-modal').classList.add('active');
}

function closeCommunitySubmissionModal() {
    document.getElementById('community-submission-modal')?.classList.remove('active');
}

function setCommunitySubmissionStatus(text) {
    const el = document.getElementById('community-submission-status');
    if (!el) return;
    el.textContent = text || '';
}

function buildProjectExportPayload() {
    return {
        schemaVersion: 3,
        exportedAt: new Date().toISOString(),
        tweets: currentData,
        accounts: getAccounts(),
        ui: getUIState(),
        locale: getLocale()
    };
}

async function submitCommunitySubmission() {
    if (!COMMUNITY_FEATURES_ENABLED) {
        setCommunitySubmissionStatus('社区投稿功能暂时关闭。');
        return;
    }
    const { endpoint, projectKey } = getSubmissionConfig();

    const authorDisplayName = (document.getElementById('community-submission-author')?.value || '').trim();
    const authorContact = (document.getElementById('community-submission-contact')?.value || '').trim();
    const showAuthorOnContent = Boolean(document.getElementById('community-submission-show-author')?.checked);
    const note = (document.getElementById('community-submission-note')?.value || '').trim();

    const sendBtn = document.getElementById('community-submission-send');
    if (sendBtn) {
        sendBtn.disabled = true;
    }

    setCommunitySubmissionStatus('提交中...');

    try {
        const body = {
            schemaVersion: 1,
            source: 'twitter',
            projectKey: projectKey || undefined,
            payload: buildProjectExportPayload(),
            authorDisplayName: authorDisplayName || undefined,
            authorContact: authorContact || undefined,
            showAuthorOnContent,
            note: note || undefined
        };

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            setCommunitySubmissionStatus(`提交失败：${data.error || res.status}`);
            return;
        }

        setCommunitySubmissionStatus(`提交成功（等待审核），ID: ${data.id}`);
    } catch (err) {
        console.warn('Submission failed:', err);
        setCommunitySubmissionStatus('提交失败：网络错误，请稍后重试。');
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
        }
    }
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getCommunityConfig() {
    const cfg = (window.APP_COMMUNITY_CONFIG && typeof window.APP_COMMUNITY_CONFIG === 'object')
        ? window.APP_COMMUNITY_CONFIG
        : {};
    const indexUrl = typeof cfg.indexUrl === 'string' && cfg.indexUrl.trim()
        ? cfg.indexUrl.trim()
        : 'community-submissions/twitter/index.json';
    return { indexUrl };
}

let communityGalleryAllItems = [];

function ensureCommunityGalleryModal() {
    if (document.getElementById('community-gallery-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'community-gallery-modal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content modal-wide">
            <h3>${escapeHtml(t('communityGalleryTitle'))}</h3>
            <div class="modal-hint">${escapeHtml(t('communityGalleryHint'))}</div>
            <div class="modal-field">
                <label class="modal-label" for="community-gallery-q">${escapeHtml(t('communityGallerySearch'))}</label>
                <input id="community-gallery-q" type="text" placeholder="${escapeHtml(t('communityGallerySearch'))}" />
            </div>
            <div id="community-gallery-status" class="modal-hint" aria-live="polite"></div>
            <div id="community-gallery-list" class="community-gallery-list"></div>
            <div class="modal-actions">
                <button id="community-gallery-close" type="button">${escapeHtml(t('close'))}</button>
                <button id="community-gallery-refresh" type="button">${escapeHtml(t('communityGalleryRefresh'))}</button>
            </div>
        </div>
    `;

    modal.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'community-gallery-modal') {
            closeCommunityGalleryModal();
        }
    });

    document.body.appendChild(modal);

    document.getElementById('community-gallery-close')?.addEventListener('click', closeCommunityGalleryModal);
    document.getElementById('community-gallery-refresh')?.addEventListener('click', refreshCommunityGallery);
    document.getElementById('community-gallery-q')?.addEventListener('input', renderCommunityGalleryList);

    document.getElementById('community-gallery-list')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.community-load-btn');
        if (!btn) return;
        const path = btn.dataset.path || '';
        if (!path) return;
        await loadCommunityProject(path);
    });
}

function openCommunityGalleryModal() {
    if (!COMMUNITY_FEATURES_ENABLED) {
        alert('社区内容功能暂时关闭。');
        return;
    }
    ensureCommunityGalleryModal();
    document.getElementById('community-gallery-status').textContent = '';
    document.getElementById('community-gallery-q').value = '';
    document.getElementById('community-gallery-modal').classList.add('active');
    refreshCommunityGallery();
}

function closeCommunityGalleryModal() {
    document.getElementById('community-gallery-modal')?.classList.remove('active');
}

function setCommunityGalleryStatus(text) {
    const el = document.getElementById('community-gallery-status');
    if (!el) return;
    el.textContent = text || '';
}

async function refreshCommunityGallery() {
    if (!COMMUNITY_FEATURES_ENABLED) {
        communityGalleryAllItems = [];
        setCommunityGalleryStatus('社区内容功能暂时关闭。');
        renderCommunityGalleryList();
        return;
    }
    const { indexUrl } = getCommunityConfig();
    setCommunityGalleryStatus(t('communityGalleryLoading'));

    try {
        const res = await fetch(indexUrl, { cache: 'no-store' });
        if (res.status === 404) {
            communityGalleryAllItems = [];
            setCommunityGalleryStatus('');
            renderCommunityGalleryList();
            return;
        }
        if (!res.ok) {
            setCommunityGalleryStatus(`${t('communityGalleryLoadError')}${res.status}`);
            return;
        }
        const data = await res.json().catch(() => ({}));
        const items = Array.isArray(data?.items) ? data.items : [];
        communityGalleryAllItems = items
            .filter((it) => it && typeof it === 'object' && it.id && it.path)
            .map((it) => ({
                id: String(it.id),
                createdAt: it.createdAt ? String(it.createdAt) : '',
                authorDisplayName: it.authorDisplayName ? String(it.authorDisplayName) : '',
                note: it.note ? String(it.note) : '',
                path: String(it.path)
            }));
        setCommunityGalleryStatus('');
        renderCommunityGalleryList();
    } catch (err) {
        console.warn('Failed to load community index:', err);
        setCommunityGalleryStatus(`${t('communityGalleryLoadError')}${err.message || String(err)}`);
    }
}

function renderCommunityGalleryList() {
    const list = document.getElementById('community-gallery-list');
    if (!list) return;

    const q = (document.getElementById('community-gallery-q')?.value || '').trim().toLowerCase();
    const items = q
        ? communityGalleryAllItems.filter((it) => {
            return (
                it.id.toLowerCase().includes(q) ||
                it.authorDisplayName.toLowerCase().includes(q) ||
                it.note.toLowerCase().includes(q)
            );
        })
        : communityGalleryAllItems.slice();

    if (!items.length) {
        list.innerHTML = `<div class="community-empty">${escapeHtml(t('communityGalleryEmpty'))}</div>`;
        return;
    }

    list.innerHTML = items.map((it) => {
        const who = it.authorDisplayName ? escapeHtml(it.authorDisplayName) : 'Anonymous';
        const note = it.note ? `<div class="community-item-note">${escapeHtml(it.note)}</div>` : '';
        const created = it.createdAt ? `<div class="community-item-meta">${escapeHtml(it.createdAt)}</div>` : '';
        return `
            <div class="community-item">
                <div class="community-item-main">
                    <div class="community-item-title">${who} <span class="community-item-id">${escapeHtml(it.id)}</span></div>
                    ${created}
                    ${note}
                </div>
                <div class="community-item-actions">
                    <button class="community-load-btn" type="button" data-path="${escapeHtml(it.path)}">${escapeHtml(t('communityGalleryLoad'))}</button>
                </div>
            </div>
        `;
    }).join('');
}

async function loadCommunityProject(path) {
    if (!COMMUNITY_FEATURES_ENABLED) {
        setCommunityGalleryStatus('社区内容功能暂时关闭。');
        return;
    }
    if (!confirm(t('communityGalleryLoadConfirm'))) return;

    setCommunityGalleryStatus(t('communityGalleryLoading'));
    try {
        const res = await fetch(path, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            setCommunityGalleryStatus(`${t('communityGalleryLoadError')}${data.error || res.status}`);
            return;
        }

        const payload = data && data.payload;
        if (!payload || !Array.isArray(payload.tweets)) {
            setCommunityGalleryStatus(`${t('communityGalleryLoadError')}invalid payload`);
            return;
        }

        replaceProjectState({ tweets: payload.tweets, accounts: payload.accounts || [], ui: payload.ui || {} });
        if (payload.locale) setLocale(payload.locale);
        currentData = loadData();
        closeCommunityGalleryModal();
        showTimeline();
    } catch (err) {
        console.warn('Failed to load community project:', err);
        setCommunityGalleryStatus(`${t('communityGalleryLoadError')}${err.message || String(err)}`);
    }
}

importData = function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const raw = JSON.parse(ev.target.result);
                if (!raw || !Array.isArray(raw.tweets)) throw new Error('无效数据');
                replaceProjectState({ tweets: raw.tweets, accounts: raw.accounts || [], ui: raw.ui || {} });
                if (raw.locale) setLocale(raw.locale);
                currentData = loadData();
                showTimeline();
            } catch (err) {
                alert('导入失败: ' + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
};

showTimeline = function () {
    document.getElementById('timeline-view').classList.add('active');
    document.getElementById('tweet-detail-view').classList.remove('active');
    document.getElementById('account-view').classList.remove('active');
    currentView = 'timeline';
    currentTweetId = null;
    renderTimeline();
};

renderTimeline = ((orig) => function () {
    orig();
    ensureTopTools();
    ensureComposeControls();
    ensureAccountManager();
    ensureViewerSwitcher();
    fillAccountSelectors();
    renderViewerProfile();
    applyMode(getUIState().mode || 'edit');
    applyLocale();
    applyUIOverrides();
    loadAsyncImages(document);
})(renderTimeline);

renderTweetDetail = ((orig) => function (tweetId) {
    orig(tweetId);
    ensureTopTools();
    ensureViewerSwitcher();
    fillAccountSelectors();
    renderViewerProfile();
    applyMode(getUIState().mode || 'edit');
    applyLocale();
    applyUIOverrides();
    loadAsyncImages(document);
})(renderTweetDetail);

if (!window.__v3EventsBound) {
    window.__v3EventsBound = true;

    document.addEventListener('click', async (e) => {
        const tweetLink = e.target.closest('a.tweet-link');
        if (tweetLink) {
            try {
                const href = tweetLink.getAttribute('href') || '';
                const url = new URL(href, window.location.href);
                if (url.pathname.endsWith('/STORY_FOR_CREATORS.md')) {
                    e.preventDefault();
                    e.stopPropagation();
                    openStoryModal();
                    return;
                }
            } catch {
                // ignore
            }
        }

        const viewerSwitcherBtn = e.target.closest('.user-profile .more-icon');
        if (viewerSwitcherBtn) {
            e.preventDefault();
            e.stopPropagation();
            const menu = document.getElementById('viewer-switcher-menu');
            if (menu && menu.style.display === 'block') {
                closeViewerSwitcher();
            } else {
                openViewerSwitcher(viewerSwitcherBtn);
            }
            return;
        }

        const viewerSwitchItem = e.target.closest('.viewer-switcher-item[data-account-id]');
        if (viewerSwitchItem) {
            e.preventDefault();
            e.stopPropagation();
            const accountId = viewerSwitchItem.dataset.accountId;
            setDefaultAuthorId(accountId);
            setComposeAuthorId(accountId);
            fillAccountSelectors();
            renderViewerProfile();
            closeViewerSwitcher();
            if (currentView === 'timeline') renderTimeline();
            if (currentView === 'detail') renderTweetDetail(currentTweetId);
            return;
        }

        const viewerManageBtn = e.target.closest('.viewer-switcher-manage');
        if (viewerManageBtn) {
            e.preventDefault();
            e.stopPropagation();
            renderAccountManager();
            document.getElementById('account-manager-modal')?.classList.add('active');
            closeViewerSwitcher();
            return;
        }

        if (!e.target.closest('#viewer-switcher-menu')) {
            closeViewerSwitcher();
        }

        const guideHideBtn = e.target.closest('.guide-hide-btn[data-tweet-id]');
        if (guideHideBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.setGuideTweetHidden === 'function') {
                window.setGuideTweetHidden(true);
            }
            if (currentView === 'timeline') {
                renderTimeline();
            } else {
                showTimeline();
            }
            return;
        }

        const closeRelatedSortMenus = () => {
            document.querySelectorAll('.related-sort-menu').forEach(menu => {
                menu.hidden = true;
                const arrow = menu.closest('.related-sort')?.querySelector('.related-sort-arrow');
                if (arrow) arrow.setAttribute('aria-expanded', 'false');
            });
        };

        const relatedSortArrow = e.target.closest('.related-sort-arrow[data-action="toggle-related-sort-menu"]');
        if (relatedSortArrow) {
            e.preventDefault();
            e.stopPropagation();

            const sortRoot = relatedSortArrow.closest('.related-sort');
            const menu = sortRoot?.querySelector('.related-sort-menu');
            if (!menu) return;

            const willOpen = !!menu.hidden;
            closeRelatedSortMenus();
            menu.hidden = !willOpen;
            relatedSortArrow.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            return;
        }

        const relatedSortOption = e.target.closest('.related-sort-option[data-action="set-related-sort"][data-sort]');
        if (relatedSortOption) {
            e.preventDefault();
            e.stopPropagation();
            const next = relatedSortOption.dataset.sort === 'date' ? 'date' : 'post';
            setTimelineSortMode(next);
            applyLocale();
            closeRelatedSortMenus();
            if (currentView === 'timeline') renderTimeline();
            if (currentView === 'detail') renderTweetDetail(currentTweetId);
            return;
        }

        if (!e.target.closest('.related-sort')) {
            closeRelatedSortMenus();
        }

        const composeMediaRemoveBtn = e.target.closest('.composer-media-remove-btn[data-media-index]');
        if (composeMediaRemoveBtn && !composeMediaRemoveBtn.classList.contains('reply-media-remove-btn')) {
            e.preventDefault();
            e.stopPropagation();
            const mediaIndex = parseInt(composeMediaRemoveBtn.dataset.mediaIndex, 10);
            if (Number.isNaN(mediaIndex)) return;
            composeDraftMediaIds.splice(mediaIndex, 1);
            renderComposeMediaPreview();
            updateComposeSubmitState();
            return;
        }

        const replyMediaUploadBtn = e.target.closest('.reply-media-upload-btn[data-tweet-id]');
        if (replyMediaUploadBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (appMode === 'view') return;

            const tweetId = parseInt(replyMediaUploadBtn.dataset.tweetId, 10);
            const parentReplyId = replyMediaUploadBtn.dataset.parentReplyId
                ? parseInt(replyMediaUploadBtn.dataset.parentReplyId, 10)
                : null;
            const draft = getReplyDraft(tweetId, Number.isNaN(parentReplyId) ? null : parentReplyId);
            const remain = Math.max(0, 4 - draft.mediaIds.length);
            if (remain <= 0) return;

            const ids = await pickImagesAndStore(remain);
            if (!ids.length) return;
            draft.mediaIds = [...draft.mediaIds, ...ids].slice(0, 4);
            renderReplyMediaPreview(tweetId, Number.isNaN(parentReplyId) ? null : parentReplyId);
            return;
        }

        const replyMediaRemoveBtn = e.target.closest('.reply-media-remove-btn[data-tweet-id][data-media-index]');
        if (replyMediaRemoveBtn) {
            e.preventDefault();
            e.stopPropagation();
            const tweetId = parseInt(replyMediaRemoveBtn.dataset.tweetId, 10);
            const mediaIndex = parseInt(replyMediaRemoveBtn.dataset.mediaIndex, 10);
            const parentReplyId = replyMediaRemoveBtn.dataset.parentReplyId
                ? parseInt(replyMediaRemoveBtn.dataset.parentReplyId, 10)
                : null;
            if (Number.isNaN(tweetId) || Number.isNaN(mediaIndex)) return;
            const keyParent = Number.isNaN(parentReplyId) ? null : parentReplyId;
            const draft = getReplyDraft(tweetId, keyParent);
            draft.mediaIds.splice(mediaIndex, 1);
            renderReplyMediaPreview(tweetId, keyParent);
            return;
        }

        const nestedToggleBtn = e.target.closest('.reply-thread-toggle-btn[data-action="toggle-nested-reply"][data-tweet-id][data-reply-id]');
        if (nestedToggleBtn) {
            if (e.target.closest('.editable-number')) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const tweetId = parseInt(nestedToggleBtn.dataset.tweetId, 10);
            const replyId = parseInt(nestedToggleBtn.dataset.replyId, 10);
            const thread = document.querySelector(`.reply-thread[data-tweet-id="${tweetId}"][data-reply-id="${replyId}"]`);
            const compose = thread?.querySelector(`.nested-reply-compose[data-parent-reply-id="${replyId}"]`);
            if (!thread || !compose) return;
            const nextOpen = !compose.classList.contains('active');
            compose.classList.toggle('active', nextOpen);
            const nestedReplies = thread.querySelector('.nested-replies');
            const hasChildren = !!(nestedReplies && nestedReplies.children.length > 0);
            thread.classList.toggle('has-nested', nextOpen || hasChildren);
            if (nextOpen) {
                const input = compose.querySelector('.nested-reply-input');
                input?.focus();
                input?.select?.();
                input?.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }

        const mediaRemoveBtn = e.target.closest('.media-remove-btn[data-tweet-id][data-media-index]');
        if (mediaRemoveBtn) {
            e.preventDefault();
            e.stopPropagation();
            const tweetId = parseInt(mediaRemoveBtn.dataset.tweetId, 10);
            const mediaIndex = parseInt(mediaRemoveBtn.dataset.mediaIndex, 10);
            const tweet = currentData.find(tw => tw.id === tweetId);
            if (!tweet) return;
            const images = getTweetMediaImages(tweet);
            images.splice(mediaIndex, 1);
            setTweetMediaImages(tweet, images);
            saveData(currentData);
            currentView === 'timeline' ? renderTimeline() : renderTweetDetail(currentTweetId);
            return;
        }

        const mediaUploadBtn = e.target.closest('.media-upload-btn[data-tweet-id]');
        if (mediaUploadBtn) {
            e.preventDefault();
            e.stopPropagation();
            const tweetId = parseInt(mediaUploadBtn.dataset.tweetId, 10);
            const tweet = currentData.find(tw => tw.id === tweetId);
            if (!tweet) return;

            editingElement = mediaUploadBtn;
            editingField = 'media';
            editingTweetId = tweetId;
            editingReplyId = null;
            imageEditMode = 'media';
            openImageModal(true);
            return;
        }

        const translationToggleBtn = e.target.closest('.translation-toggle-btn[data-tweet-id]');
        if (translationToggleBtn) {
            e.preventDefault();
            e.stopPropagation();
            const tweetId = parseInt(translationToggleBtn.dataset.tweetId, 10);
            const tweet = currentData.find(tw => tw.id === tweetId);
            if (!tweet) return;
            if (!tweet.translation) tweet.translation = { text: '', source: getDefaultTranslationSource(), visible: true };
            tweet.translation.visible = !(tweet.translation.visible !== false);
            saveData(currentData);
            currentView === 'timeline' ? renderTimeline() : renderTweetDetail(currentTweetId);
            return;
        }

        const replyTranslationToggleBtn = e.target.closest('.reply-translation-toggle-btn[data-tweet-id][data-reply-id]');
        if (replyTranslationToggleBtn) {
            e.preventDefault();
            e.stopPropagation();
            const tweetId = parseInt(replyTranslationToggleBtn.dataset.tweetId, 10);
            const replyId = parseInt(replyTranslationToggleBtn.dataset.replyId, 10);
            const tweet = currentData.find(tw => tw.id === tweetId);
            const reply = tweet ? findReplyById(tweet, replyId) : null;
            if (!reply) return;
            if (!reply.translation) reply.translation = { text: '', source: getDefaultTranslationSource(), visible: true };
            reply.translation.visible = !(reply.translation.visible !== false);
            saveData(currentData);
            renderTweetDetail(tweetId);
            return;
        }

        const likeBtn = e.target.closest('.action-btn.like[data-like-target][data-tweet-id]');
        if (likeBtn) {
            if (e.target.closest('.editable-number')) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const tweetId = parseInt(likeBtn.dataset.tweetId, 10);
            const replyId = likeBtn.dataset.likeTarget === 'reply'
                ? parseInt(likeBtn.dataset.replyId, 10)
                : null;
            const ok = toggleLikeState(tweetId, Number.isNaN(replyId) ? null : replyId);
            if (!ok) return;
            if (replyId) {
                renderTweetDetail(tweetId);
            } else {
                currentView === 'timeline' ? renderTimeline() : renderTweetDetail(currentTweetId);
            }
            return;
        }

        const followBtn = e.target.closest('.follow-btn');
        if (followBtn) {
            e.preventDefault();
            e.stopPropagation();
            const followed = followBtn.classList.toggle('following');
            followBtn.textContent = followed ? t('followingAction') : t('followAction');
            return;
        }

        const nestedReplyBtn = e.target.closest('.nested-reply-btn[data-tweet-id][data-parent-reply-id]');
        if (nestedReplyBtn) {
            e.preventDefault();
            e.stopPropagation();
            submitNestedReply(parseInt(nestedReplyBtn.dataset.tweetId, 10), parseInt(nestedReplyBtn.dataset.parentReplyId, 10));
            return;
        }

        const replyBtn = e.target.closest('.reply-btn[data-tweet-id]');
        if (replyBtn && !replyBtn.classList.contains('nested-reply-btn')) {
            e.preventDefault();
            submitInlineReply(parseInt(replyBtn.dataset.tweetId, 10));
            return;
        }

        const accountActionBtn = e.target.closest('.account-action-btn[data-action]');
        if (accountActionBtn) {
            const row = accountActionBtn.closest('.account-manager-item');
            const accountId = row?.dataset.accountId;
            const account = getAccounts().find(a => a.id === accountId);
            if (!account) return;

            const action = accountActionBtn.dataset.action;
            if (action === 'edit') {
                const name = prompt(t('promptAccountName'), account.name || '');
                if (name === null) return;
                const handle = prompt(t('promptAccountHandle'), account.handle || '');
                if (handle === null) return;
                const updated = upsertAccount({ ...account, name: name.trim() || account.name, handle: handle.trim() || account.handle });
                applyAccountChangesToTweets(updated);
                renderAccountManager();
                fillAccountSelectors();
                renderTimeline();
            }
            if (action === 'avatar') {
                selectAndSaveAvatar(account);
            }
            if (action === 'delete') {
                if (!confirm(ti('confirmDeleteAccount', { name: account.name || '', handle: account.handle || '' }))) return;
                removeAccount(account.id);
                currentData.forEach(tw => {
                    if (tw.user?.accountId === account.id) tw.user.accountId = null;
                    walkReplyTree(tw.replies || [], r => { if (r.user?.accountId === account.id) r.user.accountId = null; });
                });
                saveData(currentData);
                renderAccountManager();
                fillAccountSelectors();
                renderTimeline();
            }
            return;
        }
    }, true);

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const nested = e.target.closest('.nested-reply-input[data-tweet-id][data-parent-reply-id]');
        if (nested) {
            e.preventDefault();
            submitNestedReply(parseInt(nested.dataset.tweetId, 10), parseInt(nested.dataset.parentReplyId, 10));
            return;
        }
        const input = e.target.closest('.reply-input[data-tweet-id]');
        if (!input) return;
        e.preventDefault();
        submitInlineReply(parseInt(input.dataset.tweetId, 10));
    });
}

window.toggleAppMode = toggleAppMode;
window.exportHtmlSnapshot = exportHtmlSnapshot;
