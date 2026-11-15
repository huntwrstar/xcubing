const API_DEBUG = false; // 需要排查时改为 true

async function fetchJSON(url) {
    if (state.cache[url]) return state.cache[url];

    const p = (async () => {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`加载失败: ${url} (${res.status})`);
        }
        const data = await res.json();
        if (Array.isArray(data)) {
            for (const item of data) {
                if (item.result === undefined || item.result === null) {
                    item.result = 'DNF';
                }
            }
        }
        if (API_DEBUG) console.log(`加载成功: ${url}`, Array.isArray(data) ? data.length : '(对象)');
        return data;
    })();

    state.cache[url] = p;
    // 失败时清掉缓存，允许重试
    p.catch(() => { if (state.cache[url] === p) delete state.cache[url]; });
    return p;
}

async function loadMeta() {
    if (state.meta) return;
    try {
        state.meta = await fetchJSON('data/meta.json');
        if (!state.meta.country_continent) {
            state.meta.country_continent = {};
            console.warn('meta.json 缺少 country_continent 字段');
        }
    } catch {
        state.meta = { countries: [], country_continent: {} };
    }
}

function formatResultForSort(resultStr) {
    if (resultStr === undefined || resultStr === null || resultStr === '') return Infinity;
    if (resultStr === 'DNF' || resultStr === '暂无') return Infinity;
    if (typeof resultStr === 'string' && resultStr.includes(':')) {
        const parts = resultStr.split(':');
        return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(resultStr);
}

function parseTime(timeStr) {
    return formatResultForSort(timeStr);
}

function parseMBF(resultStr) {
    if (!resultStr || resultStr === 'DNF' || resultStr === '暂无') return null;
    const match = String(resultStr).match(/^(\d+)\/(\d+)\s+(\d+):(\d+(?:\.\d+)?)$/);
    if (!match) return null;
    const success = parseInt(match[1], 10);
    const attempts = parseInt(match[2], 10);
    const minutes = parseInt(match[3], 10);
    const seconds = parseFloat(match[4]);
    return {
        success, attempts,
        fail: attempts - success,
        timeSeconds: minutes * 60 + seconds
    };
}

function formatResult(resultStr) {
    if (!resultStr || resultStr === 'DNF' || resultStr === '暂无') return '暂无';
    if (typeof resultStr === 'string' && resultStr.includes('/') && resultStr.includes(':')) return resultStr;
    if (/^\d+$/.test(String(resultStr).trim())) return resultStr;
    if (typeof resultStr === 'string' && (resultStr.includes(':') || resultStr.includes('.')) && !/^\d+$/.test(resultStr)) {
        return resultStr;
    }
    const num = parseFloat(resultStr);
    if (isNaN(num) || num <= 0) return '暂无';
    const totalSeconds = num / 100;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = (totalSeconds % 60).toFixed(2);
    return minutes > 0 ? `${minutes}:${seconds.padStart(5, '0')}` : seconds;
}

function extractChineseName(name) {
    if (name && name.includes('(') && name.includes(')')) {
        const match = name.match(/\(([^)]+)\)/);
        if (match) {
            const inside = match[1].trim();
            if (/[\u4e00-\u9fa5]/.test(inside)) return inside;
        }
    }
    return name;
}

function getDisplayName(item) {
    const name = item.name || '';
    if (!state.currentLang.startsWith('zh')) return name;
    const isChinese = (item.country === 'China') || (item.province);
    return isChinese ? extractChineseName(name) : name;
}

function deduplicateByBestAndDate(data, project) {
    const map = new Map();
    data.forEach(item => {
        const id = item.wcaid;
        if (!id) return;
        const existing = map.get(id);
        if (!existing) { map.set(id, item); return; }

        let isBetter = false;
        if (project === '333mbf') {
            const curr = parseMBF(item.result);
            const prev = parseMBF(existing.result);
            if (!curr && !prev) return;
            if (!curr) return;
            if (!prev) { map.set(id, item); return; }
            const cs = curr.success - curr.fail, ps = prev.success - prev.fail;
            if (cs > ps) isBetter = true;
            else if (cs === ps) {
                if (curr.timeSeconds < prev.timeSeconds) isBetter = true;
                else if (curr.timeSeconds === prev.timeSeconds) {
                    if (curr.fail < prev.fail) isBetter = true;
                    else if (curr.fail === prev.fail) {
                        if (item.date && existing.date && item.date < existing.date) isBetter = true;
                        else if (!existing.date && item.date) isBetter = true;
                    }
                }
            }
        } else {
            const cv = parseTime(item.result);
            const ev = parseTime(existing.result);
            if (cv < ev) isBetter = true;
            else if (cv === ev) {
                if (item.date && existing.date && item.date < existing.date) isBetter = true;
                else if (!existing.date && item.date) isBetter = true;
            }
        }
        if (isBetter) map.set(id, item);
    });
    return Array.from(map.values());
}

function recomputeRanks(data, project) {
    // 预解析排序键，排序只比数值，避免反复 parseTime
    const items = [];
    for (const item of data) {
        if (!item || item.result === undefined) continue;
        let key;
        if (project === '333mbf') {
            const p = parseMBF(item.result);
            key = p
                ? [-(p.success - p.fail), p.timeSeconds, p.fail]
                : [Infinity, Infinity, Infinity];
        } else {
            key = parseTime(item.result);
        }
        items.push({ item, key });
    }

    if (project === '333mbf') {
        items.sort((a, b) => {
            if (a.key[0] !== b.key[0]) return a.key[0] - b.key[0];
            if (a.key[1] !== b.key[1]) return a.key[1] - b.key[1];
            return a.key[2] - b.key[2];
        });
    } else {
        items.sort((a, b) => a.key - b.key);
    }

    let rank = 1, sameCount = 0;
    let prevKey = null;
    for (let i = 0; i < items.length; i++) {
        const cur = items[i];
        if (i > 0) {
            let same;
            if (project === '333mbf') {
                same = prevKey[0] === cur.key[0] && prevKey[1] === cur.key[1] && prevKey[2] === cur.key[2];
            } else {
                same = prevKey === cur.key;
            }
            if (same) sameCount++;
            else { rank += 1 + sameCount; sameCount = 0; }
        }
        cur.item.rank = rank;
        prevKey = cur.key;
    }
    return items.map(x => x.item);
}

function applyGenderFilter(data, gender) {
    if (gender === 'all') return data;
    return data.filter(d => d.gender === gender);
}

function applyScopeFilter(data, continent, country) {
    if (continent) {
        const map = state.meta?.country_continent || {};
        return data.filter(d => map[d.country] === continent);
    } else if (country) {
        return data.filter(d => d.country === country);
    }
    return data;
}

function applyContinentFilter(country, continent) {
    const map = state.meta?.country_continent || {};
    return map[country] === continent;
}

function paginate(data, page, pageSize = 100) {
    const start = (page - 1) * pageSize;
    return data.slice(start, start + pageSize);
}