/**
 * 招聘流程数据看板 - 新版（性能优化版）
 * 提供全面的招聘流程数据可视化监控与分析功能
 */

// 使用项目统一的Supabase配置
const DASHBOARD_URL = 'https://dxrghlqnwfwpuxjvyisv.supabase.co';
const DASHBOARD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4cmdobHFud2Z3cHV4anZ5aXN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2ODYyMjAsImV4cCI6MjA5MDI2MjIyMH0.r6hDrTVZ1p_Qq6sHuLeBEo3SFqGEh0trwbRMXLWnrNQ';

// 初始化Supabase客户端
let dashboardClient = null;

// 全局变量
let analytics;
let currentTimeRange = 30;
let charts = {};
let dataManager; // 数据管理器实例，用于同步数据
let customTimeRange = null; // 自定义时间范围 { start: Date, end: Date }
let selectedPositions = []; // 选中的岗位筛选条件
let allRawData = []; // 存储所有原始数据

// 岗位列表
const POSITION_LIST = ['学徒', '普工', '牙科技工', '牙科质检员'];

/**
 * 【修复】过滤已取消和已拒绝的记录
 * 与流程管理页面使用相同的过滤逻辑
 */
function filterCancelledAndRejected(data) {
    if (!data || !Array.isArray(data)) return [];
    
    return data.filter(item => {
        const sourceStatus = item.source_status || '';
        const isCancelled =
            sourceStatus === '已取消' || sourceStatus === 'cancelled' || sourceStatus === 'canceled' ||
            sourceStatus === 'cancel' || sourceStatus === '已撤销' || sourceStatus === '撤销';
        const isRejected =
            sourceStatus === '已拒绝' || sourceStatus === 'rejected' || sourceStatus === 'reject' ||
            sourceStatus === '拒绝' || sourceStatus === '不通过' || sourceStatus === '未通过';
        
        // 只过滤已取消和已拒绝，保留已确认、已处理等其他状态
        return !(isCancelled || isRejected);
    });
}

// 缓存配置
const CACHE_KEY = 'dashboard_data_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

// 数据标签默认配置
const datalabelsConfig = {
    display: true,
    color: '#262626',
    font: {
        size: 12,
        weight: 'bold'
    },
    anchor: 'end',
    align: 'top',
    offset: 4,
    formatter: function(value) {
        return value !== null && value !== undefined ? value : '';
    }
};

// 饼图/环形图数据标签配置
const pieDatalabelsConfig = {
    display: true,
    color: '#ffffff',
    font: {
        size: 12,
        weight: 'bold'
    },
    formatter: function(value, context) {
        const label = context.chart.data.labels[context.dataIndex];
        return label + '\n' + value + '%';
    }
};

// 初始化 - 等待所有依赖库加载完成
document.addEventListener('DOMContentLoaded', async () => {
    // 等待Supabase和Chart.js加载完成
    await waitForLibraries();
    
    initComponents();
    bindEvents();
    // 恢复岗位筛选状态
    restorePositionFilterState();
    
    // 先显示缓存数据（如果有），再异步加载新数据
    const hasCache = loadDataFromCache();
    if (!hasCache) {
        await loadDashboardData();
    } else {
        // 后台刷新数据
        loadDashboardData();
    }
    
    // 启动实时数据更新（每60秒自动刷新一次，降低频率）
    startRealtimeUpdate();
});

/**
 * 等待依赖库加载完成（优化版 - 减少等待时间）
 */
function waitForLibraries() {
    return new Promise((resolve) => {
        // 如果库已经加载，立即返回
        if (window.supabase && window.Chart) {
            dashboardClient = window.supabase.createClient(DASHBOARD_URL, DASHBOARD_KEY);
            if (window.ChartDataLabels) {
                Chart.register(ChartDataLabels);
            }
            resolve();
            return;
        }
        
        // 否则最多等待3秒
        let attempts = 0;
        const maxAttempts = 60; // 3秒 / 50ms = 60次
        
        const checkLibraries = () => {
            attempts++;
            if (window.supabase && window.Chart) {
                dashboardClient = window.supabase.createClient(DASHBOARD_URL, DASHBOARD_KEY);
                if (window.ChartDataLabels) {
                    Chart.register(ChartDataLabels);
                }
                resolve();
            } else if (attempts >= maxAttempts) {
                console.error('等待库加载超时');
                // 即使超时也resolve，让页面继续加载
                resolve();
            } else {
                setTimeout(checkLibraries, 50);
            }
        };
        checkLibraries();
    });
}

/**
 * 从缓存加载数据
 */
function loadDataFromCache() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            const now = Date.now();
            
            // 检查缓存是否有效（5分钟内）
            if (now - timestamp < CACHE_DURATION && data && data.length > 0) {
                console.log('从缓存加载数据:', data.length, '条记录');
                allRawData = data;
                updateDashboardWithFilter();
                showContent();
                return true;
            }
        }
    } catch (e) {
        console.error('读取缓存失败:', e);
    }
    return false;
}

/**
 * 保存数据到缓存
 */
