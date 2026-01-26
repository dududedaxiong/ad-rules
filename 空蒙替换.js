// ==================== 规则配置区域 ====================
const RULES_CONFIG = {
  // 外部规则文件地址
  EXTERNAL_RULES_URL: 'https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt',
  
  // 默认过滤关键字（当外部规则加载失败时作为保底）
  DEFAULT_GROUP_FILTERS: ['公告', '说明', '温馨', 'Information', '机场', 'TG频道'],
  DEFAULT_CHANNEL_FILTERS: ['t.me', 'TG群', '提醒', '不正确', '更新', '下载', '维护', '打赏', '支持', '好用', '提示', '温馨', 'HTTP'],
  
  // CCTV 识别关键字
  CCTV_CHANNEL_KEYWORDS: ['cctv', 'cetv', 'cgtn'],
  
  // 扩展参数配置
  EPG_URL: 'https://ghfast.top/https://raw.githubusercontent.com/plsy1/epg/main/e/seven-days.xml.gz',
  LOGO_URL_TEMPLATE: 'https://gcore.jsdelivr.net/gh/taksssss/tv/icon/{channel_name}.png',
  PLAYBACK_MODE: 'append',
  CATCHUP_SOURCE: '?playseek=${(b)yyyyMMddHHmmss}-${(e)yyyyMMddHHmmss}',
  DEFAULT_UA: 'YYKM/1.0',
  
  // 特殊频道映射（可用于强制改名）
  SPECIAL_CHANNEL_MAPPING: {}
};
// ==================== 规则配置区域结束 ====================

