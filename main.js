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
        <a href="#recordV2" class="nav-item" data-page="recordV2">${__('nav.record')}</a>
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
                <a href="#recordV2" class="nav-item" data-page="recordV2">${__('nav.record')}</a>
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
        case 'recordV2': app.innerHTML = renderRecordV2(); await initRecordV2(); break;
        default: window.location.hash = '#home';
    }
}

function handleHash() {
    let hash = window.location.hash.slice(1) || 'home';
    if (hash === 'record') {
        window.location.hash = '#recordV2';
        return;
    }
    if (!['home', 'region', 'recordV2'].includes(hash)) {
        window.location.hash = '#home';
        return;
    }
    loadPage(hash);
}

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
        console.log(`构建省份列表，数据条数: ${historicalData.length}`);
        const allRecords = historicalData;
        const provinceSet = new Set();
        const cityMap = {};
        allRecords.forEach(r => {
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
        console.log('省份列表:', state.region.allProvinces);
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

    bindEvents('region', false);

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

async function initRecordV2() {
    // 复用已有的数据加载
    if (!state.recordV2.dataLoaded) {
        await loadAllRecordsDataV2();
    }

    const provinceSelect = document.getElementById('recordV2-province');
    if (provinceSelect && state.recordV2.allProvinces.length > 0) {
        provinceSelect.innerHTML = state.recordV2.allProvinces.map(p => `<option value="${p}">${p}</option>`).join('');
        if (state.recordV2.province && state.recordV2.allProvinces.includes(state.recordV2.province)) {
            provinceSelect.value = state.recordV2.province;
        } else {
            provinceSelect.value = state.recordV2.allProvinces[0];
            state.recordV2.province = state.recordV2.allProvinces[0];
        }
    }

    updateRecordV2CitySelect(state.recordV2.province);

    const genderSelect = document.getElementById('recordV2-gender');
    if (genderSelect) {
        genderSelect.value = state.recordV2.gender;
    }

    provinceSelect?.addEventListener('change', (e) => {
        state.recordV2.province = e.target.value;
        state.recordV2.city = '全部城市';
        updateRecordV2CitySelect(state.recordV2.province);
    });

    const citySelect = document.getElementById('recordV2-city');
    citySelect?.addEventListener('change', (e) => {
        state.recordV2.city = e.target.value;
    });

    genderSelect?.addEventListener('change', (e) => {
        state.recordV2.gender = e.target.value;
    });

    document.getElementById('recordV2-refresh')?.addEventListener('click', () => {
        loadRecordV2Data();
    });

    await loadRecordV2Data();
// 截图功能（只截取当前信息栏和完整表格）
document.getElementById('recordV2-screenshot')?.addEventListener('click', async () => {
    console.log('[截图] 按钮被点击');

    const pageEl = document.getElementById('recordV2-page');
    console.log('[截图] pageEl:', pageEl);

    const infoEl = pageEl ? pageEl.querySelector('.current-info') : null;
    const tableEl = document.getElementById('recordV2-table');
    console.log('[截图] infoEl:', infoEl, 'tableEl:', tableEl);

    if (!infoEl || !tableEl) {
        console.error('[截图] 缺失元素：infoEl或tableEl为空，终止');
        alert('未找到要截取的内容，请刷新后重试');
        return;
    }

    const btn = document.getElementById('recordV2-screenshot');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '生成中...';
    }

    try {
        // 创建离屏临时容器
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.backgroundColor = '#ffffff';
        container.style.width = tableEl.offsetWidth + 'px';
        document.body.appendChild(container);
        console.log('[截图] 临时容器已创建');

        // 克隆信息栏和表格
        const infoClone = infoEl.cloneNode(true);
        const tableClone = tableEl.cloneNode(true);

        // 取消表格横向滚动限制
        const tableContainer = tableClone.closest('.table-container');
        if (tableContainer) {
            tableContainer.style.overflow = 'visible';
        }
        tableClone.style.width = tableEl.offsetWidth + 'px';

        container.appendChild(infoClone);
        container.appendChild(tableClone);

        console.log('[截图] 开始调用 html2canvas...');
        const canvas = await html2canvas(container, {
            scale: 2,
            backgroundColor: '#ffffff',
            allowTaint: false,
            useCORS: true,
            logging: false
        });
        console.log('[截图] canvas 生成成功');

        // 清理临时容器
        document.body.removeChild(container);

        const province = state.recordV2.province || '未知';
        const city = state.recordV2.city === '全部城市' ? '全省' : state.recordV2.city;
        const fileName = `省市纪录_${province}_${city}.png`;

        const link = document.createElement('a');
        link.download = fileName;
        link.href = canvas.toDataURL('image/png');
        link.click();
        console.log('[截图] 下载触发完成');

    } catch (error) {
        console.error('[截图] 失败：', error);
        alert('截图失败，请刷新后重试');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '截图保存';
        }
    }
});


}