function saveDataToCache(data) {
    try {
        const cacheData = {
            data: data,
            timestamp: Date.now()
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (e) {
        console.error('保存缓存失败:', e);
    }
}

/**
 * 启动实时数据更新机制
 */
let realtimeUpdateInterval = null;
let isRealtimeUpdateEnabled = true;

function startRealtimeUpdate() {
    // 每60秒自动刷新一次数据（降低频率减少服务器压力）
    realtimeUpdateInterval = setInterval(async () => {
        if (isRealtimeUpdateEnabled && document.visibilityState === 'visible') {
            console.log('执行实时数据更新...');
            await refreshDashboardData();
        }
    }, 60000); // 60秒
    
    console.log('实时数据更新已启动（每60秒）');
}

/**
 * 停止实时数据更新
 */
function stopRealtimeUpdate() {
    if (realtimeUpdateInterval) {
        clearInterval(realtimeUpdateInterval);
        realtimeUpdateInterval = null;
        console.log('实时数据更新已停止');
    }
}

/**
 * 刷新看板数据（不显示加载动画）
 */
async function refreshDashboardData() {
    try {
        // 根据当前时间范围决定查询范围
        let cutoffDate = new Date();
        if (currentTimeRange === 'all') {
            // 全部数据时查询最近90天
            cutoffDate.setDate(cutoffDate.getDate() - 90);
        } else {
            const days = parseInt(currentTimeRange);
            cutoffDate.setDate(cutoffDate.getDate() - Math.max(days, 30));
        }

        // 从recruitment_process表加载数据
        const { data, error } = await dashboardClient
            .from('recruitment_process')
            .select('*')
            .gte('created_at', cutoffDate.toISOString())
            .order('created_at', { ascending: false })
            .limit(2000);

        if (error) throw error;

        if (data && data.length > 0) {
            // 【修复】应用相同的过滤逻辑
            const filteredData = filterCancelledAndRejected(data);
            
            // 保存原始数据
            allRawData = filteredData;
            saveDataToCache(filteredData);
            
            // 应用筛选并更新看板
            updateDashboardWithFilter();
            
            console.log('实时数据更新完成，共', filteredData.length, '条记录');
        }
    } catch (error) {
        console.error('实时数据更新失败:', error);
    }
}

/**
 * 手动刷新数据
 */
async function manualRefresh() {
    showLoading();
    await loadDashboardData();
    console.log('手动刷新完成');
}

/**
 * 切换实时更新状态
 */
function toggleRealtimeUpdate() {
    isRealtimeUpdateEnabled = !isRealtimeUpdateEnabled;
    const btn = document.getElementById('toggleRealtime');
    if (btn) {
        btn.textContent = isRealtimeUpdateEnabled ? '⏱️ 实时更新: 开启' : '⏱️ 实时更新: 关闭';
        btn.style.background = isRealtimeUpdateEnabled ? '#1890ff' : '#d9d9d9';
    }
    console.log('实时更新已' + (isRealtimeUpdateEnabled ? '开启' : '关闭'));
}

/**
 * 页面可见性变化处理
 * 当页面不可见时暂停实时更新，可见时恢复
 */
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        console.log('页面不可见，暂停实时更新');
    } else {
        console.log('页面可见，恢复实时更新');
        // 页面重新可见时立即刷新一次数据
        refreshDashboardData();
    }
});

/**
 * 初始化组件
 */
function initComponents() {
    analytics = new DashboardAnalytics([]);
    // 初始化数据管理器
    dataManager = new RecruitmentDataManager(dashboardClient);
}

/**
 * 绑定事件
 */
function bindEvents() {
    // 时间筛选按钮（只选择带有 data-range 属性的快捷按钮）
    document.querySelectorAll('.time-filter button[data-range]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.time-filter button[data-range]').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTimeRange = e.target.dataset.range === 'all' ? 'all' : parseInt(e.target.dataset.range);
            // 清除自定义时间范围
            customTimeRange = null;
            // 清空自定义时间输入框
            const startInput = document.getElementById('customStartTime');
            const endInput = document.getElementById('customEndTime');
            if (startInput) startInput.value = '';
            if (endInput) endInput.value = '';
            loadDashboardData();
        });
    });

    // 岗位筛选事件绑定
    bindPositionFilterEvents();
    
    // 自定义时间范围 - 应用按钮
    const applyCustomTimeBtn = document.getElementById('applyCustomTime');
    if (applyCustomTimeBtn) {
        applyCustomTimeBtn.addEventListener('click', applyCustomTimeRange);
    }
    
    // 自定义时间范围 - 重置按钮
    const resetCustomTimeBtn = document.getElementById('resetCustomTime');
    if (resetCustomTimeBtn) {
        resetCustomTimeBtn.addEventListener('click', resetCustomTimeRange);
    }
    
    // 自定义时间输入框变化监听
    const startInput = document.getElementById('customStartTime');
    const endInput = document.getElementById('customEndTime');
    if (startInput) {
        startInput.addEventListener('change', validateCustomTimeInputs);
    }
    if (endInput) {
        endInput.addEventListener('change', validateCustomTimeInputs);
    }
    
    // 导出按钮
    const exportBtn = document.getElementById('exportData');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportDashboardData);
    }
    
    // 数据质量检查按钮
    const qualityBtn = document.getElementById('checkDataQuality');
    if (qualityBtn) {
        qualityBtn.addEventListener('click', showDataQualityReport);
    }
}

/**
 * 绑定岗位筛选事件
 */
function bindPositionFilterEvents() {
    const filterGroup = document.getElementById('positionFilterGroup');
    if (!filterGroup) return;

    // 为每个复选框项添加点击事件 - 只绑定label的点击
    filterGroup.querySelectorAll('.position-checkbox-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // 阻止默认行为，防止checkbox自动切换两次
            e.preventDefault();
            e.stopPropagation();

            const checkbox = item.querySelector('input[type="checkbox"]');
            const position = checkbox.value;

            // 切换选中状态
            checkbox.checked = !checkbox.checked;

            // 更新UI样式
            if (checkbox.checked) {
                item.classList.add('active');
                if (!selectedPositions.includes(position)) {
                    selectedPositions.push(position);
                }
            } else {
                item.classList.remove('active');
                selectedPositions = selectedPositions.filter(p => p !== position);
            }

            console.log('岗位筛选变化:', position, checkbox.checked ? '选中' : '取消', '当前选中:', selectedPositions);

            // 保存筛选状态并更新数据
            savePositionFilterState();
            updateDashboardWithFilter();
        });
    });
}

/**
 * 全选岗位
 */
function selectAllPositions() {
    const filterGroup = document.getElementById('positionFilterGroup');
    if (!filterGroup) return;

    selectedPositions = [...POSITION_LIST];

    filterGroup.querySelectorAll('.position-checkbox-item').forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        checkbox.checked = true;
        item.classList.add('active');
    });

    savePositionFilterState();
    updateDashboardWithFilter();
}

/**
 * 清空岗位筛选
 */
function clearPositionFilter() {
    const filterGroup = document.getElementById('positionFilterGroup');
    if (!filterGroup) return;

    selectedPositions = [];

    filterGroup.querySelectorAll('.position-checkbox-item').forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        checkbox.checked = false;
        item.classList.remove('active');
    });

    savePositionFilterState();
    updateDashboardWithFilter();
}

/**
 * 保存岗位筛选状态到本地存储
 */
function savePositionFilterState() {
    localStorage.setItem('dashboardSelectedPositions', JSON.stringify(selectedPositions));
}

/**
 * 从本地存储恢复岗位筛选状态
 */
