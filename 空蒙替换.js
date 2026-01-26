// ==================== 规则配置区域 ====================
const RULES_CONFIG = {
  EXTERNAL_RULES_URL: 'https://ghfast.top/https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt',
  
  // 本地保底规则（与外部规则合并）
  LOCAL_GROUP_FILTERS: ['公告', '说明', '温馨', 'Information', '机场', 'TG频道', '更新列表', '更新时间'],
  LOCAL_CHANNEL_FILTERS: [
    't.me', '提示', '提醒', '温馨', '说明', '公告', '更新', 'TG', '电报', 'QQ', '钉钉', '微信', 
    '下载', '免费', '进群', '贩卖', '用爱发电', '上当', '死', '盗源', '白嫖', '隐藏', '增加', 
    '失联', '关注', '迷路', '扫码', '入群', '组织', '支持', '赞助', '添加', '私信', '查询'
  ],
  
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

  // 独立 Set 存储，确保逻辑解耦
  let groupFilters = new Set(RULES_CONFIG.LOCAL_GROUP_FILTERS);
  let channelFilters = new Set(RULES_CONFIG.LOCAL_CHANNEL_FILTERS);
  let currentEPG = RULES_CONFIG.EPG_URL;
  let currentLogo = RULES_CONFIG.LOGO_URL_TEMPLATE;
  let currentUA = RULES_CONFIG.DEFAULT_UA;

  // 1. 同步加载外部规则
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

          if (key === 'GROUP_FILTERS') val.split('|').forEach(s => groupFilters.add(s.trim()));
          if (key === 'CHANNEL_FILTERS') val.split('|').forEach(s => channelFilters.add(s.trim()));
          if (key === 'EPG_URL') currentEPG = val;
          if (key === 'LOGO_URL_TEMPLATE') currentLogo = val;
        });
      }
    } catch (e) { console.warn('外部规则加载异常'); }
  }
  syncExternalRules();

  // 2. 解耦过滤判定
  function isGroupBad(name) {
    if (!name) return true;
    for (let f of groupFilters) if (name.includes(f)) return true;
    return false;
  }

  function isChannelBad(name) {
    if (!name) return true;
    for (let f of channelFilters) if (name.includes(f)) return true;
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

  // 3. 处理 M3U 逻辑 (仅插入头部与基本清理)
  function processM3u(content) {
    const lines = content.split(/\r?\n/);
    let res = `#EXTM3U x-tvg-url="${currentEPG}" http-user-agent="${currentUA}"\n`;
    let skipLine = false;
    const seenUrls = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#EXTM3U')) continue;

      if (line.startsWith('#EXTINF')) {
        // M3U 格式中，因为通常没有 genre 标签，我们只跑频道过滤
        skipLine = isChannelBad(line);
        if (!skipLine) {
          const urlLine = lines[i+1] ? lines[i+1].trim() : "";
          if (urlLine && urlLine.startsWith('http') && !seenUrls.has(urlLine)) {
            const displayName = line.split(',').pop();
            const name = normCCTV(displayName);
            const logo = currentLogo.replace('{channel_name}', encodeURIComponent(name));
            let head = line.replace(/tvg-logo="[^"]*"/, `tvg-logo="${logo}"`);
            if (!head.includes('tvg-logo')) head = head.replace('#EXTINF:-1', `#EXTINF:-1 tvg-logo="${logo}"`);
            res += head.replace(displayName, name) + "\n" + urlLine + "\n";
            seenUrls.add(urlLine);
            i++;
          }
        }
      }
    }
    return res;
  }

  // 4. 处理 TXT 逻辑 (独立过滤 + 排序 + 去重)
  function processTxt(content) {
    const lines = content.split(/\r?\n/);
    const groups = {};
    const groupOrder = [];
    let curGroupName = "其他";
    let groupIsSkipped = false;

    lines.forEach(line => {
      const t = line.trim();
      if (!t) return;

      if (t.includes(',#genre#')) {
        const gName = t.split(',')[0].trim();
        // 分组过滤：独立判定
        groupIsSkipped = isGroupBad(gName);
        if (!groupIsSkipped) {
          curGroupName = gName;
          if (!groups[curGroupName]) {
            groups[curGroupName] = [];
            groupOrder.push(curGroupName);
          }
        }
      } else if (t.includes(',')) {
        if (groupIsSkipped) return; // 如果分组被滤掉，跳过其下所有频道
        
        const [rawName, url] = t.split(',');
        // 频道过滤：独立判定
        if (url && url.startsWith('http') && !isChannelBad(rawName)) {
          groups[curGroupName].push({ name: normCCTV(rawName), url: url.trim() });
        }
      }
    });

    // 权重排序：央视 > 卫视 > 其他
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
    sortedGroups = sortedGroupNames.forEach(gn => {
      const channels = groups[gn];
      // 频道数字排序
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

  // replace 参数处理
  const rep = global.params.replace;
  if (rep && typeof rep === "string") {
    rep.split(";").forEach(r => {
      const idx = r.indexOf("->");
      if (idx !== -1) content = content.replaceAll(r.slice(0, idx), r.slice(idx + 2));
    });
  }

  return content;
})();