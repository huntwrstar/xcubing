async function detectLanguageFromIP() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        const country = data.country_code;
        if (country === 'CN') return 'zh-CN';
        if (['TW', 'HK', 'MO'].includes(country)) return 'zh-TW';
        return 'en';
    } catch (e) {
        const navLang = navigator.language || 'en';
        if (navLang.startsWith('zh')) {
            if (navLang === 'zh-TW' || navLang === 'zh-HK') return 'zh-TW';
            return 'zh-CN';
        }
        return 'en';
    }
}

async function initLanguage() {
    const detected = await detectLanguageFromIP();
    state.currentLang = detected;
    const select = document.getElementById('lang-select');
    if (select) {
        select.value = state.currentLang;
    }
}

function updateDesktopNav() {
    const desktopNav = document.getElementById('desktop-nav');
    if (!desktopNav) return;
    desktopNav.innerHTML = `
        <a href="#home" class="nav-item" data-page="home">${__('nav.home')}</a>
        <a href="#region" class="nav-item" data-page="region">${__('nav.region')}</a>
        <a href="#record" class="nav-item" data-page="record">${__('nav.record')}</a>
    `;
}

function bindLanguageSwitch() {
    const select = document.getElementById('lang-select');
    if (!select) return;
    select.innerHTML = LANG_LIST.map(l => `<option value="${l.code}">${l.name}</option>`).join('');
    select.value = state.currentLang;
    select.addEventListener('change', (e) => {
        state.currentLang = e.target.value;
        updateDesktopNav();
        const mobileNav = document.getElementById('mobile-nav');
        if (mobileNav) {
            mobileNav.innerHTML = `
                <a href="#home" class="nav-item" data-page="home">${__('nav.home')}</a>
                <a href="#region" class="nav-item" data-page="region">${__('nav.region')}</a>
                <a href="#record" class="nav-item" data-page="record">${__('nav.record')}</a>
            `;
        }
        if (state.currentPage) {
            loadPage(state.currentPage);
        }
    });
}

async function loadPage(page) {
    console.log(`切换到页面: ${page}`);
    state.currentPage = page;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll(`[data-page="${page}"]`).forEach(el => el.classList.add('active'));

    const app = document.getElementById('app');
    switch(page) {
        case 'home': app.innerHTML = renderHome(); initCarousel(); break;
        case 'region': app.innerHTML = renderRegion(); await initRegion(); break;
        case 'record': app.innerHTML = renderRecord(); await initRecord(); break;
        default: window.location.hash = '#home';
    }
}

function handleHash() {
    let hash = window.location.hash.slice(1) || 'home';
    // 兼容旧链接
    if (hash === 'recordV2') {
        window.location.hash = '#record';
        return;
    }
    if (!['home', 'region', 'record'].includes(hash)) {
        window.location.hash = '#home';
        return;
    }
    loadPage(hash);
}

/* ================== 省市排名 ================== */