function restorePositionFilterState() {
    const saved = localStorage.getItem('dashboardSelectedPositions');
    if (saved) {
        try {
            selectedPositions = JSON.parse(saved);
            // 更新UI
            const filterGroup = document.getElementById('positionFilterGroup');
            if (filterGroup) {
                filterGroup.querySelectorAll('.position-checkbox-item').forEach(item => {
                    const checkbox = item.querySelector('input[type="checkbox"]');
                    const position = checkbox.value;
                    if (selectedPositions.includes(position)) {
                        checkbox.checked = true;
                        item.classList.add('active');
                    }
                });
            }
        } catch (e) {
            console.error('恢复岗位筛选状态失败:', e);
            selectedPositions = [];
        }
    }
}

/**
 * 根据岗位筛选数据
 */
function filterDataByPosition(data) {
    // 如果没有选择任何岗位，返回所有数据
    if (!selectedPositions || selectedPositions.length === 0) {
        return data;
    }

    return data.filter(item => {
        const position = item.position || item.hire_position || '';
        return selectedPositions.some(sp => position.includes(sp));
    });
}

/**
 * 更新看板数据（带筛选）- 优化版：使用requestAnimationFrame分批渲染
 */
function updateDashboardWithFilter() {
    if (!allRawData || allRawData.length === 0) return;

    const startTime = performance.now();

    // 1. 先按时间范围筛选
    const timeFilteredData = filterDataByTimeRange(allRawData, currentTimeRange);

    // 2. 再按岗位筛选
    const filteredData = filterDataByPosition(timeFilteredData);

    console.log(`筛选后数据: ${filteredData.length} 条 (时间筛选: ${timeFilteredData.length} 条, 岗位筛选: ${selectedPositions.length > 0 ? selectedPositions.join(',') : '全部'})`);

    // 3. 更新分析数据
    analytics.setData(filteredData);

    // 4. 获取所有指标
    const metrics = analytics.getMetrics();

    // 5. 分批更新界面（优先更新关键指标）
    // 第一批：核心指标和表格（用户最关注）
    requestAnimationFrame(() => {
        updateOverviewCards(metrics);
        updateFunnelTable(metrics.funnel);
        
        // 第二批：图表（使用requestAnimationFrame延迟渲染）
        requestAnimationFrame(() => {
            updateFunnelChart(metrics.funnel);
            updateConversionCharts(metrics.conversion, metrics.rejection);
            
            // 第三批：趋势图和其他图表
            requestAnimationFrame(() => {
                updateTrendChart();
                updateChannelAnalysis(metrics.channel);
                updateChannelPieChart(metrics.channel);
                updatePositionAnalysis(metrics.position);
                updateDataQualitySummary(metrics.quality);
                
                const endTime = performance.now();
                console.log(`数据更新耗时: ${(endTime - startTime).toFixed(2)}ms`);
            });
        });
    });
}

/**
 * 加载看板数据（优化版：支持增量加载和缓存）
 */
async function loadDashboardData() {
    // 如果已经有缓存数据，不显示loading，直接后台刷新
    const hasExistingData = allRawData && allRawData.length > 0;
    if (!hasExistingData) {
        showLoading();
    }

    try {
        // 1. 先从recruitment_process表加载数据（优先显示数据）
        // 只获取最近7天的数据，大幅提升初始加载速度
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        console.log('开始加载招聘数据...');
        const loadStartTime = performance.now();
        
        // 首先尝试加载少量数据快速显示
        const { data, error } = await dashboardClient
            .from('recruitment_process')
            .select('*')
            .gte('created_at', sevenDaysAgo.toISOString())
            .order('created_at', { ascending: false })
            .limit(500); // 限制最大返回500条，提升速度

        const loadEndTime = performance.now();
        console.log(`数据加载耗时: ${(loadEndTime - loadStartTime).toFixed(2)}ms, 获取 ${data?.length || 0} 条记录`);

        if (error) throw error;

        if (!data || data.length === 0) {
            showNoData();
            return;
        }

        // 【修复】应用与流程管理页面相同的过滤逻辑，过滤掉已取消、已拒绝的记录
        const filteredData = filterCancelledAndRejected(data);
        console.log(`数据过滤: 原始 ${data.length} 条, 过滤后 ${filteredData.length} 条, 已过滤 ${data.length - filteredData.length} 条`);

        // 保存原始数据到缓存
        allRawData = filteredData;
        saveDataToCache(filteredData);

        // 2. 立即显示数据（不等待同步）
        updateDashboardWithFilter();
        
        if (!hasExistingData) {
            showContent();
        }

        // 3. 后台异步加载更多数据（30天）
        setTimeout(async () => {
            try {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                
                const { data: moreData, error: moreError } = await dashboardClient
                    .from('recruitment_process')
                    .select('*')
                    .gte('created_at', thirtyDaysAgo.toISOString())
                    .order('created_at', { ascending: false })
                    .limit(1000);
                
                if (!moreError && moreData && moreData.length > data.length) {
                    // 【修复】同样应用过滤逻辑
                    const filteredMoreData = filterCancelledAndRejected(moreData);
                    console.log('后台加载更多数据:', moreData.length, '条, 过滤后:', filteredMoreData.length, '条');
                    allRawData = filteredMoreData;
                    saveDataToCache(filteredMoreData);
                    updateDashboardWithFilter();
                }
            } catch (e) {
                console.log('后台加载更多数据失败:', e);
            }
        }, 100);

        // 4. 后台异步同步数据（不阻塞UI）
        if (dataManager) {
            console.log('后台开始同步applications数据...');
            setTimeout(async () => {
                try {
                    const syncPromise = dataManager.syncFromApplications();
                    const timeoutPromise = new Promise(resolve => 
                        setTimeout(() => resolve({ success: false, error: '同步超时' }), 15000)
                    );
                    const syncResult = await Promise.race([syncPromise, timeoutPromise]);
                    
                    if (syncResult.success) {
                        console.log('后台数据同步完成:', syncResult.message);
                        refreshDashboardData();
                    } else {
                        console.warn('后台数据同步失败:', syncResult.error);
                    }
                } catch (syncError) {
                    console.error('后台同步异常:', syncError);
                }
            }, 500);
        }

    } catch (error) {
        console.error('加载数据失败:', error);
        if (!hasExistingData) {
            showError('加载数据失败，请稍后重试');
        }
    }
}

/**
 * 根据时间范围筛选数据
 */
