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
  let epgUrl = '';
  let logoUrlTemplate = '';
  let defaultUA = '';
  let catchupSource = '';

  // 加载外部规则(同步方式)
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
           else if (trimmed.startsWith('CHANNEL_FILTERS=')) {
            channelFilters = trimmed.replace('CHANNEL_FILTERS=', '').split('|').map(f => f.trim()).filter(f => f);
          } else if (trimmed.startsWith('EPG_URL=')) {
            epgUrl = trimmed.replace('EPG_URL=', '').trim();
          } else if (trimmed.startsWith('LOGO_URL_TEMPLATE=')) {
            logoUrlTemplate = trimmed.replace('LOGO_URL_TEMPLATE=', '').trim();
          } else if (trimmed.startsWith('DEFAULT_UA=')) {
            defaultUA = trimmed.replace('DEFAULT_UA=', '').trim();
          } else if (trimmed.startsWith('CATCHUP_SOURCE=')) {
            catchupSource = trimmed.replace('CATCHUP_SOURCE=', '').trim();
          }
        }

        console.log('✓ 外部规则加载成功');
        return true;
      } else {
        console.error('✗ 外部规则加载失败: HTTP状态 ' + xhr.status);
        return false;
      }
    } catch (e) {
      console.error('✗ 外部规则加载异常:', e.message);
      return false;
    }
  }

  // 必须先加载规则 - 如果失败直接返回错误提示
  const rulesLoaded = loadExternalRules();

  if (!rulesLoaded) {
    console.error('✗ 致命错误: 无法加载外部规则，请检查网络连接或规则URL是否正确');
    return '✗ 致命错误: 无法加载外部规则，操作已中止';
  }

  // ==================== 规则加载成功，继续往下执行 ====================

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

  function generateLogoUrl(channelName) {
    if (!logoUrlTemplate) return '';
    return logoUrlTemplate.replace('{channel_name}', encodeURIComponent(channelName));
  }

  function buildM3uHeader() {
    let header = '#EXTM3U';
    if (epgUrl) {
      header += ` x-tvg-url="${epgUrl}"`;
    }
    if (defaultUA) {
      header += ` http-user-agent="${defaultUA}"`;
    }
    if (catchupSource) {
      header += ` catchup="append" catchup-source="${catchupSource}"`;
    }
    return header;
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
    let pendingExtinf = null;
    let headerProcessed = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine) continue;

      if (trimmedLine.startsWith('#EXTM3U')) {
        if (!headerProcessed) {
          result.push(buildM3uHeader());
          headerProcessed = true;
        }
        continue;
      }

      if (trimmedLine.startsWith('#EXTINF')) {
        if (pendingExtinf !== null && !skipNextUrl) {
          // 前一个频道没有链接，不添加到结果中
        

        skipNextUrl = shouldFilter(trimmedLine);

        if (!skipNextUrl) {
          const displayName = trimmedLine.split(',').pop();
          const transformed = transformChannel({ name: displayName, url: null });

          if (transformed) {
            let newExtinf = trimmedLine.replace(displayName, transformed.name);

            // 添加LOGO
            const logoUrl = generateLogoUrl(transformed.name);
            if (logoUrl && !newExtinf.includes('tvg-logo=')) {
              newExtinf = newExtinf.replace('#EXTINF:-1', `#EXTINF:-1 tvg-logo="${logoUrl}"`);
            }

            // 暂存这个EXTINF行，等待确认有链接后再添加
            pendingExtinf = newExtinf;
           else {
            skipNextUrl = true;
          }
        }
      } else if (!trimmedLine.startsWith('#') && trimmedLine) {
        // 这是一个URL行
        if (!skipNextUrl && pendingExtinf !== null) {
          // 确认前面的EXTINF行有对应的链接，添加到结果中
          if (!seen.has(pendingExtinf)) {
            seen.add(pendingExtinf);
            result.push(pendingExtinf);
          }

          if (!seen.has(trimmedLine)) {
            seen.add(trimmedLine);
            result.push(trimmedLine);
          

          pendingExtinf = null; // 已处理，清空待处理
        } else if (skipNextUrl) {
          // 这个URL被过滤了，也清空待处理的EXTINF
          pendingExtinf = null;
        }

        skipNextUrl = false;
      }
    }

    // 如果文件最后有待处理的EXTINF但没有链接，则删除它(不添加到结果)
    pendingExtinf = null;

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