// ==================== 规则配置区域 ====================
const RULES_CONFIG = {
  // 外部规则文件地址
  EXTERNAL_RULES_URL: 'https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt',
  
  // 1. 分组过滤保底（即使外部规则没写，这里也会生效）
  LOCAL_GROUP_FILTERS: ['公告', '说明', '温馨', 'Information', '机场', 'TG频道', '更新列表', '更新时间', '冰茶'],
  
  // 2. 频道过滤保底
  LOCAL_CHANNEL_FILTERS: [
    't.me', '提示', '提醒', '温馨', '说明', '公告', '更新', 'TG', '电报', 'QQ', '钉钉', '微信', 
    '下载', '免费', '进群', '贩卖', '用爱发电', '上当', '死', '盗源', '白嫖', '隐藏', '增加', 
    '失联', '关注', '迷路', '扫码', '入群', '组织', '支持', '赞助', '添加', '私信', '查询'
  ],
  
  // 3. 全局参数（支持外部规则覆盖）
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

  // 使用 Set 实现规则并集，防止重复并提高查询效率
  let groupFilters = new Set(RULES_CONFIG.LOCAL_GROUP_FILTERS);
  let channelFilters = new Set(RULES_CONFIG.LOCAL_CHANNEL_FILTERS);
  let currentEPG = RULES_CONFIG.EPG_URL;
  let currentLogo = RULES_CONFIG.LOGO_URL_TEMPLATE;
  let currentUA = RULES_CONFIG.DEFAULT_UA;

  /**
   * 1. 强力同步外部规则
   */
  function syncExternalRules() {
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

          if (key === 'GROUP_FILTERS') val.split('|').forEach(s => { if(s.trim()) groupFilters.add(s.trim()); });
          if (key === 'CHANNEL_FILTERS') val.split('|').forEach(s => { if(s.trim()) channelFilters.add(s.trim()); });
          if (key === 'EPG_URL') currentEPG = val;
          if (key === 'LOGO_URL_TEMPLATE') currentLogo = val;
          if (key === 'DEFAULT_UA') currentUA = val;
        });
      }
    } catch (e) { console.warn('外部规则加载失败，使用本地保底规则'); }
  }
  syncExternalRules();

  /**
   * 2. 独立判定逻辑（核心：不区分大小写，精准解耦）
   */
  function isGroupBad(name) {
    if (!name) return false;
    const n = name.toLowerCase();
    for (let f of groupFilters) if (n.includes(f.toLowerCase())) return true;
    return false;
  }

  function isChannelBad(name) {
    if (!name) return false;
    const n = name.toLowerCase();
    for (let f of channelFilters) if (n.includes(f.toLowerCase())) return true;
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
   * 3. M3U 处理（分组独立过滤 + 频道名独立过滤 + EPG插入）
   */
  function processM3u(content) {
    const lines = content.split(/\r?\n/);
    let res = `#EXTM3U x-tvg-url="${currentEPG}" http-user-agent="${currentUA}"\n`;
    const seenUrls = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#EXTM3U')) continue;

      if (line.startsWith('#EXTINF')) {
        // 提取分组和频道名
        const gMatch = line.match(/group-title="([^"]+)"/i);
        const groupName = gMatch ? gMatch[1] : "";
        const displayName = line.split(',').pop();

        // 【核心解耦】：分组坏或频道坏，均剔除
        if (isGroupBad(groupName) || isChannelBad(displayName)) {
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
   * 4. TXT 处理（分组独立过滤 + 权重排序 + 去重）
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
        skipG = isGroupBad(gName); // 【独立判定分组】
        if (!skipG) {
          curG = gName;
          if (!groups[curG]) { groups[curG] = []; groupOrder.push(curG); }
        }
      } else if (t.includes(',')) {
        if (skipG) return;
        const [name, url] = t.split(',');
        if (url && url.startsWith('http') && !isChannelBad(name)) { // 【独立判定频道】
          groups[curG].push({ name: normCCTV(name), url: url.trim() });
        }
      }
    });

    // 排序逻辑：央视 > 卫视 > 其他
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
      
      const seenUrl = new Set();
      channels.forEach(ch => {
        if (seenUrl.has(ch.url)) return;
        seenUrl.add(ch.url);
        const logo = currentLogo.replace('{channel_name}', encodeURIComponent(ch.name));
        let head = `#EXTINF:-1 tvg-name="${ch.name}" tvg-logo="${logo}" group-title="${gn}"`;
        if (RULES_CONFIG.PLAYBACK_MODE) head += ` catchup="${RULES_CONFIG.PLAYBACK_MODE}" catchup-source="${RULES_CONFIG.CATCHUP_SOURCE}"`;
        result += `${head},${ch.name}\n${ch.url}\n`;
      });
    });
    return result;
  }

  // --- 主流程 ---
  let content = global.YYKM.fetch(global.params.url);
  if (!content) return "";

  const isM3u = content.trim().startsWith('#EXTM3U');
  content = isM3u ? processM3u(content) : processTxt(content);

  // 参数替换 (replace=A->B;C->D)
  const rep = global.params.replace;
  if (rep && typeof rep === "string") {
    rep.split(";").forEach(r => {
      const idx = r.indexOf("->");
      if (idx !== -1) content = content.replaceAll(r.slice(0, idx), r.slice(idx + 2));
    });
  }

  return content;
})();