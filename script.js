(() => {
    const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;
    // 1. 获取源数据 (内联 UA)
    var content = global.YYKM.fetch("https://live.ottiptv.cc/iptv.m3u?userid=5464346556&sign=25ea864f3e810344b62f867fc74d45773b80a171b11777b0015a2604734c4fd9a59f038acd4ac5c7caa8c06eb5a66cd8a60cdd66b4c87fa187c518e40d7bf5eccf1a164a2e58c8&auth_token=0502282be476cd93610594ed29cb967c#sp;ua=okHttp/Mod-1.5.0.0");
    
    // 2. 逻辑：只替换频道名、链接、分组，保护所有 M3U 属性标签
    const lines = content.split('\n');
    const processedLines = lines.map(line => {
        let trimLine = line.trim();
        if (!trimLine) return line;

        // --- 情况 A: M3U 属性行 (#EXTINF) ---
        if (trimLine.startsWith("#EXTINF:")) {
            // 找到最后一个逗号，逗号后面才是频道名
            let lastCommaIndex = line.lastIndexOf(",");
            if (lastCommaIndex !== -1) {
                let prefix = line.substring(0, lastCommaIndex + 1); // #EXTINF...属性部分
                let target = line.substring(lastCommaIndex + 1);    // 频道名部分
                target = target.replaceAll("https://", "webview://https://");
            
                return prefix + target;
            }
            return line;
        }

        // --- 情况 B: TXT 格式行 (频道名,链接) ---
        if (trimLine.includes(",") && !trimLine.startsWith("#")) {
            let target = line;
            target = target.replaceAll("https://", "webview://https://");
            
            return target;
        }

        // --- 情况 C: 播放链接行 ---
        const isUrl = /^(http|https|rtp|p3p|rtsp|mitv|video|webview):\/\//i.test(trimLine);
        if (isUrl) {
            let target = line;
            target = target.replaceAll("https://", "webview://https://");
            
            return target;
        }

        // 情况 D: 其他配置信息 (如 #EXTM3U, #EXTGRP 等) 原样保留
        return line;
    });

    return processedLines.join('\n');
})();