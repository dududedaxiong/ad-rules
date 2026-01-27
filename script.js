(() => {
    const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;
    // 1. 获取源数据 (内联 UA)
    var content = global.YYKM.fetch("https://perfecttv.net/PerfecttvFree.m3u#sp;ua=okhttp");
    
    // 2. 逐行验证与替换逻辑 (Logo保护)
    const lines = content.split('\n');
    const processedLines = lines.map(line => {
        const trimLine = line.trim();
        if (!trimLine || trimLine.includes('tvg-logo=')) return line;

        const isUrlLine = /^(http|https|rtp|p3p|rtsp|mitv|video|webview):\/\//i.test(trimLine);
        const isTxtFormat = trimLine.includes(",") && !trimLine.startsWith("#");

        if (isUrlLine || isTxtFormat) {
            
            line = line.replaceAll("https://", "webview://https://");
        }
        return line;
    });

    return processedLines.join('\n');
})();