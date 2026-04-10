/**
 * 招聘流程数据看板
 */

// 使用项目统一的Supabase配置 (从config.js获取)
const DASHBOARD_SUPABASE_URL = window.SUPABASE_URL || 'https://your-project.supabase.co';
const DASHBOARD_SUPABASE_KEY = window.SUPABASE_ANON_KEY || 'your-anon-key';

// 初始化Supabase客户端
const dashboardSupabase = window.supabase.createClient(DASHBOARD_SUPABASE_URL, DASHBOARD_SUPABASE_KEY);

// 全局变量
let dataManager;
let currentTimeRange = 7;
let charts = {};

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    initComponents();
    bindEvents();
    await loadDashboardData();
});

/**
 * 初始化组件
 */
function initComponents() {
    dataManager = new RecruitmentDataManager(dashboardSupabase);
}

/**
 * 绑定事件
 */
function bindEvents() {
    // 时间筛选按钮
    document.querySelectorAll('.time-filter button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.time-filter button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTimeRange = e.target.dataset.range;
            loadDashboardData();
        });
    });
}

/**
 * 加载看板数据
 */
async function loadDashboardData() {
    showLoading();
    
    try {
        // 先从applications表同步数据
        const syncResult = await dataManager.syncFromApplications();
        if (syncResult.success && syncResult.count > 0) {
            console.log(syncResult.message);
        }
        
        // 重新加载数据
        await dataManager.loadData();
        
        // 获取所有数据
        const allData = await dataManager.getAllData();
        
        if (!allData || allData.length === 0) {
            showNoData();
            return;
        }
        
        // 根据时间范围筛选数据
        const filteredData = filterDataByTimeRange(allData, currentTimeRange);
        
        // 更新统计卡片
        updateStatsCards(filteredData, allData);
        
        // 更新图表
        updateCharts(filteredData);
        
        // 更新漏斗
        updateFunnel(filteredData);
        
        // 更新排行榜
        updateTopLists(filteredData);
        
        showContent();
    } catch (error) {
        console.error('加载数据失败:', error);
        showError('加载数据失败，请稍后重试');
    }
}

/**
 * 根据时间范围筛选数据
 */
function filterDataByTimeRange(data, range) {
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
 * 更新统计卡片
 */
function updateStatsCards(currentData, allData) {
    const stats = calculateStats(currentData);
    const prevStats = calculatePrevPeriodStats(allData, currentTimeRange);
    
    // 总应聘人数
    document.getElementById('statTotal').textContent = stats.total;
    updateTrend('statTotalTrend', stats.total, prevStats.total);
    
    // 成功入职
    document.getElementById('statOnboarded').textContent = stats.onboarded;
    updateTrend('statOnboardedTrend', stats.onboarded, prevStats.onboarded);
    
    // 整体转化率
    const conversionRate = stats.total > 0 ? ((stats.onboarded / stats.total) * 100).toFixed(1) : 0;
    document.getElementById('statConversion').textContent = conversionRate + '%';
    
    // 平均招聘周期
    const avgDays = calculateAvgDays(currentData);
    document.getElementById('statAvgDays').textContent = avgDays;
    updateTrend('statAvgDaysTrend', avgDays, prevStats.avgDays, true);
    
    // 淘汰率
    const rejectRate = stats.total > 0 ? ((stats.rejected / stats.total) * 100).toFixed(1) : 0;
    document.getElementById('statRejectRate').textContent = rejectRate + '%';
}

/**
 * 计算统计数据
 */
function calculateStats(data) {
    return {
        total: data.length,
        onboarded: data.filter(d => d.current_stage === 'onboarded' && d.onboarding_status === 'reported').length,
        rejected: data.filter(d => d.current_status === 'rejected').length,
        byStage: {
            application: data.filter(d => d.current_stage === 'application').length,
            first_interview: data.filter(d => d.current_stage === 'first_interview').length,
            second_interview: data.filter(d => d.current_stage === 'second_interview').length,
            hired: data.filter(d => d.current_stage === 'hired').length,
            onboarded: data.filter(d => d.current_stage === 'onboarded').length
        }
    };
}

/**
 * 计算上一周期统计数据（用于环比）
 */
function calculatePrevPeriodStats(allData, currentRange) {
    if (currentRange === 'all') return { total: 0, onboarded: 0, avgDays: 0 };
    
    const days = parseInt(currentRange);
    const now = new Date();
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - days);
    
    const prevEnd = new Date(currentStart);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days);
    
    const prevData = allData.filter(item => {
        const itemDate = new Date(item.created_at);
        return itemDate >= prevStart && itemDate < prevEnd;
    });
    
    return {
        total: prevData.length,
        onboarded: prevData.filter(d => d.current_stage === 'onboarded' && d.onboarding_status === 'reported').length,
        avgDays: calculateAvgDays(prevData)
    };
}

