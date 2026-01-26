// ==================== 规则配置区域 ====================
const RULES_CONFIG = {
  EXTERNAL_RULES_URL: 'https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt',
  DEFAULT_GROUP_FILTERS: ['公告', '说明', '温馨', 'Information', '机场', 'TG频道'],
  DEFAULT_CHANNEL_FILTERS: ['t.me', 'TG群', '提醒', '不正确', '更新', '下载', '维护', '打赏', '支持', '好用', '提示', '温馨', 'HTTP'],
  CCTV_CHANNEL_KEYWORDS: ['cctv', 'cetv', 'cgtn'],
  SPECIAL_CHANNEL_MAPPING: {}
};
// ==================== 规则配置区域结束 ====================

(() => {
  const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

  let groupFilters = RULES_CONFIG.DEFAULT_GROUP_FILTERS;
  let channelFilters = RULES_CONFIG.DEFAULT_CHANNEL_FILTERS;

  // ==================== 核心功能：外部规则加载 ====================
  function loadExternalRules() {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', RULES_CONFIG.EXTERNAL_RULES_URL, false); // 同步请求
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
      console.warn('⚠ 外部规则加载异常，使用本地规则');
    }
    return false;
  }

  loadExternalRules();

  const CCTV_CHANNEL_KEYWORDS = RULES_CONFIG.CCTV_CHANNEL_KEYWORDS;
  const SPECIAL_CHANNEL_MAPPING = RULES_CONFIG.SPECIAL_CHANNEL_MAPPING;

  // ==================== 数据处理工具函数 ====================
  
  // CCTV 名称规范化
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

  // 检查是否包含过滤关键字
  function shouldFilter(text) {
    if (!text) return false;
    return groupFilters.some(filter => text.includes(filter)) || 
           channelFilters.some(filter => text.includes(filter));
  }

  // 提取数字用于排序
  function extractNumber(name) {
    const match = name.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : Infinity;
  }

  // 修正嵌入在名称中的 URL
  function fixNameWithEmbeddedUrl(name, url) {
    let finalName = name;
    let finalUrl = url;
    if (name && name.includes('http')) {
      const parts = name.split('http');
      finalName = parts[0].trim();
      if (!finalUrl && parts.length > 1) {
        finalUrl = 'http' + parts[1];
      }
    }
    return { name: finalName, url: finalUrl };
  }

  // 频道转换逻辑（规范化名称、特殊映射）
  function transformChannel(name, url) {
    let { name: fixedName, url: fixedUrl } = fixNameWithEmbeddedUrl(name, url);
    
    if (shouldFilter(fixedName)) return null;

    if (SPECIAL_CHANNEL_MAPPING[fixedName]) {
      return { name: SPECIAL_CHANNEL_MAPPING[fixedName].name, url: fixedUrl };
    }

    let newName = fixedName.trim();
    const isCCTV = CCTV_CHANNEL_KEYWORDS.some(keyword => fixedName.toLowerCase().includes(keyword));
    if (isCCTV) {
      const normalized = normalizeCCTVName(fixedName);
      if (normalized) newName = normalized;
    }
    return { name: newName, url: fixedUrl };
  }

  // ==================== TXT 处理、排序并转 M3U ====================
  function processTxtToM3u(content) {
    const lines = content.split('\n');
    const groups = {}; // 格式: { "分组名": [ {name, url}, ... ] }
    const groupOrder = []; 
    let currentGroupName = "其他";
    let skipCurrentGroup = false;

    // 1. 解析与分类
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.includes(',#genre#')) {
        const groupName = trimmed.split(',')[0].trim();
        skipCurrentGroup = shouldFilter(groupName);
        if (!skipCurrentGroup) {
          currentGroupName = groupName;
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

    // 2. 确定大类排序权重
    const getGroupWeight = (name) => {
      const n = name.toUpperCase();
      if (n.includes('CCTV') || n.includes('CETV') || n.includes('CGTN')) return 1;
      if (n.includes('卫视')) return 2;
      return 3;
    };

    const sortedGroupNames = groupOrder.sort((a, b) => {
      const weightA = getGroupWeight(a);
      const weightB = getGroupWeight(b);
      if (weightA !== weightB) return weightA - weightB;
      return a.localeCompare(b, 'zh-CN');
    });

    // 3. 构建 M3U 字符串
    let m3uResult = "#EXTM3U\n";
    for (const gName of sortedGroupNames) {
      const channels = groups[gName];
      if (!channels || channels.length === 0) continue;

      // 频道内排序：数字优先，其次拼音
      channels.sort((a, b) => {
        const numA = extractNumber(a.name);
        const numB = extractNumber(b.name);
        if (numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name, 'zh-CN');
      });

      // 去重输出
      const seenUrls = new Set();
      for (const chan of channels) {
        if (seenUrls.has(chan.url)) continue;
        seenUrls.add(chan.url);
        m3uResult += `#EXTINF:-1 group-title="${gName}",${chan.name}\n${chan.url}\n`;
      }
    }
    return m3uResult;
  }

  // ==================== M3U 格式原始处理 (保持原逻辑) ====================
  function processM3uFormat(content) {
    const lines = content.split('\n');
    const seen = new Set();
    const result = [];
    let skipNextUrl = false;
    let pendingExtinf = null;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      if (trimmedLine.startsWith('#EXTM3U')) {
        result.push(trimmedLine);
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
          const uniqueKey = pendingExtinf + trimmedLine;
          if (!seen.has(uniqueKey)) {
            seen.add(uniqueKey);
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

  // ==================== 主流程 ====================
  let content = global.YYKM.fetch(global.params.url);
  const isM3u = content.trim().startsWith('#EXTM3U');

  if (isM3u) {
    // 如果本来就是 M3U，执行清洗去重
    content = processM3uFormat(content);
  } else {
    // 如果是 TXT，执行：清洗 -> 分类 -> 排序 -> 转成 M3U
    content = processAndConvertToM3u_Fixed();
  }

  // 内部调用的快捷转换（确保上下文一致）
  function processAndConvertToM3u_Fixed() {
    return processTxtToM3u(content);
  }

  // 执行最终的参数替换 (replace=A->B;C->D)
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