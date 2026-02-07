/**
 * 月読 Tsukuyomi Simulator - 示例数据
 *
 * 时间背景：2040 年 9 月 10 日前后
 * 说明：你可以直接改这里的默认推文，首次加载会自动写入本地状态。
 */

// 数据版本号 - 每次更新默认数据时递增
const DATA_VERSION = 13;

// 示例推文数据
const tweetsData = [
    {
        id: 900001,
        isGuide: true,
        isPinned: true,
        user: {
            name: "色々",
            handle: "@nihoheYCY",
            avatar: "assets/default/avatars/avatar-nihohecy.jpg",
            verified: false
        },
        content: "【新手必读｜先看这里】\n\n⚠️ 本页内容是《超时空辉夜姬！》同人相关模拟器演示，不代表真实 SNS。\n\n✅ 最简单的用法（先记住这两句就够了）：\n1. 在「编辑模式」创建账户、发布推、编辑内容。\n2. 切换到「查看模式」，把页面分享给别人看。\n\n📝 建议的新手顺序：\n0. 先看完这条教程推；如果你把它隐藏了，点击左侧/上方「通知」按钮可再次显示。\n1. 先确认你在「编辑模式」（更多 -> 模式切换）。\n2. 先改账号，再发帖，再改回复，最后导出保存。\n\n【1）先认界面：三栏分别做什么】\n- 左侧：导航与工具入口（更多、模式切换、导入导出）\n- 中间：时间线与帖子详情（发帖、回复、编辑）\n- 右侧：搜索过滤、趋势词、推荐关注\n\n【2）账号系统怎么用（最重要）】\n- 浏览账号：决定左下角和个人区显示谁\n- 发帖账号：决定“你这条帖/回复”是谁发的\n- 入口：更多 -> 浏览账号 -> 账户管理\n推荐用法：先把角色账号都建好，再开始写剧情贴。\n\n【3）发一条新推（最常用）】\n- 在主页顶部输入框写正文\n- 可选：上传配图、填写时间、加翻译\n- 点「发帖」即可\n推荐用法：时间建议写完整（年/月/日/时/分），回看排序更清楚。\n\n【4）回复与楼中楼】\n- 点进某条帖子详情，在回复框发布回复\n- 对某条回复继续回复，就是楼中楼\n- 现在支持：回复配图 + 回复时间\n推荐用法：把“角色对话”拆成多层回复，剧情更像真实时间线。\n\n【5）编辑能力：你可以改哪些】\n- 文本：昵称、ID、正文、翻译文本、翻译来源、时间\n- 数字：评论/转推/点赞/浏览等计数\n- 图片：头像、帖子配图、回复配图\n注意：改“单条推头像”时，可勾选是否同步为账号头像。\n\n【6）搜索与过滤】\n- 右侧搜索支持：作者名、ID、正文、翻译、时间关键词\n推荐用法：长项目里用角色名或标签快速定位帖子。\n\n【7）导入导出与分发】\n- 导出数据：JSON（项目主格式，可导入恢复）\n- 导出HTML：静态快照（展示用）\n推荐用法：每次大改后导出一份 JSON 备份。\n\n【8）图片与存储说明（很关键）】\n- 项目状态存在浏览器本地存储（IndexedDB + localStorage）\n- 换浏览器/清缓存会丢失本地状态\n- 想给别人“第一次打开就看到同样内容”，请把默认图片放进项目 assets，并写入默认数据\n\n【推荐工作流（给新手）】\n1. 建账号 -> 2. 发主帖 -> 3. 补回复/楼中楼 -> 4. 调整数字与时间 -> 5. 导出 JSON 备份\n\n【同人声明与版权】\n- 同人设定说明：见 [STORY_FOR_CREATORS](STORY_FOR_CREATORS.md)（点击弹窗）\n- [@lofter：古法呛面馒头](https://gufaqiangmianmantou.lofter.com)\n- [@小红书：幼儿园老大](https://xhslink.com/m/GI5hv5bP5d)\n\n《超时空辉夜姬！》真的太棒了！",
        media: null,
        time: "下午 1:00 · 2040年9月8日",
        views: "1.2万",
        stats: {
            comments: 12,
            retweets: 38,
            likes: 226,
            bookmarks: 119
        },
        translation: null,
        replies: []
    },
    {
        id: 1,
        user: {
            name: "ヤチヨ🌙",
            handle: "@yachi8000",
            avatar: "assets/default/avatars/avatar-yachiyo.jpg",
            verified: true
        },
        content: "【お知らせ】\n\n皆さん！！ 大ニュースです！\n\nなんと..私、かぐやちゃん、いろぷちゃんの三人で\n合同ライブを開催することになりました！！ 🎉🎉\n\n久しぶりにかぐやちゃんとステージに立てるのが\n本当に本当に嬉しいです...!\n\n詳細は後日発表します！\nぜひ見に来てくださいね！ ✨\n\n#三人ライブ #ヤチヨ #かぐや #いろぷ #合同ライブ",
        media: {
            type: "image",
            url: "assets/default/tweets/tweet-1-main.jpg",
            images: [
                "assets/default/tweets/tweet-1-main.jpg"
            ]
        },
        time: "下午 2:30 · 2040年9月10日",
        views: "642.5万",
        stats: {
            comments: 42735,
            retweets: 211500,
            likes: 780700,
            bookmarks: 62000
        },
        translation: {
            source: "日语",
            text: "【通知】\n\n大家！！ 有大新闻！\n\n竟然...我、辉夜酱、彩P三人\n将要举办联合Live！！ 🎉🎉\n\n能够再次和辉夜酱一起站在舞台上\n真的真的太高兴了...！\n\n详情将在日后公布！\n请一定要来看哦！ ✨\n\n#三人Live #八千代 #辉夜 #彩叶 #联合Live",
            visible: true
        },
        replies: []
    },
    {
        id: 2,
        user: {
            name: "🌶️ 月読ニュース",
            handle: "@tsukuyomi_news",
            avatar: "assets/default/avatars/avatar-tsukuyomi-news.jpg",
            verified: true
        },
        content: "【独占取材】東大具身知能研究所、世界初の画期的成果を達成\n\n酒寄いろぷ所長への独占インタビューによると、同研究所は人型ロボットの\n自律制御において、世界的なブレークスルーを実現したとのこと。\n\n「私たちの研究は、ロボットが人間のように自然に動き、考えることを可能\nにします」と酒寄所長は語った。\n\n#東大 #具身知能 #ロボット #AI研究 #酒寄いろぷ",
        media: {
            type: "image",
            url: "assets/default/tweets/tweet-2-main.jpg",
            images: [
                "assets/default/tweets/tweet-2-main.jpg"
            ]
        },
        time: "上午 8:45 · 2040年9月9日",
        views: "178.5万",
        stats: {
            comments: 3084,
            retweets: 18700,
            likes: 47750,
            bookmarks: 9130
        },
        translation: {
            source: "日语",
            text: "【独家采访】东大具身智能研究所取得世界首创的突破性成果\n\n根据对酒寄彩叶所长的独家采访，该研究所在人形机器人自主控制领域实现了世界级的突破。\n\n“我们的研究使机器人能够像人类一样自然地移动和思考”，酒寄所长如此说道。\n\n#东大 #具身智能 #机器人 #AI研究 #酒寄彩叶",
            visible: true
        },
        replies: []
    },
    {
        id: 3,
        user: {
            name: "彩輝激推し",
            handle: "@irokaguforever",
            avatar: "assets/default/avatars/avatar-irokaguforever.jpg",
            verified: false
        },
        content: "やっぱり私はいろかぐなんだよな...\n\nいろヤチヨも良いんだけど、やっぱりいろかぐには敵わない\nヤチヨごめん...😭\n\nだってさ、いろぷちゃん絶対0じゃん？？\nかぐやは完全に1だし\n\nこの組み合わせ最高すぎて毎日死んでる\n推しカプが尊すぎて生きるのが辛い\n\n#いろかぐ #彩輝 #いろぷ受け #かぐや攻め #尊い",
        media: null,
        time: "下午 11:23 · 2040年9月11日",
        views: "847",
        stats: {
            comments: 4,
            retweets: 12,
            likes: 45,
            bookmarks: 2
        },
        translation: {
            source: "日语",
            text: "果然我还是站彩辉啊...\n\n彩八千也不错，但果然还是比不过彩辉\n八千代对不起...😭\n\n因为，彩叶酱绝对是0吧？？\n辉夜完全是1啊\n\n这个组合太棒了，每天都在死去\n推的CP太神圣了，活着好辛苦\n\n#彩辉 #彩叶受 #辉夜攻 #尊死",
            visible: true
        },
        replies: [
            {
                id: 301,
                user: {
                    name: "かぐや",
                    handle: "@kaguya",
                    avatar: "assets/default/avatars/avatar-kaguya.jpg",
                    verified: true
                },
                content: "わかるわかる！！！ さすがですね〜！ 私も絶対かぐやは1だと思いますっ！！ ✨ ていうか当たり前じゃないですかっ！？！？",
                translation: {
                    source: "日语",
                    text: "懂懂懂！！！ 不愧是你～！ 我也觉得辉夜绝对是1！！ ✨ 这不是理所当然的吗！？！？",
                    visible: true
                },
                time: "下午 11:25 · 2040年9月11日",
                stats: {
                    comments: 0,
                    retweets: 0,
                    likes: 18,
                    bookmarks: 0,
                    views: 18
                }
            },
            {
                id: 302,
                user: {
                    name: "彩輝激推し",
                    handle: "@irokaguforever",
                    avatar: "assets/default/avatars/avatar-irokaguforever.jpg",
                    verified: false
                },
                content: "え？？？ ご本人？？？",
                translation: {
                    source: "日语",
                    text: "诶？？？ 本人？？？",
                    visible: true
                },
                time: "下午 11:26 · 2040年9月11日",
                stats: {
                    comments: 0,
                    retweets: 0,
                    likes: 1,
                    bookmarks: 0,
                    views: 14
                }
            },
            {
                id: 303,
                user: {
                    name: "かぐや",
                    handle: "@kaguya",
                    avatar: "assets/default/avatars/avatar-kaguya.jpg",
                    verified: true
                },
                content: "本人じゃないです！！！ 忘れてください！！！",
                translation: {
                    source: "日语",
                    text: "不是本人！！！ 请务必忘掉！！！",
                    visible: true
                },
                time: "下午 11:27 · 2040年9月11日",
                stats: {
                    comments: 1,
                    retweets: 0,
                    likes: 5,
                    bookmarks: 0,
                    views: 23
                }
            },
            {
                id: 304,
                user: {
                    name: "彩輝激推し",
                    handle: "@irokaguforever",
                    avatar: "assets/default/avatars/avatar-irokaguforever.jpg",
                    verified: false
                },
                content: "じゃあ、かぐやちゃんやっぱり攻めだよね！！！",
                translation: {
                    source: "日语",
                    text: "所以，辉夜酱真的是1对吧！！！",
                    visible: true
                },
                time: "下午 11:28 · 2040年9月11日",
                stats: {
                    comments: 0,
                    retweets: 0,
                    likes: 0,
                    bookmarks: 0,
                    views: 0
                }
            }
        ]
    }
];

