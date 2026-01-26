// ==================== 1. 内置默认配置区 (双保险) ====================
const DEFAULT_FALLBACK = {
    GROUP_ORDER: ['央视频道', '卫视频道', '地方频道', '高清频道', '港澳频道', '台湾频道', '体育频道'], // 优先显示的收纳大类
    
    GROUP_FILTERS: ['公告', '说明', '温馨', 'Information', '机场', 'TG频道', '更新列表', '更新时间', '冰茶'],
    CHANNEL_FILTERS: ['t.me', '提示', '提醒', '温馨', '说明', '公告', '更新', 'TG', '电报', 'QQ', '钉钉', '微信', '下载', '免费', '进群', '贩卖', '用爱发电', '上当', '死', '盗源', '白嫖', '隐藏', '增加', '失联', '关注', '迷路', '扫码', '入群', '进群', '组织', '支持', '赞助', '添加', '私信', '查询'],
    
    CATEGORY_MAP: [
        { group: '央视频道', keys: ['CCTV', '央视', 'CGTN', '兵器', '发现', '老故事', 'CETV'] },
        { group: '卫视频道', keys: ['卫视'] },
        { group: '港澳频道', keys: ['翡翠', 'TVB', '明珠', '凤凰', 'HK', '香港', '澳门', '无线', 'Viu', 'Now'] },
        { group: '台湾频道', keys: ['民视', '中视', '华视', '东森', 'TVBS', '三立', '台湾', '纬来', '中天'] },
        { group: '体育频道', keys: ['体育', '足球', '篮球', '五星', '劲爆', '风云', '赛事'] },
        { group: '地方频道', keys: ['广东', '广州', '深圳', '北京', '上海', '成都', '武汉'] }
    ],
    EPG: 'https://ghfast.top/https://raw.githubusercontent.com/plsy1/epg/main/e/seven-days.xml.gz',
    LOGO: 'https://gcore.jsdelivr.net/gh/taksssss/tv/icon/{channel_name}.png',
    UA: 'okHttp/Mod-1.5.0.0'
};

const REMOTE_URL = 'https://ghfast.top/https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt';

(() => {
    const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

    const t2sMap = { '翡': '翡', '翠': '翠', '台': '台', '鳳': '凤', '凰': '凰', '衛': '卫', '視': '视', '廣': '广', '東': '东', '體': '体', '育': '育', '央': '央', '華': '华', '亞': '亚', '蓮': '莲', '花': '花', '灣': '湾' };
    function toS(str) { return str ? str.split('').map(c => t2sMap[c] || c).join('') : ""; }

    let groupFilters = new Set(DEFAULT_FALLBACK.GROUP_FILTERS.map(f => f.toLowerCase()));
    let channelFilters = new Set(DEFAULT_FALLBACK.CHANNEL_FILTERS.map(f => f.toLowerCase()));
    let categoryMap = JSON.parse(JSON.stringify(DEFAULT_FALLBACK.CATEGORY_MAP));
    let runtimeConfig = { epg: DEFAULT_FALLBACK.EPG, logo: DEFAULT_FALLBACK.LOGO, ua: DEFAULT_FALLBACK.UA };

    function syncRemoteRules() {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', REMOTE_URL, false);
            xhr.timeout = 3000;
            xhr.send();
            if (xhr.status === 200 && xhr.responseText) {
                const lines = xhr.responseText.split(/\r?\n/);
                let remoteCategoryMap = [];
                lines.forEach(line => {
                    const t = line.trim();
                    if (!t || t.startsWith('#')) return;
                    if (t.startsWith('GROUP_FILTERS=')) {
                        groupFilters.clear();
                        t.split('=')[1].split('|').forEach(f => groupFilters.add(f.trim().toLowerCase()));
                    } else if (t.startsWith('CHANNEL_FILTERS=')) {
                        channelFilters.clear();
                        t.split('=')[1].split('|').forEach(f => channelFilters.add(f.trim().toLowerCase()));
                    } else if (t.startsWith('EPG_URL=')) runtimeConfig.epg = t.split('=')[1].trim();
                    else if (t.startsWith('LOGO_URL_TEMPLATE=')) runtimeConfig.logo = t.split('=')[1].trim();
                    else if (t.includes('=')) {
                        const [g, k] = t.split('=');
                        remoteCategoryMap.push({ group: g.trim(), keys: k.split('|').map(x => x.trim()) });
                    }
                });
                if (remoteCategoryMap.length > 0) categoryMap = remoteCategoryMap;
            }
        } catch (e) {}
    }
    syncRemoteRules();

    function getSmartGroup(chName) {
        const name = toS(chName).toUpperCase();
        for (const item of categoryMap) {
            if (item.keys.some(k => name.includes(toS(k).toUpperCase()))) return item.group;
        }
        return null; // 没匹配到收纳规则，返回空
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

        if (isM3u) {
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#EXTINF')) {
                    const gMatch = lines[i].match(/group-title="([^"]+)"/i);
                    const name = lines[i].split(',').pop().trim();
                    const url = lines[i+1]?.trim();
                    if (url?.startsWith('http')) {
                        rawChannels.push({ name, group: gMatch?.[1] || '未分类', url });
                        i++;
                    }
                }
            }
        } else {
            let curG = '未分类';
            lines.forEach(l => {
                if (l.includes(',#genre#')) curG = l.split(',')[0].trim();
                else if (l.includes(',')) {
                    const [n, u] = l.split(',');
                    if (u?.trim().startsWith('http')) rawChannels.push({ name: n.trim(), group: curG, url: u.trim() });
                }
            });
        }

        const finalGroups = {};
        const seenUrl = new Set();
        
        rawChannels.forEach(ch => {
            if (seenUrl.has(ch.url)) return;
            if (isBad(ch.group, groupFilters) || isBad(ch.name, channelFilters)) return;

            // 核心改动：先尝试收纳
            const smartG = getSmartGroup(ch.name);
            const targetG = smartG ? smartG : ch.group; // 匹配到用收纳组，没匹配到用原组名

            if (!finalGroups[targetG]) finalGroups[targetG] = [];
            finalGroups[targetG].push(ch);
            seenUrl.add(ch.url);
        });

        let result = `#EXTM3U x-tvg-url="${runtimeConfig.epg}" http-user-agent="${runtimeConfig.ua}"\n`;
        
        // 排序逻辑：收纳大类排最前，剩下的按原始出现顺序或字母顺序排在后
        const收纳大类 = DEFAULT_FALLBACK.GROUP_ORDER;
        const所有组 = [...new Set([...收纳大类, ...Object.keys(finalGroups)])];

        所有组.forEach(gn => {
            const list = finalGroups[gn];
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