async function loadAllRecordsDataV2() {
    if (state.recordV2.dataLoaded) return;
    state.recordV2.loading = true;

    const rawDataByProject = {};
    PROJECT_LIST.forEach(p => {
        rawDataByProject[p.code] = { single: [], average: [] };
    });

    const singlePromises = PROJECT_LIST.map(p =>
        fetchJSON(`data/region/historical/single/${p.code}.json`).catch(() => [])
    );
    const avgPromises = PROJECT_LIST.map(p =>
        fetchJSON(`data/region/historical/average/${p.code}.json`).catch(() => [])
    );

    try {
        const singles = await Promise.all(singlePromises);
        const averages = await Promise.all(avgPromises);

        PROJECT_LIST.forEach((p, idx) => {
            rawDataByProject[p.code].single = singles[idx] || [];
            rawDataByProject[p.code].average = averages[idx] || [];
        });

        state.recordV2.rawDataByProject = rawDataByProject;

        const provinceSet = new Set();
        for (let proj in rawDataByProject) {
            ['single', 'average'].forEach(type => {
                rawDataByProject[proj][type].forEach(item => {
                    if (item.province) provinceSet.add(item.province);
                });
            });
        }
        let provinces = Array.from(provinceSet).sort((a,b) => a.localeCompare(b, 'zh'));
        const shenshouIndex = provinces.indexOf('神手谷');
        if (shenshouIndex > -1) {
            provinces.splice(shenshouIndex, 1);
            provinces.unshift('神手谷');
        }
        state.recordV2.allProvinces = provinces;
        state.recordV2.dataLoaded = true;
    } catch (e) {
        console.error('加载省市纪录原始数据失败', e);
    } finally {
        state.recordV2.loading = false;
    }
}

function extractCitiesFromRawDataV2(province) {
    if (!state.recordV2.dataLoaded) return [];
    const citiesSet = new Set();
    for (let proj in state.recordV2.rawDataByProject) {
        ['single', 'average'].forEach(type => {
            const list = state.recordV2.rawDataByProject[proj][type] || [];
            list.forEach(item => {
                if (item.province === province && item.city) {
                    citiesSet.add(item.city);
                }
            });
        });
    }
    return Array.from(citiesSet).sort((a,b) => a.localeCompare(b, 'zh'));
}

function updateRecordV2CitySelect(province) {
    const citySelect = document.getElementById('recordV2-city');
    if (!citySelect) return;
    if (MUNICIPALITIES.includes(province)) {
        citySelect.disabled = true;
        citySelect.innerHTML = `<option value="${province}">${province}</option>`;
        citySelect.value = province;
        state.recordV2.city = province;
    } else {
        citySelect.disabled = false;
        const cities = extractCitiesFromRawDataV2(province);
        let options = '<option value="全部城市">全省</option>';
        cities.forEach(c => options += `<option value="${c}">${c}</option>`);
        citySelect.innerHTML = options;
        if (!cities.includes(state.recordV2.city) && state.recordV2.city !== '全部城市') {
            state.recordV2.city = '全部城市';
        }
        citySelect.value = state.recordV2.city;
    }
}

