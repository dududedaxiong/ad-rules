// ==================== 规则配置区域 ====================
const RULES_CONFIG = {
  // 外部规则文件地址
  EXTERNAL_RULES_URL: 'https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt',
  
  // 默认过滤关键字（外部加载失败时的保底）
  DEFAULT_GROUP_FILTERS: ['公告', '说明', '温馨', 'Information', '机场', 'TG频道'],
  DEFAULT_CHANNEL_FILTERS: ['t.me', 'TG群', '提醒', '不正确', '更新', '下载', '维护', '打赏', '支持', '好用', '提示', '温馨', 'HTTP', '广告'],
  
  // CCTV 识别关键字
  CCTV_CHANNEL_KEYWORDS: ['cctv', 'cetv', 'cgtn'],
  
  // 补全配置项
  EPG_URL: 'https://ghfast.top/https://raw.githubusercontent.com/plsy1/epg/main/e/seven-days.xml.gz',
  LOGO_URL_TEMPLATE: 'https://gcore.jsdelivr.net/gh/taksssss/tv/icon/{channel_name}.png',
  PLAYBACK_MODE: 'append',
  CATCHUP_SOURCE: '',
  DEFAULT_UA: 'okHttp/Mod-1.5.0.0',
  
  // 特殊频道映射纠错
  SPECIAL_CHANNEL_MAPPING: {}
};
// ==================== 规则配置区域结束 ====================

