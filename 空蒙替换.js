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

// 加载外部规则（同步方式）
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
    } else {
      console.warn('⚠ 外部规则加载失败，使用本地规则');
      return false;
    }
  } catch (e) {
    console.warn('⚠ 外部规则加载异常，使用本地规则：', e.message);
    return false;
  }
}

// 必须先加载规则
const rulesLoaded = loadExternalRules();

// 只有规则加载完成后才继续往下执行
if (!rulesLoaded) {
  // 加载失败时使用本地规则
  groupFilters = RULES_CONFIG.DEFAULT_GROUP_FILTERS;
  channelFilters = RULES_CONFIG.DEFAULT_CHANNEL_FILTERS;
}

// ==================== 下面的代码可以混淆 ====================

const CCTV_CHANNEL_KEYWORDS = RULES_CONFIG.CCTV_CHANNEL_KEYWORDS;
const SPECIAL_CHANNEL_MAPPING = RULES_CONFIG.SPECIAL_CHANNEL_MAPPING;

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

function includesAnyKeyword(name, keywords) {
  return keywords.some(keyword => name.toLowerCase().includes(keyword));
}

function getChannelType(groupName) {
  if (groupName.includes('CCTV') || groupName.includes('CETV') || groupName.includes('CGTN')) {
    return 'CCTV';
  } else if (groupName.includes('卫视')) {
    return '卫视';
  }
  return '其他';
}

function extractNumber(name) {
  const match = name.match(/[\s-]?(\d+)/);
  return match ? parseInt(match[1], 10) : Infinity;
}

const globalSortChannels = (lines) => {
  const grouped = {};
  const groupOrder = [];
  let currentGroup = null;

  for (const line of lines) {
    if (line.match(/^.+,#genre#$/)) {
      const groupName = line.split(',')[0].trim();
      if (!grouped[groupName]) {
        grouped[groupName] = [];
        groupOrder.push(groupName);
      }
      currentGroup = groupName;
    } else if (line.match(/^.+,.+$/) && currentGroup) {
      grouped[currentGroup].push(line);
    }
  }

  for (const groupName in grouped) {
    grouped[groupName].sort((a, b) => {
      const nameA = a.split(',')[0].trim();
      const nameB = b.split(',')[0].trim();
      const numA = extractNumber(nameA);
      const numB = extractNumber(nameB);

      if (numA !== Infinity && numB !== Infinity) {
        return numA - numB;
      }
      return nameA.localeCompare(nameB, 'zh-CN');
    });
  }

  const typeGroups = { 'CCTV': [], '卫视': [], '其他': [] };
  for (const groupName of groupOrder) {
    const type = getChannelType(groupName);
    typeGroups[type].push(groupName);
  }

  const result = [];
  for (const type of ['CCTV', '卫视', '其他']) {
    for (const groupName of typeGroups[type]) {
      result.push(`${groupName},#genre#`);
      result.push(...grouped[groupName]);
    }
  }
  return result;
};

function fixNameWithEmbeddedUrl(channel) {
  if (channel.name && channel.name.includes('http')) {
    const parts = channel.name.split('http');
    channel.name = parts[0].trim();
    if (!channel.url && parts.length > 1) {
      channel.url = 'http' + parts[1];
    }
  }
}

function shouldFilterChannel(channel) {
  const name = typeof channel === 'string' ? channel : channel.name;
  return channelFilters.some(filter => name.includes(filter));
}

const transformChannel = (channel) => {
  fixNameWithEmbeddedUrl(channel);
  if (shouldFilterChannel(channel)) return undefined;
  if (SPECIAL_CHANNEL_MAPPING[channel.name]) {
    return { ...SPECIAL_CHANNEL_MAPPING[channel.name], url: channel.url || null };
  }
  let newName = channel.name.trim();
  if (includesAnyKeyword(channel.name, CCTV_CHANNEL_KEYWORDS)) {
    const normalized = normalizeCCTVName(channel.name);
    if (normalized) newName = normalized;
  }
  return { name: newName, url: channel.url || null };
};

let content = global.YYKM.fetch(global.params.url);

function shouldFilter(text) {
  return groupFilters.some(filter => text.includes(filter)) || channelFilters.some(filter => text.includes(filter));
}

function detectFormat(content) {
  return content.trim().startsWith('#EXTM3U') ? 'M3U' : 'TXT';
}

function processTxtFormat(content) {
  const lines = content.split('\n');
  const seen = new Set();
  const result = [];
  let skipCurrentGroup = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    if (trimmedLine.match(/^.+,#genre#$/)) {
      const groupName = trimmedLine.split(',')[0].trim();
      skipCurrentGroup = shouldFilter(groupName);
      if (!skipCurrentGroup && !seen.has(trimmedLine)) {
        seen.add(trimmedLine);
        result.push(trimmedLine);
      }
    } else if (trimmedLine.match(/^.+,.+$/)) {
      if (skipCurrentGroup || shouldFilter(trimmedLine)) continue;
      const parts = trimmedLine.split(',');
      const transformed = transformChannel({ name: parts[0].trim(), url: parts[1].trim() });
      if (transformed) {
        const transformedLine = `${transformed.name},${transformed.url}`;
        if (!seen.has(transformedLine)) {
          seen.add(transformedLine);
          result.push(transformedLine);
        }
      }
    }
  }

  const sortedResult = globalSortChannels(result);
  return sortedResult.join('\n');
}

function processM3uFormat(content) {
  const lines = content.split('\n');
  const seen = new Set();
  const result = [];
  let skipNextUrl = false;
  let lastExtinf = '';

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
        const transformed = transformChannel({ name: displayName, url: null });
        if (transformed) {
          lastExtinf = trimmedLine.replace(displayName, transformed.name);
          if (!seen.has(lastExtinf)) {
            seen.add(lastExtinf);
            result.push(lastExtinf);
          }
        } else {
          skipNextUrl = true;
        }
      }
    } else if (!trimmedLine.startsWith('#') && trimmedLine) {
      if (!skipNextUrl && !seen.has(trimmedLine)) {
        seen.add(trimmedLine);
        result.push(trimmedLine);
      }
      skipNextUrl = false;
    }
  }
  return result.join('\n');
}

const format = detectFormat(content);
content = format === 'M3U' ? processM3uFormat(content) : processTxtFormat(content);

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