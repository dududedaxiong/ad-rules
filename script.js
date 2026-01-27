(() => {
    const global = globalThis;
    var content = global.YYKM.fetch("https://perfecttv.net/PerfecttvFree.m3u");
    return content.split('\n').map(line => {
        let target = line;
        target = target.replaceAll("video://", "webview://");
            
        return target;
    }).join('\n');
})();