// 主状态使用 IndexedDB 存储，仅保留 locale/sort 在 localStorage
const APP_DB_NAME = 'TwitterSimulatorDB';
const APP_DB_VERSION = 2;
const APP_STATE_STORE = 'appState';
const APP_STATE_RECORD_KEY = 'current';
const LEGACY_APP_STATE_KEY = 'twitter-simulator-state';
const LEGACY_APP_STATE_COMPAT_KEYS = [
    'twitter-simulator-state',
    'twitter-simulator-data',
    'twitter-simulator-version'
];

let unifiedAppState = null;
let appStateDBPromise = null;
let appStateReadyPromise = null;
let persistQueue = Promise.resolve();

function cloneDeep(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function mergeDeep(base, override) {
    if (override === undefined || override === null) return cloneDeep(base);
    if (Array.isArray(base) && Array.isArray(override)) {
        const isObjWithId = (item) => item && typeof item === 'object' && !Array.isArray(item) && item.id !== undefined && item.id !== null;
        const canMergeById = base.every(isObjWithId) && override.every(isObjWithId);
        if (!canMergeById) return cloneDeep(override);

        const overrideMap = new Map(override.map(item => [item.id, item]));
        const baseIds = new Set(base.map(item => item.id));

        const merged = base.map(baseItem => {
            const overrideItem = overrideMap.get(baseItem.id);
            if (!overrideItem) return cloneDeep(baseItem);
            return mergeDeep(baseItem, overrideItem);
        });

        for (const overrideItem of override) {
            if (!baseIds.has(overrideItem.id)) merged.push(cloneDeep(overrideItem));
        }
        return merged;
    }

    if (base === null || typeof base !== 'object' || Array.isArray(base)) return cloneDeep(override);
    if (typeof override !== 'object' || Array.isArray(override)) return cloneDeep(override);

    const merged = { ...cloneDeep(base) };
    for (const key of Object.keys(override)) {
        merged[key] = mergeDeep(base[key], override[key]);
    }
    return merged;
}

function mergeTweets(defaultTweets, savedTweets) {
    const safeSavedTweets = Array.isArray(savedTweets) ? savedTweets : [];
    const savedMap = new Map(safeSavedTweets.map(tweet => [tweet.id, tweet]));
    const defaultIds = new Set(defaultTweets.map(tweet => tweet.id));

    const merged = defaultTweets.map(defaultTweet => {
        // 教程推始终使用最新版默认内容（避免旧缓存/旧存储导致教程过期）
        // 但保留用户可能添加的回复（不破坏本地数据）。
        if (defaultTweet && defaultTweet.isGuide) {
            const savedTweet = savedMap.get(defaultTweet.id);
            const next = cloneDeep(defaultTweet);
            if (savedTweet && Array.isArray(savedTweet.replies) && savedTweet.replies.length) {
                next.replies = cloneDeep(savedTweet.replies);
            }
            return next;
        }
        const savedTweet = savedMap.get(defaultTweet.id);
        if (!savedTweet) return cloneDeep(defaultTweet);
        return mergeDeep(defaultTweet, savedTweet);
    });

    for (const savedTweet of safeSavedTweets) {
        if (!defaultIds.has(savedTweet.id)) merged.push(cloneDeep(savedTweet));
    }

    return merged;
}

function buildAccountIdByHandle(handle) {
    const normalized = (handle || '').trim().toLowerCase().replace('@', '');
    if (!normalized) return `acc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return `acc_${normalized.replace(/[^a-z0-9_]/g, '_')}`;
}

function inferAccountsFromTweets(tweets) {
    const accountsMap = new Map();

    const upsertFromUser = (user) => {
        if (!user || !user.handle) return;
        const id = user.accountId || buildAccountIdByHandle(user.handle);
        const existing = accountsMap.get(id);
        accountsMap.set(id, {
            id,
            name: user.name || (existing ? existing.name : ''),
            handle: user.handle,
            avatar: user.avatar || (existing ? existing.avatar : ''),
            verified: !!user.verified,
            updatedAt: Date.now()
        });
        user.accountId = id;
    };

    const walkReplies = (replies) => {
        if (!Array.isArray(replies)) return;
        for (const reply of replies) {
            upsertFromUser(reply.user);
            walkReplies(reply.replies);
        }
    };

    for (const tweet of tweets) {
        upsertFromUser(tweet.user);
        walkReplies(tweet.replies);
    }

    return Array.from(accountsMap.values());
}

function mergeAccounts(inferredAccounts, savedAccounts) {
    const merged = new Map();
    for (const account of inferredAccounts || []) merged.set(account.id, account);
    for (const account of (Array.isArray(savedAccounts) ? savedAccounts : [])) {
        if (!account || !account.id) continue;
        const base = merged.get(account.id) || {};
        const next = { ...base, ...account };
        if ((account.avatar === '' || account.avatar === null || account.avatar === undefined) && base.avatar) {
            next.avatar = base.avatar;
        }
        merged.set(account.id, next);
    }
    return Array.from(merged.values());
}

const DEFAULT_EXTRA_ACCOUNTS = [
    {
        id: buildAccountIdByHandle('@nihoheYCY'),
        name: '色々',
        handle: '@nihoheYCY',
        avatar: 'assets/default/avatars/avatar-nihohecy.jpg',
        verified: false
    }
];

function getDefaultState() {
    const initialAccounts = inferAccountsFromTweets(cloneDeep(tweetsData));
    for (const extra of DEFAULT_EXTRA_ACCOUNTS) {
        if (!initialAccounts.some(acc => acc.id === extra.id)) {
            initialAccounts.push({
                ...extra,
                updatedAt: Date.now()
            });
        }
    }
    const initialViewerId = initialAccounts[0]?.id || null;

    return {
        dataVersion: DATA_VERSION,
        tweets: cloneDeep(tweetsData),
        accounts: initialAccounts,
        ui: {
            mode: 'edit',
            textFields: {},
            avatarFields: {
                'follow-avatar-1': 'assets/default/ui/follow-1.jpg',
                'follow-avatar-2': 'assets/default/ui/follow-2.jpg',
                'follow-avatar-3': 'assets/default/ui/follow-3.jpg'
            },
            guideTweetHidden: false,
            defaultAuthorId: initialViewerId,
            composeAuthorId: initialViewerId
        }
    };
}

function buildNormalizedState(defaults, savedState) {
    const savedTweets = savedState && Array.isArray(savedState.tweets) ? savedState.tweets : [];
    const mergedTweets = mergeTweets(defaults.tweets, savedTweets);
    const baseAccounts = Array.isArray(defaults.accounts) ? defaults.accounts : [];
    const mergedAccounts = mergeAccounts(
        baseAccounts,
        savedState && Array.isArray(savedState.accounts) ? savedState.accounts : []
    );
    const fallbackViewerId = mergedAccounts[0]?.id || null;

    return {
        dataVersion: DATA_VERSION,
        tweets: mergedTweets,
        accounts: mergedAccounts,
        ui: {
            mode: savedState?.ui?.mode === 'view' ? 'view' : 'edit',
            textFields: {
                ...(defaults.ui?.textFields || {}),
                ...(savedState?.ui?.textFields || {})
            },
            avatarFields: {
                ...(defaults.ui?.avatarFields || {}),
                ...(savedState?.ui?.avatarFields || {})
            },
            guideTweetHidden: savedState?.ui?.guideTweetHidden === true,
            defaultAuthorId: savedState?.ui?.defaultAuthorId || fallbackViewerId,
            composeAuthorId: savedState?.ui?.composeAuthorId || savedState?.ui?.defaultAuthorId || fallbackViewerId
        }
    };
}

function clearLegacyAppStateKeys() {
    for (const key of LEGACY_APP_STATE_COMPAT_KEYS) {
        localStorage.removeItem(key);
    }
}

function readLegacyStateFromLocalStorage() {
    try {
        const raw = localStorage.getItem(LEGACY_APP_STATE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
        console.error('Failed to parse legacy app state:', e);
        return null;
    }
}

function openAppStateDB() {
    if (appStateDBPromise) return appStateDBPromise;

    appStateDBPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(APP_DB_NAME, APP_DB_VERSION);

        request.onerror = (event) => {
            console.error('Failed to open app state DB:', event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('images')) {
                db.createObjectStore('images');
            }
            if (!db.objectStoreNames.contains(APP_STATE_STORE)) {
                db.createObjectStore(APP_STATE_STORE);
            }
        };
    });

    return appStateDBPromise;
}

async function readPersistedState() {
    const db = await openAppStateDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([APP_STATE_STORE], 'readonly');
        const store = tx.objectStore(APP_STATE_STORE);
        const request = store.get(APP_STATE_RECORD_KEY);

        request.onsuccess = (event) => resolve(event.target.result || null);
        request.onerror = (event) => reject(event.target.error);
    });
}

async function writePersistedState(state) {
    const db = await openAppStateDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([APP_STATE_STORE], 'readwrite');
        const store = tx.objectStore(APP_STATE_STORE);
        const request = store.put(cloneDeep(state), APP_STATE_RECORD_KEY);

        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

function scheduleStatePersist(state) {
    const snapshot = cloneDeep(state);
    persistQueue = persistQueue
        .then(() => writePersistedState(snapshot))
        .catch((err) => {
            console.error('Failed to persist app state:', err);
        });
    return persistQueue;
}

async function loadUnifiedState() {
    const defaults = getDefaultState();
    let savedState = null;
    let hasLegacyState = false;

    try {
        savedState = await readPersistedState();
    } catch (e) {
        console.error('Failed to read persisted app state:', e);
    }

    if (!savedState) {
        const legacy = readLegacyStateFromLocalStorage();
        if (legacy) {
            savedState = legacy;
            hasLegacyState = true;
        }
    }

    const state = buildNormalizedState(defaults, savedState);

    unifiedAppState = state;
    await scheduleStatePersist(state);
    if (hasLegacyState) {
        clearLegacyAppStateKeys();
    }
    return state;
}

function saveUnifiedState(state) {
    unifiedAppState = state;
    currentData = cloneDeep(state.tweets);
    scheduleStatePersist(state);
    return cloneDeep(state);
}

function loadData() {
    const state = unifiedAppState || getDefaultState();
    return cloneDeep(state.tweets);
}

function saveData(data) {
    const state = unifiedAppState || getDefaultState();
    state.tweets = cloneDeep(data);
    saveUnifiedState(state);
}

function getAccounts() {
    const state = unifiedAppState || getDefaultState();
    return cloneDeep(state.accounts);
}

function upsertAccount(account) {
    const state = unifiedAppState || getDefaultState();
    const idx = state.accounts.findIndex(item => item.id === account.id);
    const payload = {
        ...account,
        updatedAt: Date.now()
    };
    if (idx >= 0) state.accounts[idx] = { ...state.accounts[idx], ...payload };
    else state.accounts.push(payload);
    saveUnifiedState(state);
    return payload;
}

function setUITextField(field, value) {
    const state = unifiedAppState || getDefaultState();
    state.ui.textFields[field] = value;
    saveUnifiedState(state);
}

function setUIAvatarField(field, value) {
    const state = unifiedAppState || getDefaultState();
    state.ui.avatarFields[field] = value;
    saveUnifiedState(state);
}

function getUIState() {
    const state = unifiedAppState || getDefaultState();
    return cloneDeep(state.ui);
}

function setDefaultAuthorId(accountId) {
    const state = unifiedAppState || getDefaultState();
    state.ui.defaultAuthorId = accountId || null;
    saveUnifiedState(state);
}

function setComposeAuthorId(accountId) {
    const state = unifiedAppState || getDefaultState();
    state.ui.composeAuthorId = accountId || null;
    saveUnifiedState(state);
}

function setAppMode(mode) {
    const state = unifiedAppState || getDefaultState();
    state.ui.mode = mode === 'view' ? 'view' : 'edit';
    saveUnifiedState(state);
}

function setGuideTweetHidden(hidden) {
    const state = unifiedAppState || getDefaultState();
    state.ui.guideTweetHidden = hidden === true;
    saveUnifiedState(state);
}

currentData = cloneDeep(getDefaultState().tweets);
appStateReadyPromise = loadUnifiedState()
    .then((state) => {
        currentData = cloneDeep(state.tweets);
        return cloneDeep(state);
    })
    .catch((err) => {
        console.error('Failed to initialize app state, fallback to defaults:', err);
        const fallback = getDefaultState();
        unifiedAppState = fallback;
        currentData = cloneDeep(fallback.tweets);
        return cloneDeep(fallback);
    });

window.getAccounts = getAccounts;
window.upsertAccount = upsertAccount;
window.setUITextField = setUITextField;
window.setUIAvatarField = setUIAvatarField;
window.getUIState = getUIState;
window.setDefaultAuthorId = setDefaultAuthorId;
window.setComposeAuthorId = setComposeAuthorId;
window.setAppMode = setAppMode;
window.buildAccountIdByHandle = buildAccountIdByHandle;
window.ensureAppStateReady = () => appStateReadyPromise || Promise.resolve(cloneDeep(unifiedAppState || getDefaultState()));
window.setGuideTweetHidden = setGuideTweetHidden;

function removeAccount(accountId) {
    const state = unifiedAppState || getDefaultState();
    state.accounts = state.accounts.filter(account => account.id !== accountId);
    const fallbackId = state.accounts[0]?.id || null;
    if (state.ui.defaultAuthorId === accountId) {
        state.ui.defaultAuthorId = fallbackId;
    }
    if (state.ui.composeAuthorId === accountId) {
        state.ui.composeAuthorId = fallbackId;
    }
    saveUnifiedState(state);
}

window.removeAccount = removeAccount;

function replaceProjectState(payload) {
    const defaults = getDefaultState();
    const state = {
        dataVersion: DATA_VERSION,
        tweets: Array.isArray(payload?.tweets) ? cloneDeep(payload.tweets) : cloneDeep(defaults.tweets),
        accounts: Array.isArray(payload?.accounts) ? cloneDeep(payload.accounts) : [],
        ui: {
            mode: payload?.ui?.mode === 'view' ? 'view' : 'edit',
            textFields: {
                ...(defaults.ui?.textFields || {}),
                ...(payload?.ui?.textFields || {})
            },
            avatarFields: {
                ...(defaults.ui?.avatarFields || {}),
                ...(payload?.ui?.avatarFields || {})
            },
            guideTweetHidden: payload?.ui?.guideTweetHidden === true,
            defaultAuthorId: payload?.ui?.defaultAuthorId || null,
            composeAuthorId: payload?.ui?.composeAuthorId || payload?.ui?.defaultAuthorId || null
        }
    };
    saveUnifiedState(state);
    currentData = cloneDeep(state.tweets);
    return cloneDeep(state);
}

window.replaceProjectState = replaceProjectState;
