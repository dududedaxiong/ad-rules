(() => {
    const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;
    var content = global.YYKM.fetch("https://perfecttv.net/PerfecttvFree.m3u#sp;ua=okhttp");
    
    const lines = content.split('\n');
    const processedLines = lines.map(line => {
        let trimLine = line.trim();
        if (!trimLine || trimLine.startsWith("#EXTM3U")) return line;

        // M3U 属性行：只换第一个逗号后的频道名部分
        if (trimLine.startsWith("#EXTINF:")) {
            let firstCommaIndex = line.indexOf(",");
            if (firstCommaIndex !== -1) {
                let prefix = line.substring(0, firstCommaIndex + 1); 
                let target = line.substring(firstCommaIndex + 1);
                target = target.replaceAll("video://", "webview://");
            target = target.replaceAll("http://A/ku9/js/webview.js?id=", "webview://");
            
                return prefix + target;
            }
        }

        // 普通格式 (名,链接) 或 纯链接行：整行参与匹配替换
        if ((trimLine.includes(",") && !trimLine.startsWith("#")) || /^(http|https|rtp|p3p|rtsp|mitv|video|webview):\/\//i.test(trimLine)) {
            let target = line;
            target = target.replaceAll("video://", "webview://");
            target = target.replaceAll("http://A/ku9/js/webview.js?id=", "webview://");
            
            return target;
        }

        return line;
    });

    return processedLines.join('\n');
})();