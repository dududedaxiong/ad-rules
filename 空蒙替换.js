// ==================== 规则配置区域 ====================
const RULES_CONFIG = {
  // 外部规则地址
  EXTERNAL_RULES_URL: 'https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt',
  
  // 1. 分组过滤词 (模糊匹配：只要包含这些词的分组都会被整组剔除)
  LOCAL_GROUP_FILTERS: ['公告', '说明', '温馨', 'Information', '机场', 'TG频道', '更新列表', '更新时间'],
  
  // 2. 频道过滤词 (模糊匹配：只剔除匹配到的单个频道)
  LOCAL_CHANNEL_FILTERS: [
    't.me', '提示', '提醒', '温馨', '说明', '公告', '更新', 'TG', '电报', 'QQ', '钉钉', '微信', 
    '下载', '免费', '进群', '贩卖', '用爱发电', '上当', '死', '盗源', '白嫖', '隐藏', '增加', 
    '失联', '关注', '迷路', '扫码', '入群', '组织', '支持', '赞助', '添加', '私信', '查询'
  ],
  
  // 全局参数
  EPG_URL: 'https://ghfast.top/https://raw.githubusercontent.com/plsy1/epg/main/e/seven-days.xml.gz',
  LOGO_URL_TEMPLATE: 'https://gcore.jsdelivr.net/gh/taksssss/tv/icon/{channel_name}.png',
  DEFAULT_UA: 'YYKM/1.0',
  PLAYBACK_MODE: 'append',
  CATCHUP_SOURCE: '?playseek=${(b)yyyyMMddHHmmss}-${(e)yyyyMMddHHmmss}',
  
  CCTV_KEYWORDS: ['cctv', 'cetv', 'cgtn', '央视']
};
// ==================== 规则配置区域结束 ====================