async function initRegion() {
    await loadMeta();

    const radios = document.querySelectorAll('input[name="region-period"]');
    radios.forEach(r => {
        if (r.value === state.region.period) r.checked = true;
        r.addEventListener('change', (e) => {
            state.region.period = e.target.value;
        });
    });

    try {
        const historicalData = await fetchJSON(`data/region/historical/single/333.json`);
        const provinceSet = new Set();
        const cityMap = {};
        historicalData.forEach(r => {
            if (r.province) {
                provinceSet.add(r.province);
                if (r.city) {
                    if (!cityMap[r.province]) cityMap[r.province] = new Set();
                    cityMap[r.province].add(r.city);
                }
            }
        });
        let provinces = Array.from(provinceSet).sort((a, b) => a.localeCompare(b, 'zh'));
        const shenshouIndex = provinces.indexOf('神手谷');
        if (shenshouIndex > -1) {
            provinces.splice(shenshouIndex, 1);
            provinces.unshift('神手谷');
        }
        state.region.allProvinces = provinces;
        state.region.provinceCities = {};
        for (let p in cityMap) {
            state.region.provinceCities[p] = Array.from(cityMap[p]).sort((a, b) => a.localeCompare(b, 'zh'));
        }
    } catch (e) {
        console.warn('无法构建省份城市列表', e);
        state.region.allProvinces = [];
        state.region.provinceCities = {};
    }

    const provinceSelect = document.getElementById('region-province');
    if (provinceSelect) {
        provinceSelect.innerHTML = state.region.allProvinces.map(p => `<option value="${p}">${p}</option>`).join('');
        if (state.region.allProvinces.includes('北京')) {
            provinceSelect.value = '北京';
            state.region.province = '北京';
        } else if (state.region.allProvinces.length > 0) {
            provinceSelect.value = state.region.allProvinces[0];
            state.region.province = state.region.allProvinces[0];
        }
    }

    updateRegionCitySelect(state.region.province);

    const projectSelect = document.getElementById('region-project');
    if (projectSelect) projectSelect.value = state.region.project;
    const genderSelect = document.getElementById('region-gender');
    if (genderSelect) genderSelect.value = state.region.gender;

    bindEvents('region');

    if (provinceSelect) {
        provinceSelect.addEventListener('change', (e) => {
            state.region.province = e.target.value;
            updateRegionCitySelect(state.region.province);
        });
    }

    const citySelect = document.getElementById('region-city');
    if (citySelect) {
        citySelect.addEventListener('change', (e) => {
            state.region.city = e.target.value;
        });
    }

    document.getElementById('region-single')?.addEventListener('click', () => {
        setType('region', 'single');
        loadRegionData();
    });
    document.getElementById('region-average')?.addEventListener('click', () => {
        setType('region', 'average');
        loadRegionData();
    });

    await loadRegionData();
}

