// ==================== 规则配置区域 ====================
const RULES_CONFIG = {
  // 外部规则地址
  EXTERNAL_RULES_URL: 'https://ghfast.top/https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt',
  
  // 本地保底过滤规则 (与外部规则自动合并)
  LOCAL_GROUP_FILTERS: ['公告', '说明', '温馨', 'Information', '机场', 'TG频道', '更新列表', '更新时间'],
  LOCAL_CHANNEL_FILTERS: [
    't.me', '提示', '提醒', '温馨', '说明', '公告', '更新', 'TG', '电报', 'QQ', '钉钉', '微信', 
    '下载', '免费', '进群', '贩卖', '用爱发电', '上当', '死', '盗源', '白嫖', '隐藏', '增加', 
    '失联', '关注', '迷路', '扫码', '入群', '组织', '支持', '赞助', '添加', '私信', '查询'
  ],
  
  // 默认参数 (如果外部规则没写这些字段，则用这里的)
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

  // 初始化：先加载本地缓存的默认规则
  let groupFilters = new Set(RULES_CONFIG.LOCAL_GROUP_FILTERS);
  let channelFilters = new Set(RULES_CONFIG.LOCAL_CHANNEL_FILTERS);
  let currentEPG = RULES_CONFIG.EPG_URL;
  let currentLogo = RULES_CONFIG.LOGO_URL_TEMPLATE;
  let currentUA = RULES_CONFIG.DEFAULT_UA;

  /**
   * 加载并合并外部规则
   */
  function syncExternalRules() {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', RULES_CONFIG.EXTERNAL_RULES_URL, false);
      xhr.send();
      if (xhr.status === 200 && xhr.responseText) {
        const lines = xhr.responseText.split('\n');
        lines.forEach(line => {
          const t = line.trim();
          if (!t || !t.includes('=')) return;
          const [key, value] = [t.split('=')[0].trim(), t.split('=').slice(1).join('=').trim()];
          
          if (key === 'GROUP_FILTERS') value.split('|').forEach(s => groupFilters.add(s.trim()));
          if (key === 'CHANNEL_FILTERS') value.split('|').forEach(s => channelFilters.add(s.trim()));
          if (key === 'EPG_URL' && value) currentEPG = value;
          if (key === 'LOGO_URL_TEMPLATE' && value) currentLogo = value;
          if (key === 'DEFAULT_UA' && value) currentUA = value;
        });
        console.log('✓ 规则合并完成');
      }
    } catch (e) {
      console.warn('⚠ 外部规则读取失败，仅使用本地缓存规则');
    }
  }

  syncExternalRules();

  // 工具：判断是否过滤
  function isBad(text) {
    if (!text) return true;
    for (let f of groupFilters) if (text.includes(f)) return true;
    for (let f of channelFilters) if (text.includes(f)) return true;
    return false;
  }

  // 工具：CCTV 规范化
  function normName(name) {
    const t = name.trim();
    const m = t.match(/^(cctv|cetv|cgtn)[\s-]*(\d+)(.*?)$/i);
    if (m) {
      const prefix = m[1].toUpperCase();
      return m[3].trim() ? `${prefix}-${m[2]} ${m[3].trim()}` : `${prefix}-${m[2]}`;
    }
    return t;
  }

  /**
   * 处理 M3U 格式 (插入EPG+清洗)
   */
  function processM3u(content) {
    const lines = content.split('\n');
    let res = `#EXTM3U x-tvg-url="${currentEPG}" http-user-agent="${currentUA}"\n`;
    let skip = false;
    const seen = new Set();

    lines.forEach(line => {
      const t = line.trim();
      if (!t || t.startsWith('#EXTM3U')) return;
      if (t.startsWith('#EXTINF')) {
        skip = isBad(t);
        if (!skip) {
          const parts = t.split(',');
          const rawName = parts.pop();
          const cleanName = normName(rawName);
          const logo = currentLogo.replace('{channel_name}', encodeURIComponent(cleanName));
          // 重组标签，确保Logo和Name准确
          let info = parts.join(',').replace(/tvg-logo="[^"]*"/, `tvg-logo="${logo}"`);
          if (!info.includes('tvg-logo')) info = info.replace('#EXTINF:-1', `#EXTINF:-1 tvg-logo="${logo}"`);
          res += info + ',' + cleanName + "\n";
        }
      } else if (!t.startsWith('#')) {
        if (!skip && !seen.has(t)) {
          seen.add(t);
          res += t + "\n";
        }
      }
    });
    return res;
  }

  /**
   * 处理 TXT 格式 (过滤/去重/排序/转M3U)
   */
  function processTxt(content) {
    const lines = content.split('\n');
    const groups = {};
    const groupOrder = [];
    let curG = "其他";
    let skipG = false;

    lines.forEach(line => {
      const t = line.trim();
      if (!t) return;
      if (t.includes(',#genre#')) {
        const gName = t.split(',')[0].trim();
        skipG = isBad(gName);
        if (!skipG) {
          curG = gName;
          if (!groups[curG]) { groups[curG] = []; groupOrder.push(curG); }
        }
      } else if (t.includes(',')) {
        if (skipG) return;
        const [name, url] = t.split(',');
        if (!isBad(name) && url && url.startsWith('http')) {
          groups[curG].push({ name: normName(name), url: url.trim() });
        }
      }
    });

    // 排序逻辑：央视 > 卫视 > 其他
    const sortedGroups = groupOrder.sort((a, b) => {
      const getW = (n) => {
        const un = n.toUpperCase();
        if (RULES_CONFIG.CCTV_KEYWORDS.some(k => un.includes(k.toUpperCase()))) return 1;
        if (un.includes('卫视')) return 2;
        return 3;
      };
      return getW(a) - getW(b) || a.localeCompare(b, 'zh-CN');
    });

    let res = `#EXTM3U x-tvg-url="${currentEPG}" http-user-agent="${currentUA}"\n`;
    sortedGroups.forEach(gn => {
      const channels = groups[gn];
      // 内部排序
      channels.sort((a, b) => (parseInt(a.name.match(/\d+/)) || 999) - (parseInt(b.name.match(/\d+/)) || 999) || a.name.localeCompare(b.name, 'zh-CN'));
      
      const seenUrl = new Set();
      channels.forEach(ch => {
        if (seenUrl.has(ch.url)) return;
        seenUrl.add(ch.url);
        const logo = currentLogo.replace('{channel_name}', encodeURIComponent(ch.name));
        let head = `#EXTINF:-1 tvg-name="${ch.name}" tvg-logo="${logo}" group-title="${gn}"`;
        if (RULES_CONFIG.PLAYBACK_MODE) head += ` catchup="${RULES_CONFIG.PLAYBACK_MODE}" catchup-source="${RULES_CONFIG.CATCHUP_SOURCE}"`;
        res += `${head},${ch.name}\n${ch.url}\n`;
      });
    });
    return res;
  }

  // --- 执行流程 ---
  let content = global.YYKM.fetch(global.params.url);
  if (!content) return "";

  const isM3u = content.trim().startsWith('#EXTM3U');
  content = isM3u ? processM3u(content) : processTxt(content);

  // 最终替换参数
  const rep = global.params.replace;
  if (rep && typeof rep === "string") {
    rep.split(";").forEach(r => {
      const idx = r.indexOf("->");
      if (idx !== -1) content = content.replaceAll(r.slice(0, idx), r.slice(idx + 2));
    });
  }

  return content;
})();