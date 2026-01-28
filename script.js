(() => {
    const global = typeof globalThis !== 'undefined' ? globalThis : this;
    var content = global.YYKM.fetch("https://gh-proxy.org/https://raw.githubusercontent.com/Jsnzkpg/Jsnzkpg/Jsnzkpg/Jsnzkpg1#sp;ua=okhttp");
    return content.split('\n').map(line => {
        let target = line;
        if(line.includes("#EXTINF:") || line.includes("://")) {
            target = target.replaceAll("video://", "webview://");
                
        }
        return target;
    }).join('\n');
})();