(() => {
  const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

  // 使用 Set 实现规则并集，且存储前统一转小写进行模糊匹配准备
  let groupFilters = new Set(RULES_CONFIG.LOCAL_GROUP_FILTERS.map(s => s.toLowerCase().trim()));
  let channelFilters = new Set(RULES_CONFIG.LOCAL_CHANNEL_FILTERS.map(s => s.toLowerCase().trim()));
  let currentEPG = RULES_CONFIG.EPG_URL;
  let currentLogo = RULES_CONFIG.LOGO_URL_TEMPLATE;
  let currentUA = RULES_CONFIG.DEFAULT_UA;

  /**
   * 1. 同步加载外部规则，并进行模糊化预处理
   */
  function syncRules() {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', RULES_CONFIG.EXTERNAL_RULES_URL, false);
      xhr.send();
      if (xhr.status === 200 && xhr.responseText) {
        const lines = xhr.responseText.split(/\r?\n/);
        lines.forEach(line => {
          const t = line.trim();
          if (!t || !t.includes('=')) return;
          const splitIdx = t.indexOf('=');
          const key = t.substring(0, splitIdx).trim();
          const val = t.substring(splitIdx + 1).trim();
          if (!val) return;

          if (key === 'GROUP_FILTERS') {
            val.split('|').forEach(s => { if(s.trim()) groupFilters.add(s.trim().toLowerCase()); });
          } else if (key === 'CHANNEL_FILTERS') {
            val.split('|').forEach(s => { if(s.trim()) channelFilters.add(s.trim().toLowerCase()); });
          } else if (key === 'EPG_URL') {
            currentEPG = val;
          } else if (key === 'LOGO_URL_TEMPLATE') {
            currentLogo = val;
          }
        });
      }
    } catch (e) { console.warn('外部规则同步异常'); }
  }
  syncRules();

  /**
   * 2. 模糊匹配核心函数
   */
  function isGroupMatch(name) {
    if (!name) return false;
    const target = name.toLowerCase().trim();
    for (let f of groupFilters) {
      if (target.includes(f)) return true; // 模糊包含匹配
    }
    return false;
  }

  function isChannelMatch(name) {
    if (!name) return false;
    const target = name.toLowerCase().trim();
    for (let f of channelFilters) {
      if (target.includes(f)) return true; // 模糊包含匹配
    }
    return false;
  }

  function normCCTV(name) {
    const t = name.trim();
    const m = t.match(/^(cctv|cetv|cgtn)[\s-]*(\d+)(.*?)$/i);
    if (m) {
      const prefix = m[1].toUpperCase();
      const suffix = m[3].trim();
      return suffix ? `${prefix}-${m[2]} ${suffix}` : `${prefix}-${m[2]}`;
    }
    return t;
  }

  /**
   * 3. M3U 处理 (解耦分组与频道)
   */
  function processM3u(content) {
    const lines = content.split(/\r?\n/);
    let res = `#EXTM3U x-tvg-url="${currentEPG}" http-user-agent="${currentUA}"\n`;
    const seenUrls = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#EXTM3U')) continue;

      if (line.startsWith('#EXTINF')) {
        const gMatch = line.match(/group-title="([^"]+)"/i);
        const groupName = gMatch ? gMatch[1] : "";
        const displayName = line.split(',').pop();

        // 分组过滤与频道过滤独立判定
        if (isGroupMatch(groupName) || isChannelMatch(displayName)) {
          i++; // 跳过URL行
          continue;
        }

        const urlLine = lines[i+1] ? lines[i+1].trim() : "";
        if (urlLine && urlLine.startsWith('http') && !seenUrls.has(urlLine)) {
          const name = normCCTV(displayName);
          const logo = currentLogo.replace('{channel_name}', encodeURIComponent(name));
          let head = line.replace(/tvg-logo="[^"]*"/i, `tvg-logo="${logo}"`);
          if (!head.includes('tvg-logo')) head = head.replace('#EXTINF:-1', `#EXTINF:-1 tvg-logo="${logo}"`);
          res += head.replace(displayName, name) + "\n" + urlLine + "\n";
          seenUrls.add(urlLine);
          i++;
        }
      }
    }
    return res;
  }

  /**
   * 4. TXT 处理 (解耦分组与频道)
   */
  function processTxt(content) {
    const lines = content.split(/\r?\n/);
    const groups = {};
    const groupOrder = [];
    let curG = "其他";
    let skipG = false;

    lines.forEach(line => {
      const t = line.trim();
      if (!t) return;

      if (t.includes(',#genre#')) {
        const gName = t.split(',')[0].trim();
        skipG = isGroupMatch(gName); // 模糊判定分组
        if (!skipG) {
          curG = gName;
          if (!groups[curG]) { groups[curG] = []; groupOrder.push(curG); }
        }
      } else if (t.includes(',')) {
        if (skipG) return;
        const [name, url] = t.split(',');
        if (url && url.startsWith('http') && !isChannelMatch(name)) { // 模糊判定频道
          groups[curG].push({ name: normCCTV(name), url: url.trim() });
        }
      }
    });

    const sortedGroupNames = groupOrder.sort((a, b) => {
      const getW = (n) => {
        const un = n.toUpperCase();
        if (RULES_CONFIG.CCTV_KEYWORDS.some(k => un.includes(k.toUpperCase()))) return 1;
        if (un.includes('卫视')) return 2;
        return 3;
      };
      return getW(a) - getW(b) || a.localeCompare(b, 'zh-CN');
    });

    let result = `#EXTM3U x-tvg-url="${currentEPG}" http-user-agent="${currentUA}"\n`;
    sortedGroupNames.forEach(gn => {
      const channels = groups[gn];
      channels.sort((a, b) => (parseInt(a.name.match(/\d+/)) || 999) - (parseInt(b.name.match(/\d+/)) || 999) || a.name.localeCompare(b.name, 'zh-CN'));
      const seen = new Set();
      channels.forEach(ch => {
        if (seen.has(ch.url)) return;
        seen.add(ch.url);
        const logo = currentLogo.replace('{channel_name}', encodeURIComponent(ch.name));
        let head = `#EXTINF:-1 tvg-name="${ch.name}" tvg-logo="${logo}" group-title="${gn}"`;
        if (RULES_CONFIG.PLAYBACK_MODE) head += ` catchup="${RULES_CONFIG.PLAYBACK_MODE}" catchup-source="${RULES_CONFIG.CATCHUP_SOURCE}"`;
        result += `${head},${ch.name}\n${ch.url}\n`;
      });
    });
    return result;
  }

  // --- 主入口 ---
  let content = global.YYKM.fetch(global.params.url);
  if (!content) return "";

  const isM3u = content.trim().startsWith('#EXTM3U');
  content = isM3u ? processM3u(content) : processTxt(content);

  // 最后自定义替换
  const rep = global.params.replace;
  if (rep && typeof rep === "string") {
    rep.split(";").forEach(r => {
      const idx = r.indexOf("->");
      if (idx !== -1) content = content.replaceAll(r.slice(0, idx), r.slice(idx + 2));
    });
  }

  return content;
})();