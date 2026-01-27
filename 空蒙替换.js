// ==================== 1. 配置区 ====================
const RULES_CONFIG = {
    REMOTE_URL: 'https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt',
    
    // 固定的物理显示顺序（这些大类排在最前面）
    GROUP_ORDER: ['央视频道', '卫视频道', '地方频道', '高清频道', '港澳频道', '台湾频道', '体育频道'],

    DEFAULT_UA: 'YYKM/1.0',
    DEFAULT_EPG: 'https://ghfast.top/https://raw.githubusercontent.com/plsy1/epg/main/e/seven-days.xml.gz',
    DEFAULT_LOGO: 'https://gcore.jsdelivr.net/gh/taksssss/tv/icon/{channel_name}.png'
};

(() => {
    const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

    const t2sMap = { '翡': '翡', '翠': '翠', '台': '台', '鳳': '凤', '凰': '凰', '衛': '卫', '視': '视', '廣': '广', '東': '东', '體': '体', '育': '育', '央': '央', '華': '华', '亞': '亚', '蓮': '莲', '花': '花', '灣': '湾' };
    function toS(str) { return str ? str.split('').map(c => t2sMap[c] || c).join('') : ""; }

    let groupFilters = new Set();
    let channelFilters = new Set();
    let categoryMap = [];
    let runtimeConfig = { epg: RULES_CONFIG.DEFAULT_EPG, logo: RULES_CONFIG.DEFAULT_LOGO, ua: RULES_CONFIG.DEFAULT_UA };

    // 远程规则提取
    function extractRemoteSettings() {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', RULES_CONFIG.REMOTE_URL, false);
            xhr.send();
            if (xhr.status !== 200) return;
            const content = xhr.responseText;
            const lines = content.split(/\r?\n/);
            lines.forEach(line => {
                const t = line.trim();
                if (!t || t.startsWith('#') || t.startsWith('//')) return;
                if (/GROUP_FILTER/i.test(t) && t.includes('=')) {
                    t.split('=')[1].split('|').forEach(f => groupFilters.add(f.trim().toLowerCase()));
                } else if (/CHANNEL_FILTER/i.test(t) && t.includes('=')) {
                    t.split('=')[1].split('|').forEach(f => channelFilters.add(f.trim().toLowerCase()));
                } else if (/EPG_URL/i.test(t) && t.includes('=')) {
                    runtimeConfig.epg = t.split('=')[1].trim();
                } else if (/LOGO_URL/i.test(t) && t.includes('=')) {
                    runtimeConfig.logo = t.split('=')[1].trim();
                } else if (/DEFAULT_UA/i.test(t) && t.includes('=')) {
                    runtimeConfig.ua = t.split('=')[1].trim();
                } else if (t.includes('=')) {
                    const [gName, kStr] = t.split('=');
                    if (gName && kStr) categoryMap.push({ group: gName.trim(), keys: kStr.split('|').map(k => k.trim()) });
                }
            });
        } catch (e) { console.error("远程源码提取出错:", e); }
    }
    extractRemoteSettings();

    // 修改后的智能识别：只负责返回匹配的大类，不匹配则返回null
    function getSmartGroup(chName) {
        const name = toS(chName).toUpperCase();
        for (const item of categoryMap) {
            if (item.keys.some(k => name.includes(toS(k).toUpperCase()))) return item.group;
        }
        return null;
    }

    function getCCTVWeight(name) {
        const m = name.match(/CCTV[\s-]*(\d+)/i);
        return m ? parseInt(m[1], 10) : 999;
    }

    function isBad(text, filterSet) {
        if (!text) return false;
        const t = toS(text).toLowerCase().replace(/\s+/g, '');
        for (let f of filterSet) {
            if (t.includes(toS(f).toLowerCase().replace(/\s+/g, ''))) return true;
        }
        return false;
    }

    function process(content) {
        const lines = content.split(/\r?\n/);
        const rawChannels = [];
        const isM3u = content.trim().startsWith('#EXTM3U');

        // 1. 解析原始数据
        if (isM3u) {
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#EXTINF')) {
                    const gMatch = lines[i].match(/group-title="([^"]+)"/i);
                    const name = lines[i].split(',').pop().trim();
                    const url = lines[i+1]?.trim();
                    if (url?.startsWith('http')) {
                        rawChannels.push({ name, group: gMatch?.[1] || '其他频道', url });
                        i++;
                    }
                }
            }
        } else {
            let curG = '其他频道';
            lines.forEach(l => {
                if (l.includes(',#genre#')) curG = l.split(',')[0].trim();
                else if (l.includes(',')) {
                    const [n, u] = l.split(',');
                    if (u?.trim().startsWith('http')) rawChannels.push({ name: n.trim(), group: curG, url: u.trim() });
                }
            });
        }

        // 2. 核心逻辑：精准收纳或还原分组
        const groups = {};
        const seenUrl = new Set();
        rawChannels.forEach(ch => {
            if (seenUrl.has(ch.url)) return;
            if (isBad(ch.group, groupFilters) || isBad(ch.name, channelFilters)) return;

            // 判定目标分组：优先匹配规则大类，否则保留原组名
            const smartG = getSmartGroup(ch.name);
            const targetG = smartG ? smartG : ch.group; 

            if (!groups[targetG]) groups[targetG] = [];
            groups[targetG].push(ch);
            seenUrl.add(ch.url);
        });

        // 3. 排序并生成
        let result = `#EXTM3U x-tvg-url="${runtimeConfig.epg}" http-user-agent="${runtimeConfig.ua}"\n`;
        
        // 排序逻辑：先排规则大类，再排剩下的原始组
        const allGroupKeys = Object.keys(groups);
        const sortedGroupNames = [...new Set([...RULES_CONFIG.GROUP_ORDER, ...allGroupKeys])];

        sortedGroupNames.forEach(gn => {
            const list = groups[gn];
            if (!list || list.length === 0) return;

            const sorted = (gn.includes('央视') || gn.includes('CCTV')) 
                ? list.sort((a, b) => getCCTVWeight(a.name) - getCCTVWeight(b.name) || a.name.localeCompare(b.name, 'zh-CN'))
                : list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

            sorted.forEach(ch => {
                const logo = runtimeConfig.logo.replace('{channel_name}', encodeURIComponent(ch.name));
                result += `#EXTINF:-1 tvg-logo="${logo}" group-title="${gn}",${ch.name}\n${ch.url}\n`;
            });
        });
        return result;
    }

    let content = global.YYKM.fetch(global.params.url);
    if (!content) return "";
    let finalResult = process(content);

    const rep = global.params.replace;
    if (rep && typeof rep === "string") {
        rep.split(";").forEach(r => {
            const parts = r.split("->");
            if (parts.length === 2) finalResult = finalResult.replaceAll(parts[0], parts[1]);
        });
    }

    return finalResult;
})();