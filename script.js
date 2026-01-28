(() => {
    const global = typeof globalThis !== "undefined" ? globalThis : this;
    const config = { 
        url: "https://gh-proxy.org/https://raw.githubusercontent.com/Jsnzkpg/Jsnzkpg/Jsnzkpg/Jsnzkpg1", 
        pullUa: "okhttp", 
        remoteRules: "https://ghfast.top/https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt",
        hardFilters: "TG频道|群|公告|说明|提示|更新|/|http|t.me|@|stymei|频道|订阅|加群|二维码",
        cctv: "🔥央视频道", prov: "📡卫视频道",
        logo: "https://gcore.jsdelivr.net/gh/taksssss/tv/icon/{name}.png",
        epg: "https://ghfast.top/https://raw.githubusercontent.com/plsy1/epg/main/e/seven-days.xml.gz"
    };
    const t2sMap = {'肅':'肃','蘇':'苏','衛':'卫','視':'视','廣':'广','東':'东','體':'体','育':'育','央':'央','華':'华','亞':'亚','慶':'庆','陝':'陕','龍':'龙','灣':'湾','區':'区','粵':'粤'};
    const toS = (s) => s ? s.split('').map(c => t2sMap[c] || c).join('') : "";
    const isBad = (txt) => {
        const clean = toS(txt).toLowerCase();
        return config.hardFilters.split('|').some(f => clean.includes(toS(f).toLowerCase()));
    };
    const formatN = (n) => toS(n).replace(/\s+/g, '').replace(/^(CCTV|CETV|CGTN)(\d+)/i, "$1-$2");
    
    const content = global.YYKM.fetch(config.url + "#sp;ua=" + config.pullUa);
    if(!content) return "";
    
    const raw = [];
    const lines = content.split(/\n/);
    let curG = "默认";
    lines.forEach((l, i) => {
        if (l.startsWith('#EXTINF')) {
            const name = l.split(',').pop().trim();
            const u = lines[i+1]?.trim();
            if(u?.startsWith('http')) raw.push({ n: formatN(name), u });
        }
    });

    let final = "#EXTM3U x-tvg-url=\"" + config.epg + "\"\n";
    raw.forEach(ch => {
        if(isBad(ch.n)) return;
        let g = /^(CCTV|CETV|CGTN)/i.test(ch.n) ? config.cctv : (ch.n.includes('卫视') ? config.prov : "其他频道");
        final += `#EXTINF:-1 group-title="${g}",${ch.n}\n${ch.u}\n`;
    });

    
    return final;
})();