function filterDataByTimeRange(data, range) {
    // 如果有自定义时间范围，优先使用
    if (customTimeRange && customTimeRange.start && customTimeRange.end) {
        return data.filter(item => {
            const itemDate = new Date(item.created_at);
            return itemDate >= customTimeRange.start && itemDate <= customTimeRange.end;
        });
    }
    
    if (range === 'all') return data;
    
    const days = parseInt(range);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return data.filter(item => {
        const itemDate = new Date(item.created_at);
        return itemDate >= cutoffDate;
    });
}

/**
 * 应用自定义时间范围
 */
function applyCustomTimeRange() {
    const startInput = document.getElementById('customStartTime');
    const endInput = document.getElementById('customEndTime');
    
    if (!startInput || !endInput) {
        console.error('找不到时间输入框');
        return;
    }
    
    const startValue = startInput.value;
    const endValue = endInput.value;
    
    if (!startValue || !endValue) {
        alert('请选择开始时间和结束时间');
        return;
    }
    
    const startDate = new Date(startValue);
    const endDate = new Date(endValue);
    
    if (startDate > endDate) {
        alert('开始时间不能晚于结束时间');
        return;
    }
    
    // 设置自定义时间范围
    customTimeRange = {
        start: startDate,
        end: endDate
    };
    
    // 移除快捷按钮的active状态
    document.querySelectorAll('.time-filter button').forEach(b => b.classList.remove('active'));
    
    console.log('应用自定义时间范围:', startDate, '至', endDate);
    
    // 重新加载数据
    loadDashboardData();
}

/**
 * 重置自定义时间范围
 */
function resetCustomTimeRange() {
    const startInput = document.getElementById('customStartTime');
    const endInput = document.getElementById('customEndTime');
    
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
    
    customTimeRange = null;
    
    // 恢复默认的"近30天"选择
    document.querySelectorAll('.time-filter button').forEach(b => b.classList.remove('active'));
    const defaultBtn = document.querySelector('.time-filter button[data-range="30"]');
    if (defaultBtn) defaultBtn.classList.add('active');
    currentTimeRange = 30;
    
    console.log('重置为默认时间范围: 近30天');
    
    // 重新加载数据
    loadDashboardData();
}

/**
 * 验证自定义时间输入
 */
function validateCustomTimeInputs() {
    const startInput = document.getElementById('customStartTime');
    const endInput = document.getElementById('customEndTime');
    const applyBtn = document.getElementById('applyCustomTime');
    
    if (!startInput || !endInput || !applyBtn) return;
    
    const startValue = startInput.value;
    const endValue = endInput.value;
    
    // 只有当两个时间都有值时才启用应用按钮
    if (startValue && endValue) {
        const startDate = new Date(startValue);
        const endDate = new Date(endValue);
        
        if (startDate > endDate) {
            applyBtn.disabled = true;
            applyBtn.title = '开始时间不能晚于结束时间';
        } else {
            applyBtn.disabled = false;
            applyBtn.title = '';
        }
    } else {
        applyBtn.disabled = false;
        applyBtn.title = '';
    }
}

/**
 * 获取当前时间范围描述
 */
function getCurrentTimeRangeDesc() {
    if (customTimeRange && customTimeRange.start && customTimeRange.end) {
        const startStr = customTimeRange.start.toLocaleString('zh-CN');
        const endStr = customTimeRange.end.toLocaleString('zh-CN');
        return `自定义时间: ${startStr} 至 ${endStr}`;
    }
    
    if (currentTimeRange === 'all') return '全部时间';
    return `近${currentTimeRange}天`;
}

/**
 * 更新概览卡片
 */
function updateOverviewCards(metrics) {
    const basic = metrics.basic;
    const conversion = metrics.conversion;
    const efficiency = metrics.efficiency;
    
    // 总应聘人数
    updateCard('totalApplicants', basic.totalApplicants, '人');
    
    // 成功入职人数
    updateCard('onboardedCount', basic.keyMetrics.onboarded, '人');
    
    // 整体转化率
    updateCard('overallConversion', conversion.overall, '%');
    
    // 平均招聘周期
    updateCard('avgHiringDays', efficiency.avgDays, '天');
    
    // 整体淘汰率
    const rejectionRate = metrics.rejection.overall;
    updateCard('overallRejection', rejectionRate, '%');
}

/**
 * 更新单个卡片
 */
function updateCard(elementId, value, unit) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = value + unit;
    }
}

/**
 * 更新漏斗图 - 优化版：减少动画提升性能
 */
function updateFunnelChart(funnelData) {
    const ctx = document.getElementById('funnelChart');
    if (!ctx) return;
    
    const stages = funnelData.stages;
    
    if (charts.funnel) {
        charts.funnel.destroy();
    }
    
    charts.funnel = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: stages.map(s => s.name),
            datasets: [{
                label: '人数',
                data: stages.map(s => s.count),
                backgroundColor: [
                    'rgba(54, 162, 235, 0.8)',
                    'rgba(75, 192, 192, 0.8)',
                    'rgba(255, 206, 86, 0.8)',
                    'rgba(255, 159, 64, 0.8)',
                    'rgba(153, 102, 255, 0.8)'
                ],
                borderColor: [
                    'rgba(54, 162, 235, 1)',
                    'rgba(75, 192, 192, 1)',
                    'rgba(255, 206, 86, 1)',
                    'rgba(255, 159, 64, 1)',
                    'rgba(153, 102, 255, 1)'
                ],
                borderWidth: 1,
                datalabels: {
                    display: true,
                    color: '#262626',
                    font: {
                        size: 14,
                        weight: 'bold'
                    },
                    anchor: 'end',
                    align: 'top',
                    offset: 4,
                    formatter: function(value, context) {
                        const stage = stages[context.dataIndex];
                        return value + '人';
                    }
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 300 // 减少动画时间
            },
            plugins: {
                legend: {
                    display: false
                },
                datalabels: {
                    display: false
                },
                tooltip: {
                    enabled: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        maxTicksLimit: 8 // 限制刻度数量
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 6
                    }
                }
            }
        }
    });
}

/**
 * 更新详细漏斗数据表格
 */