(() => {
  const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

  let groupFilters = RULES_CONFIG.DEFAULT_GROUP_FILTERS;
  let channelFilters = RULES_CONFIG.DEFAULT_CHANNEL_FILTERS;

  /**
   * 1. 外部规则加载 (同步请求)
   */
  function loadExternalRules() {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', RULES_CONFIG.EXTERNAL_RULES_URL, false);
      xhr.send();
      if (xhr.status === 200 && xhr.responseText) {
        const rulesLines = xhr.responseText.split('\n');
        for (const line of rulesLines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('GROUP_FILTERS=')) {
            groupFilters = trimmed.replace('GROUP_FILTERS=', '').split('|').map(f => f.trim()).filter(f => f);
          } else if (trimmed.startsWith('CHANNEL_FILTERS=')) {
            channelFilters = trimmed.replace('CHANNEL_FILTERS=', '').split('|').map(f => f.trim()).filter(f => f);
          }
        }
        return true;
      }
    } catch (e) { console.warn('外部规则同步失败，启用内置规则'); }
    return false;
  }

  loadExternalRules();

  /**
   * 2. 通用处理工具
   */
  function normalizeCCTVName(name) {
    const trimmed = name.trim();
    const match = trimmed.match(/^(cctv|cetv|cgtn)[\s-]*(\d+)(.*?)$/i);
    if (match) {
      const prefix = match[1].toUpperCase();
      const number = match[2];
      const suffix = match[3].trim();
      return suffix ? `${prefix}-${number} ${suffix}` : `${prefix}-${number}`;
    }
    return null;
  }

  function isFiltered(text) {
    if (!text) return true; // 剔除空频道
    return groupFilters.some(f => text.includes(f)) || channelFilters.some(f => text.includes(f));
  }

  function transformChannel(name, url) {
    let cleanName = name.trim();
    let cleanUrl = (url || "").trim();
    
    // 剔除空链接或被过滤的频道
    if (!cleanUrl || isFiltered(cleanName)) return null;

    const isCCTV = RULES_CONFIG.CCTV_CHANNEL_KEYWORDS.some(k => cleanName.toLowerCase().includes(k));
    if (isCCTV) {
      const normalized = normalizeCCTVName(cleanName);
      if (normalized) cleanName = normalized;
    }
    return { name: cleanName, url: cleanUrl };
  }

  /**
   * 3. M3U 格式：插入 EPG 逻辑
   */
  function processM3uInplace(content) {
    const lines = content.split('\n');
    let output = "";
    let headInserted = false;
    const extraEpg = `x-tvg-url="${RULES_CONFIG.EPG_URL}" http-user-agent="${RULES_CONFIG.DEFAULT_UA}"`;

    for (let line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('#EXTM3U')) {
        output += trimmed + " " + extraEpg + "\n";
        headInserted = true;
      } else {
        output += line + "\n";
      }
    }
    return headInserted ? output : `#EXTM3U ${extraEpg}\n` + output;
  }

  /**
   * 4. TXT 格式：过滤 -> 分类 -> 排序 -> 去重 -> 转 M3U
   */
  function processTxtToM3u(content) {
    const lines = content.split('\n');
    const groups = {};
    const groupOrder = []; // 维护分组出现顺序
    let currentGroupName = "其他";
    let skipGroup = false;

    // 解析、过滤与分类
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.includes(',#genre#')) {
        const gName = trimmed.split(',')[0].trim();
        skipGroup = isFiltered(gName);
        if (!skipGroup) {
          currentGroupName = gName;
          if (!groups[currentGroupName]) {
            groups[currentGroupName] = [];
            groupOrder.push(currentGroupName);
          }
        }
      } else if (trimmed.includes(',')) {
        if (skipGroup) continue;
        const [name, url] = trimmed.split(',');
        const res = transformChannel(name, url);
        if (res) groups[currentGroupName].push(res);
      }
    }

    // 分组排序：央视 > 卫视 > 其他
    const sortedGroupNames = groupOrder.sort((a, b) => {
      const getWeight = (n) => {
        const un = n.toUpperCase();
        if (un.includes('CCTV') || un.includes('央视')) return 1;
        if (un.includes('卫视')) return 2;
        return 3;
      };
      return getWeight(a) - getWeight(b) || a.localeCompare(b, 'zh-CN');
    });

    // 构建结果
    let result = `#EXTM3U x-tvg-url="${RULES_CONFIG.EPG_URL}" http-user-agent="${RULES_CONFIG.DEFAULT_UA}"\n`;
    
    for (const gName of sortedGroupNames) {
      const channels = groups[gName];
      // 频道内排序：按数字
      channels.sort((a, b) => {
        const numA = parseInt(a.name.match(/\d+/)) || 999;
        const numB = parseInt(b.name.match(/\d+/)) || 999;
        return numA - numB || a.name.localeCompare(b.name, 'zh-CN');
      });

      const seenUrls = new Set();
      for (const chan of channels) {
        if (seenUrls.has(chan.url)) continue; // 去重
        seenUrls.add(chan.url);

        const logo = RULES_CONFIG.LOGO_URL_TEMPLATE.replace('{channel_name}', encodeURIComponent(chan.name));
        let extinf = `#EXTINF:-1 tvg-name="${chan.name}" tvg-logo="${logo}" group-title="${gName}"`;
        if (RULES_CONFIG.PLAYBACK_MODE) {
          extinf += ` catchup="${RULES_CONFIG.PLAYBACK_MODE}" catchup-source="${RULES_CONFIG.CATCHUP_SOURCE}"`;
        }
        result += `${extinf},${chan.name}\n${chan.url}\n`;
      }
    }
    return result;
  }

  /**
   * 5. 主流程
   */
  let content = global.YYKM.fetch(global.params.url);
  if (!content) return "";

  const isM3u = content.trim().startsWith('#EXTM3U');

  // 执行核心逻辑
  content = isM3u ? processM3uInplace(content) : processTxtToM3u(content);

  // 参数替换 (replace=A->B;C->D)
  const replaceParam = global.params.replace;
  if (typeof replaceParam === "string" && replaceParam.length > 0) {
    replaceParam.split(";").forEach(rule => {
      const idx = rule.indexOf("->");
      if (idx !== -1) {
        content = content.replaceAll(rule.slice(0, idx), rule.slice(idx + 2));
      }
    });
  }

  return content;
})();