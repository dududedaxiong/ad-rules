(() => {
    const g = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;
    var c = g.YYKM.fetch("https://live.ottiptv.cc/iptv.m3u?userid=5464346556&sign=25ea864f3e810344b62f867fc74d45773b80a171b11777b0015a2604734c4fd9a59f038acd4ac5c7caa8c06eb5a66cd8a60cdd66b4c87fa187c518e40d7bf5eccf1a164a2e58c8&auth_token=0502282be476cd93610594ed29cb967c#sp;ua=okhttp");
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