function updateFunnelTable(funnelData) {
    const tbody = document.getElementById('funnelTableBody');
    if (!tbody) return;
    
    const stages = funnelData.detailedStages || [];
    
    if (stages.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">暂无数据</td></tr>';
        return;
    }
    
    const html = stages.map((stage, index) => {
        const isFirst = index === 0;
        const bgColor = index % 2 === 0 ? '#fafafa' : 'white';
        
        return `
            <tr style="background: ${bgColor}; border-bottom: 1px solid #f0f0f0;">
                <td style="padding: 12px; font-weight: 500; color: #262626;">
                    <span style="display: inline-block; width: 24px; height: 24px; background: #1890ff; color: white; border-radius: 50%; text-align: center; line-height: 24px; margin-right: 8px; font-size: 12px;">${index + 1}</span>
                    ${stage.stage}
                </td>
                <td style="padding: 12px; text-align: center; color: #595959;">${stage.total}</td>
                <td style="padding: 12px; text-align: center; color: #52c41a; font-weight: 500;">${stage.pass !== null ? stage.pass : '-'}</td>
                <td style="padding: 12px; text-align: center; color: #ff4d4f;">${stage.reject !== null ? stage.reject : '-'}</td>
                <td style="padding: 12px; text-align: center; color: #faad14;">${stage.pending !== null ? stage.pending : '-'}</td>
                <td style="padding: 12px; text-align: center; color: #52c41a; font-weight: 500;">${stage.passRate || '-'}</td>
                <td style="padding: 12px; text-align: center; color: #ff4d4f;">${stage.rejectRate || '-'}</td>
                <td style="padding: 12px; text-align: center; color: #1890ff; font-weight: 600;">${stage.conversionRate}</td>
            </tr>
        `;
    }).join('');
    
    tbody.innerHTML = html;
}

/**
 * 更新转化率图表 - 优化版：减少动画提升性能
 */
function updateConversionCharts(conversion, rejection) {
    // 转化率饼图
    const conversionCtx = document.getElementById('conversionChart');
    if (conversionCtx) {
        if (charts.conversion) {
            charts.conversion.destroy();
        }
        
        charts.conversion = new Chart(conversionCtx, {
            type: 'doughnut',
            data: {
                labels: ['初试转化率', '复试转化率', 'Offer接受率', '报到率'],
                datasets: [{
                    data: [
                        conversion.firstInterview,
                        conversion.secondInterview,
                        conversion.offerAcceptance,
                        conversion.onboard
                    ],
                    backgroundColor: [
                        'rgba(54, 162, 235, 0.8)',
                        'rgba(75, 192, 192, 0.8)',
                        'rgba(255, 206, 86, 0.8)',
                        'rgba(153, 102, 255, 0.8)'
                    ],
                    datalabels: {
                        display: false // 禁用数据标签提升性能
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 300
                },
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            font: {
                                size: 11
                            },
                            boxWidth: 12,
                            padding: 8
                        }
                    },
                    datalabels: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.label + ': ' + context.raw + '%';
                            }
                        }
                    }
                }
            }
        });
    }
    
    // 淘汰率柱状图
    const rejectionCtx = document.getElementById('rejectionChart');
    if (rejectionCtx) {
        if (charts.rejection) {
            charts.rejection.destroy();
        }
        
        charts.rejection = new Chart(rejectionCtx, {
            type: 'bar',
            data: {
                labels: ['初试淘汰率', '复试淘汰率', 'Offer拒绝率', '未报到率'],
                datasets: [{
                    label: '淘汰率 (%)',
                    data: [
                        rejection.firstInterview,
                        rejection.secondInterview,
                        rejection.offer,
                        rejection.notOnboarded
                    ],
                    backgroundColor: 'rgba(255, 99, 132, 0.8)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1,
                    datalabels: {
                        display: false // 禁用数据标签提升性能
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 300
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    datalabels: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.label + ': ' + context.raw + '%';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            maxTicksLimit: 6
                        }
                    }
                }
            }
        });
    }
}

/**
 * 更新趋势图 - 优化版：减少数据点数量和动画
 */
function updateTrendChart() {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    
    // 限制数据点数量，避免过多数据点导致性能问题
    let days = currentTimeRange === 'all' ? 30 : parseInt(currentTimeRange);
    if (days > 90) days = 90; // 最多显示90天
    
    const trendData = analytics.getTrendData(days);
    
    // 如果数据点过多，进行采样
    let displayData = trendData;
    if (trendData.length > 30) {
        const step = Math.ceil(trendData.length / 30);
        displayData = trendData.filter((_, index) => index % step === 0);
    }
    
    if (charts.trend) {
        charts.trend.destroy();
    }
    
    charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: displayData.map(d => d.date.slice(5)), // 只显示月-日
            datasets: [
                {
                    label: '新增应聘',
                    data: displayData.map(d => d.newApplicants),
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 2, // 减小点的大小
                    pointHoverRadius: 4,
                    datalabels: {
                        display: false // 禁用数据标签提升性能
                    }
                },
                {
                    label: '初试通过',
                    data: displayData.map(d => d.firstPass),
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 2,
                    pointHoverRadius: 4,
                    datalabels: {
                        display: false
                    }
                },
                {
                    label: '成功入职',
                    data: displayData.map(d => d.onboarded),
                    borderColor: 'rgba(153, 102, 255, 1)',
                    backgroundColor: 'rgba(153, 102, 255, 0.1)',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 2,
                    pointHoverRadius: 4,
                    datalabels: {
                        display: false
                    }
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 300
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        padding: 8,
                        usePointStyle: true
                    }
                },
                datalabels: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        maxTicksLimit: 8
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 10
                    }
                }
            }
        }
    });
}

/**
 * 更新渠道分析 - 包含各阶段详细数据
 */