async function loadRegionData() {
    if (state.currentPage !== 'region') return;
    showPageLoading('region');
    const { period, project, type, gender, province, city } = state.region;
    document.getElementById('region-current-project').textContent = getProjectName(project);
    document.getElementById('region-current-type').textContent = type === 'single' ? '单次' : '平均';
    document.getElementById('region-current-period').textContent =
        period === 'historical' ? '所有' : (period === 'season' ? '年度' : '近三年度');

    const thead = document.querySelector('#region-table thead');
    if (thead) {
        thead.innerHTML = `<tr>
            <th>排名</th>
            <th>姓名</th>
            <th>省份</th>
            <th>城市</th>
            <th>成绩</th>
            <th>比赛</th>
            <th>WCA ID</th>
        </tr>`;
    }

    try {
        let data = await fetchJSON(`data/region/${period}/${type}/${project}.json`);
        data = applyGenderFilter(data, gender);
        if (province) {
            data = data.filter(d => d.province === province);
        }
        if (city !== '全部城市' && city) {
            data = data.filter(d => d.city === city);
        }
        data = deduplicateByBestAndDate(data, project);
        renderTable('region', data, project);
    } catch (e) {
        console.error(e);
        const tbody = document.getElementById('region-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7">数据加载失败</td></tr>';
    }
}

function updateRegionCitySelect(province) {
    const citySelect = document.getElementById('region-city');
    if (!citySelect) return;
    if (MUNICIPALITIES.includes(province)) {
        citySelect.disabled = true;
        citySelect.innerHTML = `<option value="${province}">${province}</option>`;
        citySelect.value = province;
        state.region.city = province;
    } else {
        citySelect.disabled = false;
        const cities = state.region.provinceCities[province] || [];
        let options = '<option value="全部城市">全省</option>';
        cities.forEach(c => {
            options += `<option value="${c}">${c}</option>`;
        });
        citySelect.innerHTML = options;
        citySelect.value = '全部城市';
        state.region.city = '全部城市';
    }
}

/* ================== 省市纪录 ================== */

const RECORD_PRIORITY = ['333','222','444','333oh','pyram','skewb','minx','555','clock','sq1','666','777','333bf','333fm','444bf','555bf','333mbf'];

async function initRecord() {
    const provinceSelect = document.getElementById('record-province');
    const citySelect = document.getElementById('record-city');
    const genderSelect = document.getElementById('record-gender');

    if (genderSelect) genderSelect.value = state.record.gender;

    provinceSelect?.addEventListener('change', (e) => {
        state.record.province = e.target.value;
        state.record.city = '全部城市';
        updateRecordCitySelect(state.record.province);
        renderRecordData();
    });
    citySelect?.addEventListener('change', (e) => {
        state.record.city = e.target.value;
        renderRecordData();
    });
    genderSelect?.addEventListener('change', (e) => {
        state.record.gender = e.target.value;
        renderRecordData();
    });
    document.getElementById('record-refresh')?.addEventListener('click', renderRecordData);

    if (!state.record.dataLoaded) {
        const tbody = document.getElementById('record-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="loading-cell"><i class="fas fa-spinner"></i> 正在加载纪录数据...</td></tr>';
        await loadAllRecordsData();
    } else {
        refreshRecordProvinceSelect();
        updateRecordCitySelect(state.record.province);
        renderRecordData();
    }
}

async function loadAllRecordsData() {
    if (state.record.dataLoaded) return;
    if (state.record._loadingPromise) return state.record._loadingPromise;

    state.record._loadingPromise = (async () => {
        state.record.loadedProjects = new Set();
        state.record.rawDataByProject = {};
        PROJECT_LIST.forEach(p => {
            state.record.rawDataByProject[p.code] = { single: [], average: [] };
        });

        // 第一批：仅 3x3，尽快出首屏和省份下拉
        await loadRecordProjectBatch(['333']);
        buildRecordProvinceList();
        if (state.currentPage === 'record') {
            refreshRecordProvinceSelect();
            updateRecordCitySelect(state.record.province);
            renderRecordData();
        }

        // 后续批次：每批 3 个项目（6 个请求），加载完刷新表格
        const rest = RECORD_PRIORITY.filter(c => c !== '333');
        const BATCH = 3;
        for (let i = 0; i < rest.length; i += BATCH) {
            const batch = rest.slice(i, i + BATCH);
            await loadRecordProjectBatch(batch);
            if (state.currentPage === 'record') {
                renderRecordData();
            }
        }

        state.record.dataLoaded = true;
    })();

    try {
        await state.record._loadingPromise;
    } finally {
        state.record._loadingPromise = null;
    }
}

async function loadRecordProjectBatch(codes) {
    const tasks = [];
    for (const code of codes) {
        tasks.push(
            fetchJSON(`data/region/historical/single/${code}.json`)
                .then(d => { state.record.rawDataByProject[code].single = d || []; })
                .catch(() => { state.record.rawDataByProject[code].single = []; })
        );
        tasks.push(
            fetchJSON(`data/region/historical/average/${code}.json`)
                .then(d => { state.record.rawDataByProject[code].average = d || []; })
                .catch(() => { state.record.rawDataByProject[code].average = []; })
        );
    }
    await Promise.all(tasks);
    codes.forEach(c => state.record.loadedProjects.add(c));
}

function buildRecordProvinceList() {
    const provinceSet = new Set();
    for (const proj in state.record.rawDataByProject) {
        if (!state.record.loadedProjects.has(proj)) continue;
        ['single', 'average'].forEach(type => {
            state.record.rawDataByProject[proj][type].forEach(item => {
                if (item.province) provinceSet.add(item.province);
            });
        });
    }
    let provinces = Array.from(provinceSet).sort((a, b) => a.localeCompare(b, 'zh'));
    const idx = provinces.indexOf('神手谷');
    if (idx > -1) {
        provinces.splice(idx, 1);
        provinces.unshift('神手谷');
    }
    state.record.allProvinces = provinces;
}

function refreshRecordProvinceSelect() {
    const provinceSelect = document.getElementById('record-province');
    if (!provinceSelect || state.record.allProvinces.length === 0) return;
    provinceSelect.innerHTML = state.record.allProvinces.map(p => `<option value="${p}">${p}</option>`).join('');
    if (state.record.province && state.record.allProvinces.includes(state.record.province)) {
        provinceSelect.value = state.record.province;
    } else {
        state.record.province = state.record.allProvinces[0];
        provinceSelect.value = state.record.province;
    }
}

function extractCitiesFromRawData(province) {
    if (!state.record.rawDataByProject) return [];
    const citiesSet = new Set();
    for (let proj in state.record.rawDataByProject) {
        if (state.record.loadedProjects && !state.record.loadedProjects.has(proj)) continue;
        ['single', 'average'].forEach(type => {
            const list = state.record.rawDataByProject[proj][type] || [];
            list.forEach(item => {
                if (item.province === province && item.city) {
                    citiesSet.add(item.city);
                }
            });
        });
    }
    return Array.from(citiesSet).sort((a, b) => a.localeCompare(b, 'zh'));
}

function updateRecordCitySelect(province) {
    const citySelect = document.getElementById('record-city');
    if (!citySelect) return;
    if (MUNICIPALITIES.includes(province)) {
        citySelect.disabled = true;
        citySelect.innerHTML = `<option value="${province}">${province}</option>`;
        citySelect.value = province;
        state.record.city = province;
    } else {
        citySelect.disabled = false;
        const cities = extractCitiesFromRawData(province);
        let options = '<option value="全部城市">全省</option>';
        cities.forEach(c => options += `<option value="${c}">${c}</option>`);
        citySelect.innerHTML = options;
        if (!cities.includes(state.record.city) && state.record.city !== '全部城市') {
            state.record.city = '全部城市';
        }
        citySelect.value = state.record.city;
    }
}

function computeAllBestRecords(province, city, gender) {
    const result = {};
    for (let proj of PROJECT_LIST) {
        const projCode = proj.code;
        if (!state.record.loadedProjects || !state.record.loadedProjects.has(projCode)) {
            result[projCode] = null;   // 尚未加载
            continue;
        }
        const singleList = state.record.rawDataByProject[projCode]?.single || [];
        const avgList = state.record.rawDataByProject[projCode]?.average || [];

        const filterFn = (item) => {
            if (item.province !== province) return false;
            if (city !== '全部城市' && item.city !== city) return false;
            if (gender !== 'all' && item.gender !== gender) return false;
            return true;
        };

        const filteredSingle = singleList.filter(filterFn);
        const filteredAvg = avgList.filter(filterFn);

        let bestSingleVal = (projCode === '333mbf') ? -Infinity : Infinity;
        let bestAvgVal = Infinity;

        if (projCode === '333mbf') {
            filteredSingle.forEach(item => {
                const parsed = parseMBF(item.result);
                if (!parsed) return;
                const score = parsed.success - parsed.fail;
                if (score > bestSingleVal) bestSingleVal = score;
            });
        } else {
            filteredSingle.forEach(item => {
                const val = parseTime(item.result);
                if (val < bestSingleVal) bestSingleVal = val;
            });
            filteredAvg.forEach(item => {
                const val = parseTime(item.result);
                if (val < bestAvgVal) bestAvgVal = val;
            });
        }

        const bestSingles = [];
        const bestAvgs = [];

        if (projCode === '333mbf') {
            filteredSingle.forEach(item => {
                const parsed = parseMBF(item.result);
                if (parsed && (parsed.success - parsed.fail) === bestSingleVal) {
                    bestSingles.push(item);
                }
            });
        } else {
            filteredSingle.forEach(item => {
                if (parseTime(item.result) === bestSingleVal) bestSingles.push(item);
            });
            filteredAvg.forEach(item => {
                if (parseTime(item.result) === bestAvgVal) bestAvgs.push(item);
            });
        }

        result[projCode] = {
            single: bestSingles,
            average: bestAvgs
        };
    }
    return result;
}

function renderRecordData() {
    const tbody = document.getElementById('record-tbody');
    if (!tbody) return;
    if (!state.record.loadedProjects || state.record.loadedProjects.size === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">正在加载纪录数据...</td></tr>';
        return;
    }

    const province = state.record.province;
    const city = state.record.city;
    const gender = state.record.gender;

    const curProv = document.getElementById('record-current-province');
    const curCity = document.getElementById('record-current-city');
    const curGender = document.getElementById('record-current-gender');
    if (curProv) curProv.textContent = province || '-';
    if (curCity) curCity.textContent = (city === '全部城市' || !city) ? '全省' : city;
    let genderText = '所有';
    if (gender === '男') genderText = '男';
    else if (gender === '女') genderText = '女';
    else if (gender === '未知') genderText = '未知';
    if (curGender) curGender.textContent = genderText;

    const bestMap = computeAllBestRecords(province, city, gender);
    let html = '';

    for (let proj of PROJECT_LIST) {
        html += `<tr class="region-cell"><td colspan="6">${proj.name}</td></tr>`;
        const projBest = bestMap[proj.code];

        if (projBest === null) {
            html += `<tr><td colspan="6" class="loading-cell">加载中...</td></tr>`;
            continue;
        }

        const singleList = projBest.single;
        const avgList = projBest.average;

        if (singleList.length === 0 && avgList.length === 0) {
            html += `<tr><td colspan="6" class="empty-cell">${__('record.no_record')}</td></tr>`;
        } else {
            singleList.forEach(rec => {
                const displayName = extractChineseName(rec.name);
                html += `<tr>
                    <td></td>
                    <td>${formatResult(rec.result)}</td>
                    <td></td>
                    <td>${displayName}</td>
                    <td>${rec.competition || ''}</td>
                    <td>${rec.date || ''}</td>
                </tr>`;
            });
            avgList.forEach(rec => {
                const displayName = extractChineseName(rec.name);
                html += `<tr>
                    <td></td>
                    <td></td>
                    <td>${formatResult(rec.result)}</td>
                    <td>${displayName}</td>
                    <td>${rec.competition || ''}</td>
                    <td>${rec.date || ''}</td>
                </tr>`;
            });
        }
    }
    tbody.innerHTML = html || '<tr><td colspan="6">暂无数据</td></tr>';
}

/* ================== 通用 ================== */

function bindEvents(page) {
    const prefix = page;
    const projSelect = document.getElementById(`${prefix}-project`);
    if (projSelect) {
        projSelect.addEventListener('change', (e) => {
            state[page].project = e.target.value;
        });
    }
    const genderSelect = document.getElementById(`${prefix}-gender`);
    if (genderSelect) {
        genderSelect.addEventListener('change', (e) => {
            state[page].gender = e.target.value;
        });
    }
}

function setType(page, type) {
    state[page].type = type;
    const prefix = page;
    const singleBtn = document.getElementById(`${prefix}-single`);
    const avgBtn = document.getElementById(`${prefix}-average`);
    if (type === 'single') {
        singleBtn?.classList.add('btn-warning');
        singleBtn?.classList.remove('btn-primary');
        avgBtn?.classList.add('btn-primary');
        avgBtn?.classList.remove('btn-warning');
    } else {
        avgBtn?.classList.add('btn-warning');
        avgBtn?.classList.remove('btn-primary');
        singleBtn?.classList.add('btn-primary');
        singleBtn?.classList.remove('btn-warning');
    }
}

function initCarousel() {
    const slidesContainer = document.querySelector('.banner-slides');
    const prevBtn = document.querySelector('.banner-prev');
    const nextBtn = document.querySelector('.banner-next');
    if (!slidesContainer) return;

    const slides = slidesContainer.children;
    const totalSlides = slides.length;
    if (totalSlides === 0) return;

    let currentIndex = 0;
    let autoTimer;

    function goToSlide(index) {
        if (index < 0) index = totalSlides - 1;
        if (index >= totalSlides) index = 0;
        currentIndex = index;
        slidesContainer.style.transform = `translateX(-${currentIndex * 100}%)`;
        resetAutoPlay();
    }

    function resetAutoPlay() {
        if (autoTimer) clearInterval(autoTimer);
        autoTimer = setInterval(() => {
            goToSlide(currentIndex + 1);
        }, 4000);
    }

    if (prevBtn) prevBtn.addEventListener('click', () => goToSlide(currentIndex - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => goToSlide(currentIndex + 1));

    resetAutoPlay();
    goToSlide(0);
}

window.addEventListener('load', async () => {
    await initLanguage();
    bindLanguageSwitch();
    updateDesktopNav();

    const menuIcon = document.getElementById('mobile-menu-icon');
    const mobileNav = document.getElementById('mobile-nav');
    menuIcon.addEventListener('click', () => mobileNav.classList.toggle('show'));
    mobileNav.innerHTML = `
        <a href="#home" class="nav-item" data-page="home">${__('nav.home')}</a>
        <a href="#region" class="nav-item" data-page="region">${__('nav.region')}</a>
        <a href="#record" class="nav-item" data-page="record">${__('nav.record')}</a>
    `;
    mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mobileNav.classList.remove('show')));

    window.addEventListener('hashchange', handleHash);
    handleHash();
});