(() => {
  const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

  let groupFilters = RULES_CONFIG.DEFAULT_GROUP_FILTERS;
  let channelFilters = RULES_CONFIG.DEFAULT_CHANNEL_FILTERS;

  /**
   * 1. 加载外部规则 (同步 XMLHttpRequest)
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
        console.log('✓ 外部规则加载成功');
        return true;
      }
    } catch (e) {
      console.warn('⚠ 外部规则加载异常，使用本地默认规则');
    }
    return false;
  }

  loadExternalRules();

  /**
   * 2. 基础处理函数
   */
  
  // 规范化 CCTV 名称
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

  // 过滤检查
  function shouldFilter(text) {
    if (!text) return false;
    return groupFilters.some(f => text.includes(f)) || channelFilters.some(f => text.includes(f));
  }

  // 提取数字进行排序
  function extractNumber(name) {
    const match = name.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : Infinity;
  }

  // 核心转换逻辑
  function transformChannel(name, url) {
    let cleanName = name.trim();
    let cleanUrl = (url || "").trim();

    // 修复嵌入式 URL (如: 频道名http://...)
    if (cleanName.includes('http')) {
      const parts = cleanName.split('http');
      cleanName = parts[0].trim();
      if (!cleanUrl && parts.length > 1) {
        cleanUrl = 'http' + parts[1];
      }
    }

    if (shouldFilter(cleanName)) return null;

    // 特殊映射处理
    if (RULES_CONFIG.SPECIAL_CHANNEL_MAPPING[cleanName]) {
      cleanName = RULES_CONFIG.SPECIAL_CHANNEL_MAPPING[cleanName].name;
    }

    // CCTV 规范化
    const isCCTV = RULES_CONFIG.CCTV_CHANNEL_KEYWORDS.some(k => cleanName.toLowerCase().includes(k));
    if (isCCTV) {
      const normalized = normalizeCCTVName(cleanName);
      if (normalized) cleanName = normalized;
    }

    return { name: cleanName, url: cleanUrl };
  }

  /**
   * 3. TXT 转 M3U 并补全参数
   */
  function processTxtToM3u(content) {
    const lines = content.split('\n');
    const groups = {};
    const groupOrder = [];
    let currentGroupName = "其他";
    let skipCurrentGroup = false;

    // 分类解析
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.includes(',#genre#')) {
        const gName = trimmed.split(',')[0].trim();
        skipCurrentGroup = shouldFilter(gName);
        if (!skipCurrentGroup) {
          currentGroupName = gName;
          if (!groups[currentGroupName]) {
            groups[currentGroupName] = [];
            groupOrder.push(currentGroupName);
          }
        }
      } else if (trimmed.includes(',')) {
        if (skipCurrentGroup) continue;
        const [name, url] = trimmed.split(',');
        const result = transformChannel(name, url);
        if (result && result.url) {
          groups[currentGroupName].push(result);
        }
      }
    }

    // 分组排序逻辑 (CCTV > 卫视 > 其他)
    const sortedGroupNames = groupOrder.sort((a, b) => {
      const getWeight = (n) => {
        const un = n.toUpperCase();
        if (un.includes('CCTV') || un.includes('CETV') || un.includes('CGTN')) return 1;
        if (un.includes('卫视')) return 2;
        return 3;
      };
      return getWeight(a) - getWeight(b) || a.localeCompare(b, 'zh-CN');
    });

    // 构建 M3U 文件头
    let m3uResult = `#EXTM3U x-tvg-url="${RULES_CONFIG.EPG_URL}"`;
    if (RULES_CONFIG.DEFAULT_UA) {
      m3uResult += ` http-user-agent="${RULES_CONFIG.DEFAULT_UA}"`;
    }
    m3uResult += "\n";

    // 构建频道列表
    for (const gName of sortedGroupNames) {
      const channels = groups[gName];
      // 频道内按数字排序
      channels.sort((a, b) => extractNumber(a.name) - extractNumber(b.name) || a.name.localeCompare(b.name, 'zh-CN'));

      const seenUrls = new Set();
      for (const chan of channels) {
        if (seenUrls.has(chan.url)) continue;
        seenUrls.add(chan.url);

        const logoUrl = RULES_CONFIG.LOGO_URL_TEMPLATE.replace('{channel_name}', encodeURIComponent(chan.name));
        
        // 拼接标签
        let extinf = `#EXTINF:-1 tvg-name="${chan.name}" tvg-logo="${logoUrl}" group-title="${gName}"`;
        if (RULES_CONFIG.PLAYBACK_MODE) {
          extinf += ` catchup="${RULES_CONFIG.PLAYBACK_MODE}" catchup-source="${RULES_CONFIG.CATCHUP_SOURCE}"`;
        }
        
        m3uResult += `${extinf},${chan.name}\n${chan.url}\n`;
      }
    }
    return m3uResult;
  }

  /**
   * 4. M3U 原始格式处理 (维持原有逻辑，仅清洗)
   */
  function processM3uFormat(content) {
    const lines = content.split('\n');
    const seen = new Set();
    const result = [];
    let skipNextUrl = false;
    let pendingExtinf = null;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#EXTM3U')) {
        if (trimmedLine.startsWith('#EXTM3U')) result.push(trimmedLine);
        continue;
      }
      
      if (trimmedLine.startsWith('#EXTINF')) {
        skipNextUrl = shouldFilter(trimmedLine);
        if (!skipNextUrl) {
          const displayName = trimmedLine.split(',').pop();
          const transformed = transformChannel(displayName, "");
          if (transformed) {
            pendingExtinf = trimmedLine.replace(displayName, transformed.name);
          } else {
            skipNextUrl = true;
          }
        }
      } else if (!trimmedLine.startsWith('#')) {
        if (!skipNextUrl && pendingExtinf !== null) {
          if (!seen.has(trimmedLine)) {
            seen.add(trimmedLine);
            result.push(pendingExtinf);
            result.push(trimmedLine);
          }
          pendingExtinf = null;
        }
        skipNextUrl = false;
      }
    }
    return result.join('\n');
  }

  /**
   * 5. 主程序入口
   */
  let content = global.YYKM.fetch(global.params.url);
  const isM3u = content.trim().startsWith('#EXTM3U');

  // 如果是 TXT 格式，执行过滤、排序并转换补全
  // 如果是 M3U 格式，则执行标准清洗
  content = isM3u ? processM3uFormat(content) : processTxtToM3u(content);

  // 最后执行通用的 replace 参数替换
  const replaceParam = global.params.replace;
  if (typeof replaceParam === "string" && replaceParam.length > 0) {
    const rules = replaceParam.split(";");
    for (const rule of rules) {
      const idx = rule.indexOf("->");
      if (idx === -1) continue;
      const from = rule.slice(0, idx);
      const to = rule.slice(idx + 2);
      content = content.replaceAll(from, to);
    }
  }

  return content;
})();