function updateChannelAnalysis(channelData) {
    const container = document.getElementById('channelAnalysis');
    if (!container) return;
    
    if (channelData.length === 0) {
        container.innerHTML = '<div class="no-data">暂无渠道数据</div>';
        return;
    }
    
    const html = channelData.slice(0, 5).map((channel, index) => `
        <div class="channel-item" style="margin-bottom: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="background: #1890ff; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px;">${index + 1}</span>
                    <span style="font-weight: 500; color: #262626;">${channel.name}</span>
                </div>
                <span style="color: #52c41a; font-weight: 600;">整体转化率 ${channel.overallConversion}%</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-size: 12px; color: #595959;">
                <div style="text-align: center; padding: 4px; background: white; border-radius: 4px;">
                    <div style="font-weight: 600; color: #262626;">${channel.total}</div>
                    <div>投递</div>
                </div>
                <div style="text-align: center; padding: 4px; background: white; border-radius: 4px;">
                    <div style="font-weight: 600; color: #262626;">${channel.firstInterview}</div>
                    <div>初试</div>
                </div>
                <div style="text-align: center; padding: 4px; background: white; border-radius: 4px;">
                    <div style="font-weight: 600; color: #262626;">${channel.secondInterviewPass}</div>
                    <div>复试通过</div>
                </div>
                <div style="text-align: center; padding: 4px; background: white; border-radius: 4px;">
                    <div style="font-weight: 600; color: #52c41a;">${channel.onboarded}</div>
                    <div>入职</div>
                </div>
            </div>
            <div style="margin-top: 8px; font-size: 11px; color: #8c8c8c; display: flex; gap: 12px;">
                <span>初试通过率: ${channel.firstPassRate}%</span>
                <span>复试通过率: ${channel.secondPassRate}%</span>
                <span>Offer接受率: ${channel.offerAcceptRate}%</span>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

/**
 * 更新渠道占比饼图 - 优化版：减少动画和复杂度
 */
function updateChannelPieChart(channelData) {
    const ctx = document.getElementById('channelPieChart');
    if (!ctx) return;
    
    // 销毁旧图表
    if (charts.channelPie) {
        charts.channelPie.destroy();
    }
    
    // 如果没有数据，显示空状态
    if (!channelData || channelData.length === 0) {
        const container = ctx.parentElement;
        container.innerHTML = '<div class="no-data" style="height: 100%; display: flex; align-items: center; justify-content: center; color: #8c8c8c;">暂无渠道数据</div>';
        return;
    }
    
    // 准备数据 - 按投递人数排序，取前5个，其余归为"其他"
    const sortedData = [...channelData].sort((a, b) => b.total - a.total);
    const topChannels = sortedData.slice(0, 5);
    const otherChannels = sortedData.slice(5);
    
    const labels = topChannels.map(ch => ch.name);
    const data = topChannels.map(ch => ch.total);
    
    // 如果有其他渠道，添加"其他"分类
    if (otherChannels.length > 0) {
        const otherTotal = otherChannels.reduce((sum, ch) => sum + ch.total, 0);
        labels.push('其他');
        data.push(otherTotal);
    }
    
    // 计算总数用于百分比显示
    const total = data.reduce((sum, val) => sum + val, 0);
    
    // 简化配色方案
    const backgroundColors = [
        'rgba(91, 155, 213, 0.85)',
        'rgba(112, 173, 71, 0.85)',
        'rgba(255, 192, 0, 0.85)',
        'rgba(237, 125, 49, 0.85)',
        'rgba(128, 100, 162, 0.85)',
        'rgba(192, 192, 192, 0.85)'
    ];
    
    // 创建环形图
    charts.channelPie = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors.slice(0, labels.length),
                borderWidth: 1,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '50%',
            animation: {
                duration: 300
            },
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 8,
                        boxWidth: 10,
                        font: {
                            size: 11
                        },
                        generateLabels: function(chart) {
                            const data = chart.data;
                            return data.labels.map((label, i) => {
                                const value = data.datasets[0].data[i];
                                const percentage = ((value / total) * 100).toFixed(1);
                                return {
                                    text: `${label} (${percentage}%)`,
                                    fillStyle: data.datasets[0].backgroundColor[i],
                                    hidden: false,
                                    index: i
                                };
                            });
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${context.label}: ${value}人 (${percentage}%)`;
                        }
                    }
                },
                datalabels: {
                    display: false // 禁用数据标签提升性能
                }
            }
        }
    });
}

/**
 * 更新岗位分析
 */
