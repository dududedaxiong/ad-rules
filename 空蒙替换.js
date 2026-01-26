// ==================== 规则配置区域 ====================
const RULES_CONFIG = {
  // 外部规则文件地址
  EXTERNAL_RULES_URL: 'https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt',
  
  // 1. 分组过滤 (并集模式：本地 + 外部)
  // 只要分组名包含以下词汇，整组剔除。例如：包含“冰茶”则“冰茶体育”、“冰茶公告”全杀。
  LOCAL_GROUP_FILTERS: ['公告', '说明', '温馨', 'Information', '机场', 'TG频道', '更新列表', '更新时间', '冰茶'],
  
  // 2. 频道过滤 (并集模式：本地 + 外部)
  // 只要频道名包含以下词汇，该频道剔除。
  LOCAL_CHANNEL_FILTERS: [
    't.me', '提示', '提醒', '温馨', '说明', '公告', '更新', 'TG', '电报', 'QQ', '钉钉', '微信', 
    '下载', '免费', '进群', '贩卖', '用爱发电', '上当', '死', '盗源', '白嫖', '隐藏', '增加', 
    '失联', '关注', '迷路', '扫码', '入群', '组织', '支持', '赞助', '添加', '私信', '查询'
  ],
  
  // 默认配置参数
  EPG_URL: 'https://ghfast.top/https://raw.githubusercontent.com/plsy1/epg/main/e/seven-days.xml.gz',
  LOGO_URL_TEMPLATE: 'https://gcore.jsdelivr.net/gh/taksssss/tv/icon/{channel_name}.png',
  DEFAULT_UA: 'YYKM/1.0',
  CCTV_KEYWORDS: ['cctv', 'cetv', 'cgtn', '央视']
};
// ==================== 规则配置区域结束 ====================

(() => {
  const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

  // 使用 Set 存储规则，确保去重且匹配高效
  let groupFilters = new Set(RULES_CONFIG.LOCAL_GROUP_FILTERS.map(s => s.toLowerCase()));
  let channelFilters = new Set(RULES_CONFIG.LOCAL_CHANNEL_FILTERS.map(s => s.toLowerCase()));
  let currentEPG = RULES_CONFIG.EPG_URL;
  let currentLogo = RULES_CONFIG.LOGO_URL_TEMPLATE;
  let currentUA = RULES_CONFIG.DEFAULT_UA;

  /**
   * 1. 加载外部规则并合并 (实现并集)
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
    } catch (e) {
      console.warn('⚠ 外部规则读取失败，仅使用本地缓存规则');
    }
  }
  syncExternalRules();

  /**
   * 2. 核心模糊匹配算法
   */
  function isGroupBad(name) {
    if (!name) return false;
    const target = name.toLowerCase().replace(/\s+/g, ''); // 移除所有空格进行极致模糊匹配
    for (let f of groupFilters) {
      if (target.includes(f.replace(/\s+/g, ''))) return true;
    }
    return false;
  }

  function isChannelBad(name) {
    if (!name) return false;
    const target = name.toLowerCase().replace(/\s+/g, '');
    for (let f of channelFilters) {
      if (target.includes(f.replace(/\s+/g, ''))) return true;
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
   * 3. M3U 处理 (分组/频道独立过滤)
   */
  function processM3u(content) {
    const lines = content.split(/\r?\n/);
    let res = `#EXTM3U x-tvg-url="${currentEPG}" http-user-agent="${currentUA}"\n`;
    const seenUrls = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#EXTM3U')) continue;

      if (line.startsWith('#EXTINF')) {
        const groupMatch = line.match(/group-title="([^"]+)"/i);
        const groupName = groupMatch ? groupMatch[1] : "";
        const displayName = line.split(',').pop();

        // 【解耦判定】分组包含关键词 OR 频道包含关键词，则剔除
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
   * 4. TXT 处理 (分组/频道独立过滤)
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
        skipG = isGroupBad(gName); // 【独立分组过滤】
        if (!skipG) {
          curG = gName;
          if (!groups[curG]) { groups[curG] = []; groupOrder.push(curG); }
        }
      } else if (t.includes(',')) {
        if (skipG) return;
        const [name, url] = t.split(',');
        if (url && url.startsWith('http') && !isChannelBad(name)) { // 【独立频道过滤】
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
        result += `#EXTINF:-1 tvg-name="${ch.name}" tvg-logo="${logo}" group-title="${gn}",${ch.name}\n${ch.url}\n`;
      });
    });
    return result;
  }

  // --- 主流程 ---
  let content = global.YYKM.fetch(global.params.url);
  if (!content) return "";

  const isM3u = content.trim().startsWith('#EXTM3U');
  content = isM3u ? processM3u(content) : processTxt(content);

  // replace 参数执行
  const rep = global.params.replace;
  if (rep && typeof rep === "string") {
    rep.split(";").forEach(r => {
      const idx = r.indexOf("->");
      if (idx !== -1) content = content.replaceAll(r.slice(0, idx), r.slice(idx + 2));
    });
  }

  return content;
})();