/**
 * 计算平均招聘周期
 */
function calculateAvgDays(data) {
    const completedData = data.filter(d => 
        d.current_stage === 'onboarded' && d.onboarding_status === 'reported' && d.application_date
    );
    
    if (completedData.length === 0) return 0;
    
    const totalDays = completedData.reduce((sum, item) => {
        const start = new Date(item.application_date);
        const end = new Date(item.onboarding_date || item.updated_at);
        return sum + Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    }, 0);
    
    return Math.round(totalDays / completedData.length);
}

/**
 * 更新趋势指示
 */
function updateTrend(elementId, current, previous, reverse = false) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const parent = element.parentElement;
    
    if (previous === 0) {
        element.textContent = '-';
        parent.className = 'stat-trend';
        return;
    }
    
    const change = ((current - previous) / previous * 100).toFixed(1);
    const isPositive = reverse ? change < 0 : change > 0;
    
    element.textContent = Math.abs(change) + '%';
    parent.className = 'stat-trend ' + (isPositive ? 'up' : 'down');
    parent.querySelector('span:first-child').textContent = isPositive ? '↑' : '↓';
}

/**
 * 更新图表
 */
function updateCharts(data) {
    updateTrendChart(data);
    updateStageChart(data);
    updatePositionChart(data);
    updateRejectReasonChart(data);
}

/**
 * 更新趋势图
 */
function updateTrendChart(data) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    
    // 按日期分组统计
    const dateMap = new Map();
    
    data.forEach(item => {
        const date = item.created_at ? item.created_at.split('T')[0] : '未知';
        if (!dateMap.has(date)) {
            dateMap.set(date, { total: 0, passed: 0, rejected: 0 });
        }
        const stats = dateMap.get(date);
        stats.total++;
        if (item.current_status === 'rejected') {
            stats.rejected++;
        } else if (item.current_status === 'passed' || item.current_stage === 'onboarded') {
            stats.passed++;
        }
    });
    
    // 排序并取最近30个数据点
    const sortedDates = Array.from(dateMap.keys()).sort().slice(-30);
    const labels = sortedDates;
    const totalData = sortedDates.map(d => dateMap.get(d).total);
    const passedData = sortedDates.map(d => dateMap.get(d).passed);
    const rejectedData = sortedDates.map(d => dateMap.get(d).rejected);
    
    if (charts.trend) {
        charts.trend.destroy();
    }
    
    charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '应聘人数',
                    data: totalData,
                    borderColor: '#1890ff',
                    backgroundColor: 'rgba(24, 144, 255, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: '通过人数',
                    data: passedData,
                    borderColor: '#52c41a',
                    backgroundColor: 'rgba(82, 196, 26, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: '淘汰人数',
                    data: rejectedData,
                    borderColor: '#ff4d4f',
                    backgroundColor: 'rgba(255, 77, 79, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

/**
 * 更新阶段分布图
 */