function updatePositionAnalysis(positionData) {
    const container = document.getElementById('positionAnalysis');
    if (!container) return;
    
    if (positionData.length === 0) {
        container.innerHTML = '<div class="no-data">暂无岗位数据</div>';
        return;
    }
    
    const html = positionData.slice(0, 5).map((pos, index) => `
        <div class="position-item">
            <div class="position-rank">${index + 1}</div>
            <div class="position-info">
                <div class="position-name">${pos.name}</div>
                <div class="position-stats">
                    <span>应聘: ${pos.total}人</span>
                    <span>入职: ${pos.onboarded}人</span>
                    <span>转化率: ${pos.conversionRate}%</span>
                </div>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

/**
 * 更新数据质量摘要
 */
function updateDataQualitySummary(quality) {
    const container = document.getElementById('dataQualitySummary');
    if (!container) return;
    
    const completenessRate = quality.completenessRate;
    const issueCount = quality.issueCount;
    
    let statusClass = 'good';
    let statusText = '良好';
    
    if (completenessRate < 80) {
        statusClass = 'poor';
        statusText = '较差';
    } else if (completenessRate < 90) {
        statusClass = 'warning';
        statusText = '一般';
    }
    
    container.innerHTML = `
        <div class="quality-status ${statusClass}">
            <span class="status-text">数据质量: ${statusText}</span>
            <span class="completeness">完整度: ${completenessRate}%</span>
            ${issueCount > 0 ? `<span class="issues">问题数: ${issueCount}</span>` : ''}
        </div>
    `;
}

/**
 * 显示数据质量报告
 */
function showDataQualityReport() {
    const metrics = analytics.getMetrics();
    const quality = metrics.quality;
    
    let html = `
        <div class="quality-report">
            <h3>数据质量报告</h3>
            <div class="quality-summary">
                <p>数据完整度: ${quality.completenessRate}%</p>
                <p>发现问题数: ${quality.issueCount}</p>
            </div>
    `;
    
    if (quality.issues.length > 0) {
        html += '<div class="quality-issues"><h4>问题详情</h4><ul>';
        quality.issues.slice(0, 20).forEach(issue => {
            html += `<li>${issue.message} (ID: ${issue.id})</li>`;
        });
        if (quality.issues.length > 20) {
            html += `<li>...还有 ${quality.issues.length - 20} 个问题</li>`;
        }
        html += '</ul></div>';
    } else {
        html += '<p class="no-issues">未发现数据质量问题</p>';
    }
    
    html += '</div>';
    
    // 显示弹窗
    showModal('数据质量检查', html);
}

/**
 * 导出看板数据 - 完整版（五大模块）
 */
function exportDashboardData() {
    if (!analytics || !analytics.rawData || analytics.rawData.length === 0) {
        alert('暂无数据可导出');
        return;
    }

    try {
        const metrics = analytics.getMetrics();
        const wb = XLSX.utils.book_new();

        // 1. 招聘流程数据
        const processData = generateProcessSheet(analytics.rawData);
        const ws1 = XLSX.utils.json_to_sheet(processData);
        XLSX.utils.book_append_sheet(wb, ws1, '招聘流程数据');

        // 2. 招聘转化分析
        const conversionData = generateConversionSheet(metrics);
        const ws2 = XLSX.utils.json_to_sheet(conversionData);
        XLSX.utils.book_append_sheet(wb, ws2, '招聘转化分析');

        // 3. 渠道分析
        const channelData = generateChannelSheet(metrics);
        const ws3 = XLSX.utils.json_to_sheet(channelData);
        XLSX.utils.book_append_sheet(wb, ws3, '渠道分析');

        // 4. 岗位分析
        const positionData = generatePositionSheet(metrics);
        const ws4 = XLSX.utils.json_to_sheet(positionData);
        XLSX.utils.book_append_sheet(wb, ws4, '岗位分析');

        // 5. 数据说明
        const readmeData = generateReadmeSheet();
        const ws5 = XLSX.utils.json_to_sheet(readmeData);
        XLSX.utils.book_append_sheet(wb, ws5, '数据说明');

        // 下载文件
        const dateStr = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `招聘数据分析报告_${dateStr}.xlsx`);

        console.log('数据导出成功');
    } catch (error) {
        console.error('导出数据失败:', error);
        alert('导出数据失败，请稍后重试');
    }
}

/**
 * 生成招聘流程数据工作表
 */
function generateProcessSheet(rawData) {
    return rawData.map(d => ({
        '姓名': d.name || '-',
        '电话': d.phone || '-',
        '性别': d.gender || '-',
        '年龄': d.age || '-',
        '应聘岗位': d.position || '-',
        '工种': d.job_type || '-',
        '学历': d.education || '-',
        '工作经验': d.experience || '-',
        '招聘渠道': d.source_channel || '未知渠道',
        '当前环节': getStageText(d.current_stage),
        '当前状态': getStatusText(d.current_status),
        '初试结果': getResultText(d.first_interview_result),
        '初试时间': d.first_interview_time ? new Date(d.first_interview_time).toLocaleString('zh-CN') : '-',
        '初试官': d.first_interviewer || '-',
        '复试结果': getResultText(d.second_interview_result),
        '复试时间': d.second_interview_time ? new Date(d.second_interview_time).toLocaleString('zh-CN') : '-',
        '复试官': d.second_interviewer || '-',
        '录用部门': d.hire_department || '-',
        '录用岗位': d.hire_position || '-',
        '职级': d.job_level || '-',
        '薪资': d.hire_salary || '-',
        '预计入职日期': d.hire_date || '-',
        '是否接受Offer': getOfferText(d.accept_offer),
        '拒绝原因': d.offer_reject_reason || '-',
        '报到状态': getOnboardText(d.is_reported),
        '创建时间': d.created_at ? new Date(d.created_at).toLocaleString('zh-CN') : '-',
        '更新时间': d.updated_at ? new Date(d.updated_at).toLocaleString('zh-CN') : '-'
    }));
}

/**
 * 生成招聘转化分析工作表
 */
function generateConversionSheet(metrics) {
    const data = [];
    
    // 招聘漏斗各环节数据
    if (metrics.funnel && metrics.funnel.stages) {
        metrics.funnel.stages.forEach((stage, index) => {
            const prevStage = index > 0 ? metrics.funnel.stages[index - 1] : null;
            const conversionRate = prevStage ? ((stage.count / prevStage.count) * 100).toFixed(1) : '100.0';
            
            data.push({
                '环节名称': stage.name,
                '人数': stage.count,
                '环比转化率(%)': conversionRate,
                '整体转化率(%)': stage.overallRate,
                '流失人数': prevStage ? (prevStage.count - stage.count) : 0,
                '流失率(%)': prevStage ? (((prevStage.count - stage.count) / prevStage.count) * 100).toFixed(1) : '0.0'
            });
        });
    }
    
    // 添加总体转化率汇总
    data.push({});
    data.push({
        '环节名称': '【转化率汇总】',
        '人数': '',
        '环比转化率(%)': '',
        '整体转化率(%)': '',
        '流失人数': '',
        '流失率(%)': ''
    });
    
    if (metrics.conversion) {
        data.push({
            '环节名称': '初试转化率',
            '人数': '-',
            '环比转化率(%)': metrics.conversion.firstInterview,
            '整体转化率(%)': '-',
            '流失人数': '-',
            '流失率(%)': (100 - parseFloat(metrics.conversion.firstInterview)).toFixed(1)
        });
        data.push({
            '环节名称': '复试转化率',
            '人数': '-',
            '环比转化率(%)': metrics.conversion.secondInterview,
            '整体转化率(%)': '-',
            '流失人数': '-',
            '流失率(%)': (100 - parseFloat(metrics.conversion.secondInterview)).toFixed(1)
        });
        data.push({
            '环节名称': 'Offer接受率',
            '人数': '-',
            '环比转化率(%)': metrics.conversion.offerAcceptance,
            '整体转化率(%)': '-',
            '流失人数': '-',
            '流失率(%)': (100 - parseFloat(metrics.conversion.offerAcceptance)).toFixed(1)
        });
        data.push({
            '环节名称': '报到率',
            '人数': '-',
            '环比转化率(%)': metrics.conversion.onboard,
            '整体转化率(%)': '-',
            '流失人数': '-',
            '流失率(%)': (100 - parseFloat(metrics.conversion.onboard)).toFixed(1)
        });
    }
    
    return data;
}

/**
 * 生成渠道分析工作表
 */
function generateChannelSheet(metrics) {
    if (!metrics.channel || metrics.channel.length === 0) {
        return [{ '提示': '暂无渠道数据' }];
    }
    
    const totalApplicants = metrics.channel.reduce((sum, ch) => sum + ch.total, 0);
    
    return metrics.channel.map(ch => ({
        '渠道名称': ch.name,
        '投递人数': ch.total,
        '占比(%)': ((ch.total / totalApplicants) * 100).toFixed(1),
        '初试人数': ch.firstInterview,
        '初试通过率(%)': ch.firstPassRate,
        '复试通过人数': ch.secondPass,
        '复试通过率(%)': ch.secondPassRate,
        '入职人数': ch.onboarded,
        '整体转化率(%)': ch.overallRate,
        '渠道质量评分': calculateChannelQuality(ch)
    }));
}

/**
 * 生成岗位分析工作表
 */
function generatePositionSheet(metrics) {
    if (!metrics.position || metrics.position.length === 0) {
        return [{ '提示': '暂无岗位数据' }];
    }
    
    return metrics.position.map(pos => ({
        '岗位名称': pos.name,
        '投递人数': pos.total,
        '初试人数': pos.firstInterview,
        '初试通过率(%)': pos.firstPassRate,
        '复试通过人数': pos.secondPass,
        '复试通过率(%)': pos.secondPassRate,
        '录用人数': pos.hired,
        'Offer接受率(%)': pos.offerAcceptRate,
        '入职人数': pos.onboarded,
        '整体转化率(%)': pos.overallRate,
        '平均招聘周期(天)': pos.avgHireDays || '-'
    }));
}

/**
 * 生成数据说明工作表
 */
function generateReadmeSheet() {
    return [
        { '字段说明': '【招聘流程数据】工作表', '说明内容': '包含所有候选人的详细招聘流程信息，从投递到入职的全流程数据' },
        { '字段说明': '', '说明内容': '' },
        { '字段说明': '【招聘转化分析】工作表', '说明内容': '展示招聘漏斗各环节的数据和转化率，包括环比转化率、整体转化率、流失率等关键指标' },
        { '字段说明': '', '说明内容': '' },
        { '字段说明': '【渠道分析】工作表', '说明内容': '各招聘渠道的效能分析，包括来源分布、转化率、质量评分等' },
        { '字段说明': '', '说明内容': '' },
        { '字段说明': '【岗位分析】工作表', '说明内容': '各岗位的招聘数据分析，包括投递人数、通过率、招聘周期等' },
        { '字段说明': '', '说明内容': '' },
        { '字段说明': '【关键指标说明】', '说明内容': '' },
        { '字段说明': '环比转化率', '说明内容': '当前环节人数 / 上一环节人数 × 100%' },
        { '字段说明': '整体转化率', '说明内容': '当前环节人数 / 投递总人数 × 100%' },
        { '字段说明': '流失率', '说明内容': '(上一环节人数 - 当前环节人数) / 上一环节人数 × 100%' },
        { '字段说明': '渠道质量评分', '说明内容': '基于转化率和入职人数的综合评分（1-5分）' },
        { '字段说明': '', '说明内容': '' },
        { '字段说明': '【导出时间】', '说明内容': new Date().toLocaleString('zh-CN') }
    ];
}

/**
 * 计算渠道质量评分
 */
function calculateChannelQuality(channel) {
    const rate = parseFloat(channel.overallRate);
    if (rate >= 20) return '5-优秀';
    if (rate >= 15) return '4-良好';
    if (rate >= 10) return '3-一般';
    if (rate >= 5) return '2-较差';
    return '1-差';
}

/**
 * 获取环节文本
 */
function getStageText(stage) {
    const stageMap = {
        'application': '投递简历',
        'first_interview': '初试',
        'second_interview': '复试',
        'hired': '录用',
        'onboarded': '已报到'
    };
    return stageMap[stage] || stage || '-';
}

/**
 * 获取状态文本
 */
function getStatusText(status) {
    const statusMap = {
        'pending': '待处理',
        'pass': '通过',
        'reject': '不通过',
        'cancelled': '已取消'
    };
    return statusMap[status] || status || '-';
}

/**
 * 获取结果文本
 */
function getResultText(result) {
    if (!result) return '-';
    const resultMap = {
        'pass': '通过',
        'reject': '不通过',
        'pending': '待定'
    };
    return resultMap[result] || result;
}

/**
 * 获取Offer文本
 */
function getOfferText(accept) {
    if (accept === null || accept === undefined) return '-';
    return accept === 'yes' || accept === true ? '已接受' : '已拒绝';
}

/**
 * 获取报到文本
 */
function getOnboardText(reported) {
    if (reported === null || reported === undefined) return '-';
    return reported === true || reported === 'yes' ? '已报到' : '未报到';
}

/**
 * 显示弹窗
 */
function showModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                ${content}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.modal-close').addEventListener('click', () => {
        modal.remove();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

/**
 * 显示加载状态
 */
function showLoading() {
    const loadingState = document.getElementById('loadingState');
    const dashboardContent = document.getElementById('dashboardContent');
    
    if (loadingState) {
        loadingState.style.display = 'flex';
    }
    if (dashboardContent) {
        dashboardContent.style.display = 'none';
    }
}

/**
 * 显示内容
 */
function showContent() {
    const loadingState = document.getElementById('loadingState');
    const dashboardContent = document.getElementById('dashboardContent');
    
    if (loadingState) {
        loadingState.style.display = 'none';
    }
    if (dashboardContent) {
        dashboardContent.style.display = 'block';
    }
}

/**
 * 显示无数据状态
 */
function showNoData() {
    const loadingState = document.getElementById('loadingState');
    const dashboardContent = document.getElementById('dashboardContent');
    
    if (loadingState) {
        loadingState.style.display = 'none';
    }
    if (dashboardContent) {
        dashboardContent.innerHTML = '<div class="no-data-message" style="text-align: center; padding: 60px 20px; color: #8c8c8c;"><div style="font-size: 48px; margin-bottom: 16px;">📊</div><div style="font-size: 18px;">暂无数据，请先添加招聘记录</div></div>';
        dashboardContent.style.display = 'block';
    }
}

/**
 * 显示错误信息
 */
function showError(message) {
    const loadingState = document.getElementById('loadingState');
    const dashboardContent = document.getElementById('dashboardContent');
    
    if (loadingState) {
        loadingState.style.display = 'none';
    }
    if (dashboardContent) {
        dashboardContent.innerHTML = `<div class="error-message" style="text-align: center; padding: 60px 20px; color: #ff4d4f;"><div style="font-size: 48px; margin-bottom: 16px;">⚠️</div><div style="font-size: 18px;">${message}</div></div>`;
        dashboardContent.style.display = 'block';
    }
}
