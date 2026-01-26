(() => {
const global =
typeof globalThis !== "undefined"
? globalThis
: typeof window !== "undefined"
? window
: this;  

// ========== 配置区域（方便维护）==========
const EXTERNAL_RULES_URL = 'https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt';

const DEFAULT_GROUP_FILTERS = ['公告', '说明', '温馨', 'Information', '机场', 'TG频道'];
const DEFAULT_CHANNEL_FILTERS = ['t.me', 'TG群', '提醒', '不正确', '更新', '下载', '维护', '打赏', '支持', '好用', '提示', '温馨', '免费订阅', 'HTTP'];

const CCTV_CHANNEL_KEYWORDS = ['cctv', 'cetv', 'cgtn'];
const SPECIAL_CHANNEL_MAPPING = {};

// ========== 配置区域结束 ==========

// 规范化CCTV频道名称
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

// 检查是否包含关键词
function includesAnyKeyword(name, keywords) {
    return keywords.some(keyword => name.toLowerCase().includes(keyword));
}

// 排序CCTV频道
const sortCCTVChannels = (channels) => {  
    return channels.sort((a, b) => {  
        const nameA = a.name;  
        const nameB = b.name;  
  
        const extractNum = (name) => {  
            const match = name.match(/CCTV[\s-]*(\d+)/i);  
            return match ? parseInt(match[1], 10) : null;  
        };  
  
        const numA = extractNum(nameA);  
        const numB = extractNum(nameB);  
  
        if (numA !== null && numB !== null) {  
            if (numA !== numB) return numA - numB;  
            return nameA.localeCompare(nameB, 'zh-CN');  
        } else if (numA !== null) return -1;  
        else if (numB !== null) return 1;  
  
        const restA = nameA.replace(/^CCTV[\s-]*\d*/i, '').trim();  
        const restB = nameB.replace(/^CCTV[\s-]*\d*/i, '').trim();  
  
        const isEnglishA = /^[A-Za-z]/.test(restA);  
        const isEnglishB = /^[A-Za-z]/.test(restB);  
  
        if (isEnglishA && !isEnglishB) return -1;  
        if (!isEnglishA && isEnglishB) return 1;  
  
        return nameA.localeCompare(nameB, 'zh-CN');  
    });  
};

// 修复嵌入URL的名称
function fixNameWithEmbeddedUrl(channel) {
    if (channel.name && channel.name.includes('http')) {
        const parts = channel.name.split('http');
        channel.name = parts[0].trim();
        if (!channel.url && parts.length > 1) {
            channel.url = 'http' + parts[1];
        }
    }
}

// 检查是否应该过滤频道
function shouldFilterChannel(channel) {
    const name = typeof channel === 'string' ? channel : channel.name;
    return DEFAULT_CHANNEL_FILTERS.some(filter => name.includes(filter));
}

// 转换频道信息
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
    
    return {
        name: newName,
        url: channel.url || null
    };
};

// 获取过滤规则
let groupFilters = DEFAULT_GROUP_FILTERS;
let channelFilters = DEFAULT_CHANNEL_FILTERS;

try {
  const externalRules = global.YYKM.fetch(EXTERNAL_RULES_URL);
  const rulesLines = externalRules.split('\n');
  
  for (const line of rulesLines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('GROUP_FILTERS=')) {
      groupFilters = trimmed.replace('GROUP_FILTERS=', '').split('|').map(f => f.trim()).filter(f => f);
    } else if (trimmed.startsWith('CHANNEL_FILTERS=')) {
      channelFilters = trimmed.replace('CHANNEL_FILTERS=', '').split('|').map(f => f.trim()).filter(f => f);
    }
  }
} catch (e) {
  // 使用默认规则
}

let content = global.YYKM.fetch(global.params.url);

// 检查是否应该过滤
function shouldFilter(text) {
  return groupFilters.some(filter => text.includes(filter)) || 
         channelFilters.some(filter => text.includes(filter));
}

// 自动检测格式
function detectFormat(content) {
  return content.trim().startsWith('#EXTM3U') ? 'M3U' : 'TXT';
}

// 处理普通格式源
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
      
      if (!skipCurrentGroup) {
        if (!seen.has(trimmedLine)) {
          seen.add(trimmedLine);
          result.push(trimmedLine);
        }
      }
    }
    else if (trimmedLine.match(/^.+,.+$/)) {
      if (skipCurrentGroup) {
        continue;
      }
      
      if (shouldFilter(trimmedLine)) {
        continue;
      }
      
      const parts = trimmedLine.split(',');
      const channelName = parts[0].trim();
      const channelUrl = parts[1].trim();
      
      const transformed = transformChannel({ name: channelName, url: channelUrl });
      
      if (transformed) {
        const transformedLine = `${transformed.name},${transformed.url}`;
        if (!seen.has(transformedLine)) {
          seen.add(transformedLine);
          result.push(transformedLine);
        }
      }
    }
  }
  
  return result.join('\n');
}

// 处理M3U格式源
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
      if (!skipNextUrl) {
        if (!seen.has(trimmedLine)) {
          seen.add(trimmedLine);
          result.push(trimmedLine);
        }
      }
      skipNextUrl = false;
    }
  }
  
  return result.join('\n');
}

// 检测格式并处理
const format = detectFormat(content);

if (format === 'M3U') {
  content = processM3uFormat(content);
} else {
  content = processTxtFormat(content);
}

// 执行用户定义的替换规则
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