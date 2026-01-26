// ==================== 1. 配置区 ====================
const RULES_CONFIG = {
    // 远程规则唯一源
    REMOTE_URL: 'https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt',
    
    // 物理显示顺序
    GROUP_ORDER: ['央视频道', '卫视频道', '地方频道', '高清频道', '港澳频道', '台湾频道', '体育频道', '其他频道'],

    // 默认兜底值
    DEFAULT_UA: 'YYKM/1.0',
    DEFAULT_EPG: 'https://ghfast.top/https://raw.githubusercontent.com/plsy1/epg/main/e/seven-days.xml.gz',
    DEFAULT_LOGO: 'https://gcore.jsdelivr.net/gh/taksssss/tv/icon/{channel_name}.png'
};

(() => {
    const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

    // 繁简转换函数
    const t2sMap = { '翡': '翡', '翠': '翠', '台': '台', '鳳': '凤', '凰': '凰', '衛': '卫', '視': '视', '廣': '广', '東': '东', '體': '体', '育': '育', '央': '央', '華': '华', '亞': '亚', '蓮': '莲', '花': '花', '灣': '湾' };
    function toS(str) { return str ? str.split('').map(c => t2sMap[c] || c).join('') : ""; }

    let groupFilters = new Set();
    let channelFilters = new Set();
    let categoryMap = [];
    let runtimeConfig = { epg: RULES_CONFIG.DEFAULT_EPG, logo: RULES_CONFIG.DEFAULT_LOGO, ua: RULES_CONFIG.DEFAULT_UA };

    /**
     * 强壮提取函数：从源码中提取对应内容
     * 解决变体干扰
     */
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

                // 1. 提取过滤词 (支持 GROUP_FILTERS 或类似变体)
                if (/GROUP_FILTER/i.test(t) && t.includes('=')) {
                    t.split('=')[1].split('|').forEach(f => groupFilters.add(f.trim().toLowerCase()));
                } 
                else if (/CHANNEL_FILTER/i.test(t) && t.includes('=')) {
                    t.split('=')[1].split('|').forEach(f => channelFilters.add(f.trim().toLowerCase()));
                }
                // 2. 提取配置项 (EPG/LOGO/UA)
                else if (/EPG_URL/i.test(t) && t.includes('=')) {
                    runtimeConfig.epg = t.split('=')[1].trim();
                }
                else if (/LOGO_URL/i.test(t) && t.includes('=')) {
                    runtimeConfig.logo = t.split('=')[1].trim();
                }
                else if (/DEFAULT_UA/i.test(t) && t.includes('=')) {
                    runtimeConfig.ua = t.split('=')[1].trim();
                }
                // 3. 提取收纳规则 (分组名=关键词|关键词)
                else if (t.includes('=')) {
                    const [gName, kStr] = t.split('=');
                    if (gName && kStr) {
                        categoryMap.push({ group: gName.trim(), keys: kStr.split('|').map(k => k.trim()) });
                    }
                }
            });
        } catch (e) { console.error("远程源码提取出错:", e); }
    }
    extractRemoteSettings();

    // 智能识别归类（不分繁简）
    function getSmartGroup(chName, originG) {
        const name = toS(chName).toUpperCase();
        for (const item of categoryMap) {
            if (item.keys.some(k => name.includes(toS(k).toUpperCase()))) return item.group;
        }
        if (originG) {
            const og = toS(originG).toUpperCase();
            if (og.includes('央视') || og.includes('CCTV')) return '央视频道';
            if (og.includes('卫视')) return '卫视频道';
        }
        return '其他频道';
    }

    // CCTV 1-17 排序权重
    function getCCTVWeight(name) {
        const m = name.match(/CCTV[\s-]*(\d+)/i);
        return m ? parseInt(m[1], 10) : 999;
    }

    // 繁简通杀过滤
    function isBad(text, filterSet) {
        if (!text) return false;
        const t = toS(text).toLowerCase().replace(/\s+/g, '');
        for (let f of filterSet) {
            if (t.includes(toS(f).toLowerCase().replace(/\s+/g, ''))) return true;
        }
        return false;
    }

    // --- 数据处理引擎 ---
    function process(content) {
        const lines = content.split(/\r?\n/);
        const rawChannels = [];
        const isM3u = content.trim().startsWith('#EXTM3U');

        // 解析输入 (TXT 转 M3U)
        if (isM3u) {
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#EXTINF')) {
                    const gMatch = lines[i].match(/group-title="([^"]+)"/i);
                    const name = lines[i].split(',').pop().trim();
                    const url = lines[i+1]?.trim();
                    if (url?.startsWith('http')) {
                        rawChannels.push({ name, group: gMatch?.[1] || '', url });
                        i++;
                    }
                }
            }
        } else {
            let curG = '';
            lines.forEach(l => {
                if (l.includes(',#genre#')) curG = l.split(',')[0].trim();
                else if (l.includes(',')) {
                    const [n, u] = l.split(',');
                    if (u?.trim().startsWith('http')) rawChannels.push({ name: n.trim(), group: curG, url: u.trim() });
                }
            });
        }

        // 过滤、去重与收纳
        const groups = {};
        const seenUrl = new Set();
        rawChannels.forEach(ch => {
            if (seenUrl.has(ch.url)) return;
            if (isBad(ch.group, groupFilters) || isBad(ch.name, channelFilters)) return;

            const finalG = getSmartGroup(ch.name, ch.group);
            if (!groups[finalG]) groups[finalG] = [];
            groups[finalG].push(ch);
            seenUrl.add(ch.url);
        });

        // 排序与生成结果
        let result = `#EXTM3U x-tvg-url="${runtimeConfig.epg}" http-user-agent="${runtimeConfig.ua}"\n`;
        const allGroups = [...new Set([...RULES_CONFIG.GROUP_ORDER, ...Object.keys(groups)])];

        allGroups.forEach(gn => {
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

    // 最后的替换功能
    const rep = global.params.replace;
    if (rep && typeof rep === "string") {
        rep.split(";").forEach(r => {
            const parts = r.split("->");
            if (parts.length === 2) finalResult = finalResult.replaceAll(parts[0], parts[1]);
        });
    }

    return finalResult;
})();