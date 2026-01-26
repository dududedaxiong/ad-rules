(() => {
const global =
typeof globalThis !== "undefined"
? globalThis
: typeof window !== "undefined"
? window
: this;  

// ========== 配置区域 ==========
// 内置过滤规则
const DEFAULT_GROUP_FILTERS = ['公告', '说明', '温馨', 'Information', '机场', 'TG频道'];
const DEFAULT_CHANNEL_FILTERS = ['t.me', 'TG群', '提醒', '不正确', '更新', '下载', '维护', '打赏', '支持', '好用', '提示', '温馨', '免费订阅', 'HTTP'];

const CCTV_CHANNEL_KEYWORDS = ['cctv', 'cetv', 'cgtn'];

// ========== 配置区域结束 ==========

let content = global.YYKM.fetch(global.params.url);

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

// 检查是否应该过滤
function shouldFilter(text) {
  return DEFAULT_GROUP_FILTERS.some(filter => text.includes(filter)) || 
         DEFAULT_CHANNEL_FILTERS.some(filter => text.includes(filter));
}

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

// 转换频道信息（规范化CCTV名称）
const transformChannel = (channel) => {  
    fixNameWithEmbeddedUrl(channel);  
  
    if (shouldFilter(channel)) return undefined;  
  
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

// 对频道进行排序
function sortChannels(channels) {
    return channels.sort((a, b) => {
        const isCCTVa = /^CCTV|^CETV|^CGTN/i.test(a.name);
        const isCCTVb = /^CCTV|^CETV|^CGTN/i.test(b.name);
        
        // CCTV频道优先
        if (isCCTVa && !isCCTVb) return -1;
        if (!isCCTVa && isCCTVb) return 1;
        
        // 都是CCTV频道，按数字排序
        if (isCCTVa && isCCTVb) {
            const numA = parseInt(a.name.match(/\d+/)?.[0] || 0);
            const numB = parseInt(b.name.match(/\d+/)?.[0] || 0);
            if (numA !== numB) return numA - numB;
            // 数字相同，按后缀排序
            return a.name.localeCompare(b.name, 'zh-CN');
        }
        
        // 都不是CCTV，按中文排序
        return a.name.localeCompare(b.name, 'zh-CN');
    });
}

// 自动检测格式
function detectFormat(content) {
  return content.trim().startsWith('#EXTM3U') ? 'M3U' : 'TXT';
}

// 处理普通格式源
function processTxtFormat(content) {
  const lines = content.split('\n');
  const groups = {};
  let currentGroup = null;
  
  // 先按分组收集数据
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (!trimmedLine) continue;
    
    if (trimmedLine.match(/^.+,#genre#$/)) {
      const groupName = trimmedLine.split(',')[0].trim();
      
      if (shouldFilter(groupName)) {
        currentGroup = null;
        continue;
      }
      
      currentGroup = groupName;
      if (!groups[currentGroup]) {
        groups[currentGroup] = {
          name: currentGroup,
          channels: []
        };
      }
    
    else if (trimmedLine.match(/^.+,.+$/) && currentGroup) {
      if (shouldFilter(trimmedLine)) {
        continue;
      }
      
      const parts = trimmedLine.split(',');
      const channelName = parts[0].trim();
      const channelUrl = parts[1].trim();
      
      const transformed = transformChannel({ name: channelName, url: channelUrl });
      
      if (transformed) {
        groups[currentGroup].channels.push(transformed);
      }
    }
  }
  
  // 对每个分组内的频道进行排序
  const result = [];
  for (const groupName in groups) {
    result.push(`${groupName},#genre#`);
    const sortedChannels = sortChannels(groups[groupName].channels);
    for (const channel of sortedChannels) {
      result.push(`${channel.name},${channel.url}`);
    }
  }
  
  return result.join('\n');
}

// 处理M3U格式源
function processM3uFormat(content) {
  const lines = content.split('\n');
  const result = [];
  const channels = [];
  let currentExtinf = '';
  
  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim();
    
    if (!trimmedLine) continue;
    
    if (trimmedLine.startsWith('#EXTM3U')) {
      result.push(trimmedLine);
      continue;
    }
    
    if (trimmedLine.startsWith('#EXTINF')) {
      if (shouldFilter(trimmedLine)) {
        // 跳过这个EXTINF和对应的URL
        if (i + 1 < lines.length && !lines[i + 1].trim().startsWith('#')) {
          i++;
        }
        continue;
      }
      
      const displayName = trimmedLine.split(',').pop();
      const transformed = transformChannel({ name: displayName, url: null });
      
      if (transformed) {
        const newExtinf = trimmedLine.replace(displayName, transformed.name);
        channels.push({
          extinf: newExtinf,
          name: transformed.name,
          url: ''
        });
      }
     else if (!trimmedLine.startsWith('#') && trimmedLine && channels.length > 0) {
      channels[channels.length - 1].url = trimmedLine;
    }
  }
  
  // 对频道排序
  const sortedChannels = sortChannels(channels);
  
  for (const channel of sortedChannels) {
    result.push(channel.extinf);
    result.push(channel.url);
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