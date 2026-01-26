// ==================== 1. 内置默认配置区 (双保险) ====================
// 当远程规则加载失败时，脚本将自动使用以下预设值
const DEFAULT_FALLBACK = {
    // 默认分组顺序
    GROUP_ORDER: ['央视频道', '卫视频道', '地方频道', '高清频道', '港澳频道', '台湾频道', '体育频道', '其他频道'],
    
    // 默认分组过滤
    GROUP_FILTERS: ['公告', '说明', '温馨', 'Information', '机场', 'TG频道', '更新列表', '更新时间', '冰茶'],
    
    // 默认频道过滤
    CHANNEL_FILTERS: ['t.me', '提示', '提醒', '温馨', '说明', '公告', '更新', 'TG', '电报', 'QQ', '钉钉', '微信', '下载', '免费', '进群', '贩卖', '用爱发电', '上当', '死', '盗源', '白嫖', '隐藏', '增加', '失联', '关注', '迷路', '扫码', '入群', '进群', '组织', '支持', '赞助', '添加', '私信', '查询'],
    
    // 默认收纳库 (央视/卫视/港澳台/体育)
    CATEGORY_MAP: [
        { group: '央视频道', keys: ['CCTV', '央视', 'CGTN', '兵器', '发现', '故事'] },
        { group: '卫视频道', keys: ['卫视', '湖南', '湖北', '浙江', '江苏', '东方'] },
        { group: '港澳频道', keys: ['翡翠', 'TVB', '明珠', '凤凰', 'HK', '香港', '澳门', '无线', 'Viu', 'Now'] },
        { group: '台湾频道', keys: ['民视', '中视', '华视', '东森', 'TVBS', '三立', '台湾', '纬来', '中天'] },
        { group: '体育频道', keys: ['体育', '足球', '篮球', '五星', '劲爆', '风云', '赛事'] },
        { group: '地方频道', keys: ['广东', '广州', '深圳', '北京', '上海', '成都', '武汉'] }
    ],

    EPG: 'https://ghfast.top/https://raw.githubusercontent.com/plsy1/epg/main/e/seven-days.xml.gz',
    LOGO: 'https://gcore.jsdelivr.net/gh/taksssss/tv/icon/{channel_name}.png',
    UA: 'YYKM/1.0'
};

const REMOTE_URL = 'https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt';

// ==================== 2. 核心逻辑引擎 ====================

(() => {
    const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

    // 繁简转换表
    const t2sMap = { '翡': '翡', '翠': '翠', '台': '台', '鳳': '凤', '凰': '凰', '衛': '卫', '視': '视', '廣': '广', '東': '东', '體': '体', '育': '育', '央': '央', '華': '华', '灣': '湾', '維': '维' };
    function toS(str) { return str ? str.split('').map(c => t2sMap[c] || c).join('') : ""; }

    // 初始化运行变量（先填入默认值）
    let groupFilters = new Set(DEFAULT_FALLBACK.GROUP_FILTERS.map(f => f.toLowerCase()));
    let channelFilters = new Set(DEFAULT_FALLBACK.CHANNEL_FILTERS.map(f => f.toLowerCase()));
    let categoryMap = JSON.parse(JSON.stringify(DEFAULT_FALLBACK.CATEGORY_MAP));
    let runtimeConfig = { epg: DEFAULT_FALLBACK.EPG, logo: DEFAULT_FALLBACK.LOGO, ua: DEFAULT_FALLBACK.UA };

    /**
     * 尝试同步远程规则，如果失败则保留默认值
     */
    function syncRemoteRules() {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', REMOTE_URL, false); // 使用同步请求
            xhr.timeout = 60000; // 设置5秒超时
            xhr.send();
            
            if (xhr.status === 200 && xhr.responseText) {
                const lines = xhr.responseText.split(/\r?\n/);
                let remoteCategoryMap = [];

                lines.forEach(line => {
                    const t = line.trim();
                    if (!t || t.startsWith('#') || t.startsWith('//')) return;

                    // 提取过滤词 (支持多种命名变体)
                    if (/GROUP_FILTER/i.test(t) && t.includes('=')) {
                        groupFilters.clear(); // 远程有效则清空默认，以远程为主
                        t.split('=')[1].split('|').forEach(f => groupFilters.add(f.trim().toLowerCase()));
                    } 
                    else if (/CHANNEL_FILTER/i.test(t) && t.includes('=')) {
                        channelFilters.clear();
                        t.split('=')[1].split('|').forEach(f => channelFilters.add(f.trim().toLowerCase()));
                    }
                    // 提取配置项
                    else if (/EPG_URL/i.test(t) && t.includes('=')) runtimeConfig.epg = t.split('=')[1].trim();
                    else if (/LOGO_URL/i.test(t) && t.includes('=')) runtimeConfig.logo = t.split('=')[1].trim();
                    else if (/DEFAULT_UA/i.test(t) && t.includes('=')) runtimeConfig.ua = t.split('=')[1].trim();
                    // 提取收纳规则
                    else if (t.includes('=')) {
                        const [gName, kStr] = t.split('=');
                        if (gName && kStr) remoteCategoryMap.push({ group: gName.trim(), keys: kStr.split('|').map(k => k.trim()) });
                    }
                });
                
                if (remoteCategoryMap.length > 0) categoryMap = remoteCategoryMap;
            }
        } catch (e) {
            console.log("远程规则加载超时或失败，已启用内置默认规则。");
        }
    }
    syncRemoteRules();

    // 智能识别归类
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

    // CCTV 排序权重
    function getCCTVWeight(name) {
        const m = name.match(/CCTV[\s-]*(\d+)/i);
        return m ? parseInt(m[1], 10) : 999;
    }

    // 繁简通杀过滤判断
    function isBad(text, filterSet) {
        if (!text) return false;
        const t = toS(text).toLowerCase().replace(/\s+/g, '');
        for (let f of filterSet) {
            if (t.includes(toS(f).toLowerCase().replace(/\s+/g, ''))) return true;
        }
        return false;
    }

    // --- 数据解析引擎 ---
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

        let result = `#EXTM3U x-tvg-url="${runtimeConfig.epg}" http-user-agent="${runtimeConfig.ua}"\n`;
        const allGroups = [...new Set([...DEFAULT_FALLBACK.GROUP_ORDER, ...Object.keys(groups)])];

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

    // replace 参数处理
    const rep = global.params.replace;
    if (rep && typeof rep === "string") {
        rep.split(";").forEach(r => {
            const parts = r.split("->");
            if (parts.length === 2) finalResult = finalResult.replaceAll(parts[0], parts[1]);
        });
    }

    return finalResult;
})();