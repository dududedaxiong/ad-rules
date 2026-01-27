(() => {
    const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;
    var content = global.YYKM.fetch("https://perfecttv.net/PerfecttvFree.m3u#sp;ua=okhttp");
    const lines = content.split('\n');
    return lines.map(line => {
        let trimLine = line.trim();
        if (!trimLine || trimLine.startsWith("#EXTM3U")) return line;
        if (trimLine.startsWith("#EXTINF:")) {
            let firstCommaIndex = line.indexOf(",");
            if (firstCommaIndex !== -1) {
                let prefix = line.substring(0, firstCommaIndex + 1); 
                let target = line.substring(firstCommaIndex + 1);
                target = target.replaceAll("video://", "webview://");
                
                return prefix + target;
            }
        }
        if ((trimLine.includes(",") && !trimLine.startsWith("#")) || /^(http|https|rtp|p3p|rtsp|mitv|video|webview):\/\//i.test(trimLine)) {
            let target = line;
            target = target.replaceAll("video://", "webview://");
                
            return target;
        }
        return line;
    }).join('\n');
})();