function updateStageChart(data) {
    const ctx = document.getElementById('stageChart').getContext('2d');
    
    const stageCounts = {
        'application': data.filter(d => d.current_stage === 'application').length,
        'first_interview': data.filter(d => d.current_stage === 'first_interview').length,
        'second_interview': data.filter(d => d.current_stage === 'second_interview').length,
        'hired': data.filter(d => d.current_stage === 'hired').length,
        'onboarded': data.filter(d => d.current_stage === 'onboarded').length
    };
    
    if (charts.stage) {
        charts.stage.destroy();
    }
    
    charts.stage = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['投递简历', '初试阶段', '复试阶段', '待报到', '已入职'],
            datasets: [{
                data: [
                    stageCounts.application,
                    stageCounts.first_interview,
                    stageCounts.second_interview,
                    stageCounts.hired,
                    stageCounts.onboarded
                ],
                backgroundColor: [
                    '#1890ff',
                    '#52c41a',
                    '#faad14',
                    '#722ed1',
                    '#13c2c2'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

/**
 * 更新岗位分布图
 */
function updatePositionChart(data) {
    const ctx = document.getElementById('positionChart').getContext('2d');
    
    // 统计岗位数量
    const positionMap = new Map();
    data.forEach(item => {
        const position = item.position || '未知岗位';
        positionMap.set(position, (positionMap.get(position) || 0) + 1);
    });
    
    // 取TOP10
    const sortedPositions = Array.from(positionMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    if (charts.position) {
        charts.position.destroy();
    }
    
    charts.position = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedPositions.map(p => p[0]),
            datasets: [{
                label: '应聘人数',
                data: sortedPositions.map(p => p[1]),
                backgroundColor: '#1890ff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

/**
 * 更新淘汰原因图
 */
function updateRejectReasonChart(data) {
    const ctx = document.getElementById('rejectReasonChart').getContext('2d');
    
    // 统计淘汰原因
    const reasonMap = new Map();
    data.filter(d => d.current_status === 'rejected').forEach(item => {
        const reason = item.first_interview_result === 'rejected' 
            ? (item.first_reject_reason || '其他')
            : (item.second_reject_reason || '其他');
        reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
    });
    
    // 取TOP8
    const sortedReasons = Array.from(reasonMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
    
    if (charts.rejectReason) {
        charts.rejectReason.destroy();
    }
    
    if (sortedReasons.length === 0) {
        // 没有淘汰数据时显示空状态
        return;
    }
    
    charts.rejectReason = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: sortedReasons.map(r => r[0]),
            datasets: [{
                data: sortedReasons.map(r => r[1]),
                backgroundColor: [
                    '#ff4d4f',
                    '#ff7a45',
                    '#ffa940',
                    '#ffc53d',
                    '#ffd666',
                    '#fff566',
                    '#d3f261',
                    '#95de64'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

/**
 * 更新漏斗
 */
function updateFunnel(data) {
    const stats = calculateStats(data);
    const total = stats.total || 1; // 避免除以0
    
    const stages = [
        { name: '投递简历', count: stats.total, rate: 100 },
        { name: '初试通过', count: stats.byStage.first_interview + stats.byStage.second_interview + stats.byStage.hired + stats.byStage.onboarded, rate: 0 },
        { name: '复试通过', count: stats.byStage.second_interview + stats.byStage.hired + stats.byStage.onboarded, rate: 0 },
        { name: '录用确认', count: stats.byStage.hired + stats.byStage.onboarded, rate: 0 },
        { name: '成功入职', count: stats.onboarded, rate: 0 }
    ];
    
    // 计算转化率
    stages.forEach((stage, index) => {
        if (index > 0) {
            stage.rate = ((stage.count / total) * 100).toFixed(1);
        }
    });
    
    const container = document.getElementById('funnelContainer');
    container.innerHTML = stages.map((stage, index) => `
        <div class="funnel-stage stage-${index + 1}">
            <div>
                <div>${stage.name}</div>
                <div class="funnel-info">
                    <span>${stage.count}人</span>
                    <span>${stage.rate}%</span>
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * 更新排行榜
 */
function updateTopLists(data) {
    // 热门岗位排行
    const positionMap = new Map();
    data.forEach(item => {
        const position = item.position || '未知岗位';
        if (!positionMap.has(position)) {
            positionMap.set(position, { count: 0, passed: 0 });
        }
        const stats = positionMap.get(position);
        stats.count++;
        if (item.current_stage === 'onboarded' && item.onboarding_status === 'reported') {
            stats.passed++;
        }
    });
    
    const topPositions = Array.from(positionMap.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10);
    
    document.getElementById('topPositions').innerHTML = topPositions.map((item, index) => `
        <div class="top-list-item">
            <div class="top-list-rank ${index < 3 ? 'top3' : 'other'}">${index + 1}</div>
            <div class="top-list-info">
                <div class="top-list-name">${item[0]}</div>
                <div class="top-list-count">入职 ${item[1].passed} 人</div>
            </div>
            <div class="top-list-value">${item[1].count}人</div>
        </div>
    `).join('');
    
    // 地区分布排行
    const regionMap = new Map();
    data.forEach(item => {
        const region = item.current_residence || '未知地区';
        regionMap.set(region, (regionMap.get(region) || 0) + 1);
    });
    
    const topRegions = Array.from(regionMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    document.getElementById('topRegions').innerHTML = topRegions.map((item, index) => `
        <div class="top-list-item">
            <div class="top-list-rank ${index < 3 ? 'top3' : 'other'}">${index + 1}</div>
            <div class="top-list-info">
                <div class="top-list-name">${item[0]}</div>
            </div>
            <div class="top-list-value">${item[1]}人</div>
        </div>
    `).join('');
}

/**
 * 显示加载状态
 */
function showLoading() {
    document.getElementById('loadingState').style.display = 'flex';
    document.getElementById('dashboardContent').style.display = 'none';
}

/**
 * 显示内容
 */
function showContent() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('dashboardContent').style.display = 'block';
}

/**
 * 显示无数据状态
 */
function showNoData() {
    document.getElementById('loadingState').innerHTML = `
        <div style="text-align: center; color: #8c8c8c;">
            <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
            <p>暂无数据</p>
            <p style="font-size: 14px;">请先在流程管理页面添加招聘数据</p>
        </div>
    `;
}

/**
 * 显示错误
 */
function showError(message) {
    document.getElementById('loadingState').innerHTML = `
        <div style="text-align: center; color: #ff4d4f;">
            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <p>${message}</p>
        </div>
    `;
}

// 暴露全局函数
window.loadDashboardData = loadDashboardData;
