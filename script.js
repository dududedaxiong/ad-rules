(() => {
    const g = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;
    var c = g.YYKM.fetch("https://img.131213.xyz/tfile/BQACAgUAAx0Eflp52gABASORaXdbpO0p7IMpTiebDJy6u4WwxewAAq4aAAIKH7lXS88ZiCssf4Q4BA#sp;ua=okhttp");
    return c.split('\n').map(l => {
        let t = l.trim();
        if (!t || t.startsWith("#EXTM3U")) return l;
        if (t.startsWith("#EXTINF:")) {
            let i = l.indexOf(",");
            if (i !== -1) {
                let prefix = l.substring(0, i + 1), target = l.substring(i + 1);
                target = target.replaceAll("video://", "webview://");
            target = target.replaceAll("http://A/ku9/js/webview.js?id=", "webview://");
            
                return prefix + target;
            }
        }
        if ((t.includes(",") && !t.startsWith("#")) || /^(http|https|rtp|p3p|rtsp|mitv|video|webview):\/\//i.test(t)) {
            let target = l;
            target = target.replaceAll("video://", "webview://");
            target = target.replaceAll("http://A/ku9/js/webview.js?id=", "webview://");
            
            return target;
        }
        return l;
    }).join('\n');
})();