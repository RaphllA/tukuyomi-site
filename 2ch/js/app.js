class App {
    constructor() {
        this.container = document.querySelector('.container');
        this.idMap = new Map(); // Store generated IDs for names
    }

    init() {
        const urlParams = new URLSearchParams(window.location.search);
        const threadId = urlParams.get('id');

        if (threadId) {
            // Thread Mode
            this.mode = 'thread';
            this.loadScript(`threads/${threadId}.js`);
        } else {
            // Index Mode
            this.mode = 'index';
            // If we are on index.html, load the index script.
            // If we are on thread.html but no ID, maybe redirect or show error?
            // Assuming index.html loads this then loads threads/index.js
            // But we need to handle the case where we might be on thread.html without ID.
            if (window.location.pathname.endsWith('thread.html')) {
                window.location.href = 'index.html';
                return;
            }
            this.loadScript('threads/index.js');
        }
    }

    loadScript(path) {
        const script = document.createElement('script');
        script.src = path;
        script.onerror = () => {
            this.container.innerHTML = `<p style="color:red">Error: Could not load ${path}. Check if the file exists.</p>`;
        };
        document.body.appendChild(script);
    }

    // Called by threads/index.js
    setThreadList(data) {
        if (this.mode !== 'index') return;

        // Sort threads by date (newest first), but always pin 'intro' to top
        const sortedThreads = [...data.threads].sort((a, b) => {
            // Pin intro thread to top
            if (a.id === 'intro') return -1;
            if (b.id === 'intro') return 1;

            // Parse date string - expected format: "YYYY/MM/DD(Day) HH:MM:SS.ms"
            const dateA = a.date ? new Date(a.date.replace(/\([^)]+\)/, '').replace(/\.\d+$/, '')) : new Date(0);
            const dateB = b.date ? new Date(b.date.replace(/\([^)]+\)/, '').replace(/\.\d+$/, '')) : new Date(0);
            return dateB - dateA; // Descending (newest first)
        });

        let html = `
            <header class="site-header">
                <h1 class="site-title">所长的谣言板</h1>
            </header>
            <div style="padding: 10px;">
                <table class="thread-table">
                    <thead>
                        <tr>
                            <th colspan="2" class="section-header">近期热帖</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        sortedThreads.forEach(thread => {
            const displayDate = this.convertToJapaneseDate(thread.date || '');
            html += `
                <tr>
                    <td><a href="thread.html?id=${thread.id}">${thread.title} (${thread.count})</a></td>
                    <td style="white-space:nowrap; text-align:right; color:#666;">${displayDate}</td>
                </tr>
            `;
        });

        html += `</tbody></table></div>`;
        this.container.innerHTML = html;
        document.title = "所长的谣言板";
    }

    // Called by threads/<id>.js
    setThreadData(data) {
        if (this.mode !== 'thread') return;

        document.title = data.title;

        // Header
        let html = `
            <div class="site-header">
                <a href="index.html" style="text-decoration:none; color: #CC0000;">&lt; 戻る</a>
            </div>
            <h1 class="thread-title">${data.title}</h1>
            <hr class="title-divider">
            <div class="posts">
        `;

        data.posts.forEach(post => {
            const processedBody = this.processBody(post.body);
            const uid = this.getOrGenerateId(post.uid, post.name);

            html += `
                <div class="post" id="post-${post.number}">
                    <div class="post-meta">
                        <span class="post-number">${post.number}</span> ：
                        <span class="post-name"><b>${post.name}</b></span>
                        <span class="post-date">${this.convertToJapaneseDate(post.date)}</span>
                        <span class="post-uid">${uid}</span>
                    </div>
                    <div class="post-body">
                        ${processedBody}
                    </div>
                </div>
            `;
        });

        html += `</div>`;

        // 2ch-style Footer Navigation
        html += `
            <div class="thread-footer">
                <a href="#" onclick="return false;">全部読む</a>
                <a href="#" onclick="return false;">最新50</a>
                <a href="#" onclick="return false;">1-100</a>
                <a href="index.html">この板の主なスレッド一覧</a>
                <a href="#" onclick="location.reload(); return false;">リロード</a>
            </div>
        `;

        this.container.innerHTML = html;
    }

    processBody(text) {
        if (!text) return '';

        // 1. Remove newlines before <div class="fake-trans"> to prevent huge gaps
        // If the user typed "...text\n\n<div...", we want to avoid double <br>
        let result = text.replace(/[\n\r\s]+(<div class="fake-trans">)/g, '$1');

        // 2. Newlines to <br> (for the rest of the text)
        result = result.replace(/\n/g, '<br>');

        // 3. Anchor Links (>>1)
        // Regex: &gt;&gt;(\d+) OR >>(\d+)
        result = result.replace(/(&gt;&gt;|>>)(\d+)/g, (match, p1, p2) => {
            return `<span class="anchor-link" onclick="app.scrollToPost(${p2})">&gt;&gt;${p2}</span>`;
        });

        return result;
    }

    convertToJapaneseDate(dateStr) {
        if (!dateStr) return '';
        // Convert English weekday to Japanese
        const weekdayMap = {
            'Mon': '月', 'Tue': '火', 'Wed': '水', 'Thu': '木',
            'Fri': '金', 'Sat': '土', 'Sun': '日'
        };
        return dateStr.replace(/\((Mon|Tue|Wed|Thu|Fri|Sat|Sun)\)/g, (match, day) => {
            return `(${weekdayMap[day]})`;
        });
    }

    scrollToPost(num) {
        const el = document.getElementById(`post-${num}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            el.style.backgroundColor = '#FFFFCC'; // Highlight
            setTimeout(() => { el.style.backgroundColor = 'transparent'; }, 2000);
        }
    }

    getOrGenerateId(uidInput, name) {
        // If uid is explicit (starts with ID:), return it.
        // If simply a "key" like "UserA", generate a consistent hash.
        if (uidInput.startsWith('ID:')) {
            return uidInput;
        }

        // Check cache
        if (this.idMap.has(uidInput)) {
            return this.idMap.get(uidInput);
        }

        // Generate semi-random ID based on the input key
        const randomStr = this.simpleHash(uidInput);
        const finalId = `ID:${randomStr}`;
        this.idMap.set(uidInput, finalId);
        return finalId;
    }

    simpleHash(str) {
        // Simple hash to get 8 chars
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        // Convert to base36 and take last 8 chars
        return Math.abs(hash).toString(36).substring(0, 8).toUpperCase().padEnd(8, 'X');
    }
}

// Initialize
window.app = new App();
document.addEventListener('DOMContentLoaded', () => {
    window.app.init();
});
