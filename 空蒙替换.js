// ==================== 1. 配置区 ====================
const RULES_CONFIG = {
    REMOTE_URL: 'https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt',
    
    // 强制排在最前面的大类顺序
    GROUP_ORDER: ['央视频道', '卫视频道', '地方频道', '高清频道', '港澳频道', '台湾频道', '体育频道'],

    // 默认过滤词（保底用）
    DEFAULT_GROUP_FILTERS: '公告|说明|温馨|Information|机场|TG频道|更新列表|更新时间|冰茶',
    DEFAULT_CHANNEL_FILTERS: 't.me|提示|提醒|温馨|说明|公告|更新|TG|电报|QQ|钉钉|微信|下载|免费|进群|贩卖|用爱发电|上当|死|盗源|白嫖|隐藏|增加|失联|关注|迷路|扫码|入群|进群|组织|支持|赞助|添加|私信|查询',

    DEFAULT_UA: 'YYKM/1.0',
    DEFAULT_EPG: 'https://ghfast.top/https://raw.githubusercontent.com/plsy1/epg/main/e/seven-days.xml.gz',
    DEFAULT_LOGO: 'https://gcore.jsdelivr.net/gh/taksssss/tv/icon/{channel_name}.png'
};

(() => {
    const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

    const t2sMap = { '翡': '翡', '翠': '翠', '台': '台', '鳳': '凤', '凰': '凰', '衛': '卫', '視': '视', '廣': '广', '東': '东', '體': '体', '育': '育', '央': '央', '華': '华', '亞': '亚', '蓮': '莲', '花': '花', '灣': '湾' };
    function toS(str) { return str ? str.split('').map(c => t2sMap[c] || c).join('') : ""; }

    let groupFilters = new Set(RULES_CONFIG.DEFAULT_GROUP_FILTERS.split('|').map(f => f.trim().toLowerCase()));
    let channelFilters = new Set(RULES_CONFIG.DEFAULT_CHANNEL_FILTERS.split('|').map(f => f.trim().toLowerCase()));
    let categoryMap = [];
    let runtimeConfig = { epg: RULES_CONFIG.DEFAULT_EPG, logo: RULES_CONFIG.DEFAULT_LOGO, ua: RULES_CONFIG.DEFAULT_UA };

    function extractRemoteSettings() {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', RULES_CONFIG.REMOTE_URL, false);
            xhr.send();
            if (xhr.status !== 200) return;
            const lines = xhr.responseText.split(/\r?\n/);
            lines.forEach(line => {
                const t = line.trim();
                if (!t || t.startsWith('#')) return;
                if (/GROUP_FILTER/i.test(t) && t.includes('=')) {
                    t.split('=')[1].split('|').forEach(f => groupFilters.add(f.trim().toLowerCase()));
                } else if (/CHANNEL_FILTER/i.test(t) && t.includes('=')) {
                    t.split('=')[1].split('|').forEach(f => channelFilters.add(f.trim().toLowerCase()));
                } else if (/EPG_URL/i.test(t) && t.includes('=')) {
                    runtimeConfig.epg = t.split('=')[1].trim();
                } else if (/LOGO_URL/i.test(t) && t.includes('=')) {
                    runtimeConfig.logo = t.split('=')[1].trim();
                } else if (t.includes('=')) {
                    const [gName, kStr] = t.split('=');
                    if (gName && kStr) categoryMap.push({ group: gName.trim(), keys: kStr.split('|').map(k => k.trim()) });
                }
            });
        } catch (e) {}
    }
    extractRemoteSettings();

    function getSmartGroup(chName) {
        const name = toS(chName).toUpperCase();
        for (const item of categoryMap) {
            if (item.keys.some(k => name.includes(toS(k).toUpperCase()))) return item.group;
        }
        return null; // 不匹配则返回null，代表不干预分组
    }

    function isBad(text, filterSet) {
        if (!text) return false;
        const cleanText = toS(text).toLowerCase().replace(/\s+/g, '');
        for (let f of filterSet) {
            const cleanFilter = toS(f).toLowerCase().replace(/\s+/g, '');
            if (cleanFilter && cleanText.includes(cleanFilter)) return true;
        }
        return false;
    }

    function process(content) {
        const lines = content.split(/\r?\n/);
        const rawChannels = [];
        const isM3u = content.trim().startsWith('#EXTM3U');

        // 1. 原始解析：只拿原始数据，不加任何“其他频道”默认值
        if (isM3u) {
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#EXTINF')) {
                    const gMatch = lines[i].match(/group-title="([^"]+)"/i);
                    const name = lines[i].split(',').pop().trim();
                    const url = lines[i+1]?.trim();
                    if (url?.startsWith('http')) {
                        rawChannels.push({ name, group: gMatch?.[1] || '未分组', url });
                        i++;
                    }
                }
            }
        } else {
            let curG = '未分组';
            lines.forEach(l => {
                if (l.includes(',#genre#')) curG = l.split(',')[0].trim();
                else if (l.includes(',')) {
                    const [n, u] = l.split(',');
                    if (u?.trim().startsWith('http')) rawChannels.push({ name: n.trim(), group: curG, url: u.trim() });
                }
            });
        }

        // 2. 逻辑处理：收纳规则抢夺或原样保留
        const groups = {};
        const seenUrl = new Set();
        rawChannels.forEach(ch => {
            if (seenUrl.has(ch.url)) return;
            if (isBad(ch.group, groupFilters) || isBad(ch.name, channelFilters)) return;

            const smartG = getSmartGroup(ch.name);
            // 关键：如果规则匹配到了就用规则组名，否则绝对保留原始组名 (ch.group)
            const finalG = smartG ? smartG : ch.group; 

            if (!groups[finalG]) groups[finalG] = [];
            groups[finalG].push(ch);
            seenUrl.add(ch.url);
        });

        // 3. 排序生成结果
        let result = `#EXTM3U x-tvg-url="${runtimeConfig.epg}" http-user-agent="${runtimeConfig.ua}"\n`;
        
        // 整理所有出现过的分组名
        const existingGroups = Object.keys(groups);
        // 按照：收纳大类顺序 + 剩余原始组顺序 排列
        const finalOrder = [...new Set([...RULES_CONFIG.GROUP_ORDER, ...existingGroups])];

        finalOrder.forEach(gn => {
            const list = groups[gn];
            if (!list || list.length === 0) return;

            // 央视排序权重
            if (gn.includes('央视') || gn.includes('CCTV')) {
                list.sort((a, b) => {
                    const getW = (n) => { const m = n.match(/CCTV[\s-]*(\d+)/i); return m ? parseInt(m[1], 10) : 999; };
                    return getW(a.name) - getW(b.name) || a.name.localeCompare(b.name, 'zh-CN');
                });
            } else {
                list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
            }

            list.forEach(ch => {
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