function computeAllBestRecordsV2(province, city, gender) {
    const result = {};
    for (let proj of PROJECT_LIST) {
        const projCode = proj.code;
        const singleList = state.recordV2.rawDataByProject[projCode]?.single || [];
        const avgList = state.recordV2.rawDataByProject[projCode]?.average || [];

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

async function loadRecordV2Data() {
    const tbody = document.getElementById('recordV2-tbody');
    if (!tbody) return;
    if (!state.recordV2.dataLoaded) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">数据未就绪</td></tr>';
        return;
    }

    const province = state.recordV2.province;
    const city = state.recordV2.city;
    const gender = state.recordV2.gender;

    document.getElementById('recordV2-current-province').textContent = province;
    let displayCity = (city === '全部城市') ? '全省' : city;
    document.getElementById('recordV2-current-city').textContent = displayCity;
    let genderText = '所有';
    if (gender === '男') genderText = '男';
    else if (gender === '女') genderText = '女';
    else if (gender === '未知') genderText = '未知';
    document.getElementById('recordV2-current-gender').textContent = genderText;

    tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">加载纪录表</td></tr>';
    await new Promise(resolve => setTimeout(resolve, 20));

    const bestMap = computeAllBestRecordsV2(province, city, gender);
    let html = '';

    for (let proj of PROJECT_LIST) {
        const projBest = bestMap[proj.code] || { single: [], average: [] };
        const singleList = projBest.single;
        const avgList = projBest.average;

        // ----- 处理单次成绩和姓名 -----
        let singleResultStr = '';
        let singleNameStr = '';
        if (singleList.length > 0) {
            const results = singleList.map(r => formatResult(r.result));
            const uniqueResults = [...new Set(results)];
            singleResultStr = uniqueResults.join(' / ');
            // 姓名去重后再用顿号连接
            const names = [...new Set(singleList.map(r => extractChineseName(r.name)))];
            singleNameStr = names.join('、');
        }

        // ----- 处理平均成绩和姓名 -----
        let avgResultStr = '';
        let avgNameStr = '';
        if (avgList.length > 0) {
            const results = avgList.map(r => formatResult(r.result));
            const uniqueResults = [...new Set(results)];
            avgResultStr = uniqueResults.join(' / ');
            const names = [...new Set(avgList.map(r => extractChineseName(r.name)))];
            avgNameStr = names.join('、');
        }

        // 如果没有任何纪录
        if (!singleResultStr && !avgResultStr) {
            html += `<tr>
                <td>${proj.name}</td>
                <td colspan="4" class="empty-cell">暂无纪录</td>
            </tr>`;
            continue;
        }

        html += `<tr>
            <td>${proj.name}</td>
            <td>${singleResultStr}</td>
            <td>${singleNameStr}</td>
            <td>${avgResultStr}</td>
            <td>${avgNameStr}</td>
        </tr>`;
    }

    tbody.innerHTML = html || '<tr><td colspan="5">暂无数据</td></tr>';
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
        console.log(`省市数据原始条数: ${data.length}`);
        data = applyGenderFilter(data, gender);
        console.log(`省市数据性别筛选后: ${data.length}`);
        if (province) {
            data = data.filter(d => d.province === province);
            console.log(`省市数据省份筛选后 (${province}): ${data.length}`);
        }
        if (city === '全部城市') {
        } else if (city) {
            data = data.filter(d => d.city === city);
            console.log(`省市数据城市筛选后 (${city}): ${data.length}`);
        }
        
        data = deduplicateByBestAndDate(data, project);
        console.log(`去重后数据条数: ${data.length}`);

        renderTable('region', data, project);
    } catch (e) {
        console.error(e);
        const tbody = document.getElementById('region-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7">数据加载失败</td></tr>';
    }
}

function populateScopeSelect(selectId, currentVal) {
    const select = document.getElementById(selectId);
    if (!select) return;
    let html = `<option value="world">${__('world')}</option>`;
    const continents = [
        { code: 'asia', name: __('continent.asia') },
        { code: 'europe', name: __('continent.europe') },
        { code: 'north_america', name: __('continent.north_america') },
        { code: 'south_america', name: __('continent.south_america') },
        { code: 'africa', name: __('continent.africa') },
        { code: 'oceania', name: __('continent.oceania') }
    ];
    continents.forEach(c => {
        html += `<option value="continent:${c.code}">${c.name}</option>`;
    });
    html += '<option value="country:China">中国</option>'; 
    if (state.meta && state.meta.countries) {
        state.meta.countries.filter(c => c !== 'China').forEach(c => {
            html += `<option value="country:${c}">${c}</option>`;
        });
    }
    select.innerHTML = html;
    if (currentVal) select.value = currentVal;
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

function bindEvents(page, autoLoad = true) {
    const prefix = page === 'comprehensive' ? 'comp' : page;
    if (page !== 'comprehensive' && page !== 'regionTop' && page !== 'regionComp') {
        const projSelect = document.getElementById(`${prefix}-project`);
        if (projSelect) {
            projSelect.addEventListener('change', (e) => {
                state[page].project = e.target.value;
            });
        }
    }
    const genderSelect = document.getElementById(`${prefix}-gender`);
    if (genderSelect && page !== 'regionComp') {
        genderSelect.addEventListener('change', (e) => {
            state[page].gender = e.target.value;
        });
    }
    if (prefix !== 'region' && page !== 'comprehensive' && page !== 'regionTop' && page !== 'regionComp') {
        const scopeSelect = document.getElementById(`${prefix}-scope`);
        if (scopeSelect) {
            scopeSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                if (val.startsWith('continent:')) {
                    state[page].continent = val.split(':')[1];
                    state[page].country = '';
                } else if (val.startsWith('country:')) {
                    state[page].country = val.split(':')[1];
                    state[page].continent = '';
                } else {
                    state[page].continent = '';
                    state[page].country = '';
                }
            });
        }
    }
    if (page !== 'comprehensive' && page !== 'regionComp') {
        const singleBtn = document.getElementById(`${prefix}-single`);
        const avgBtn = document.getElementById(`${prefix}-average`);
        if (singleBtn) {
            singleBtn.addEventListener('click', () => {
                setType(page, 'single');
                loadPageData(page);
            });
        }
        if (avgBtn) {
            avgBtn.addEventListener('click', () => {
                setType(page, 'average');
                loadPageData(page);
            });
        }
    }
}

function setType(page, type) {
    state[page].type = type;
    const prefix = page === 'comprehensive' ? 'comp' : page;
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
        <a href="#recordV2" class="nav-item" data-page="recordV2">${__('nav.record')}</a>
    `;
    mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mobileNav.classList.remove('show')));

    window.addEventListener('hashchange', handleHash);
    handleHash();
});