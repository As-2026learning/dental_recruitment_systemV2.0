/**
 * 招聘流程管理模块 - 主页面逻辑
 */

// 使用项目统一的Supabase配置 (从config.js获取)
const RECRUITMENT_SUPABASE_URL = window.SUPABASE_URL || 'https://your-project.supabase.co';
const RECRUITMENT_SUPABASE_KEY = window.SUPABASE_ANON_KEY || 'your-anon-key';

// 初始化Supabase客户端
const recruitmentSupabase = window.supabase.createClient(RECRUITMENT_SUPABASE_URL, RECRUITMENT_SUPABASE_KEY);

// 全局变量
let dataManager;
let table;
let detailModal;
let firstInterviewModal;
let secondInterviewModal;
let onboardingModal;
let exportManager;
let dataQualityChecker;
let interviewDateSyncService;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    initComponents();
    bindEvents();
    // 【优化】先快速加载数据展示页面，后台异步同步
    await loadDataFast();
});

/**
 * 初始化组件
 * 【优化】延迟初始化非关键组件
 */
function initComponents() {
    dataManager = new RecruitmentDataManager(recruitmentSupabase);
    
    // 【优化】非关键组件延迟初始化
    setTimeout(() => {
        exportManager = new ExportManager(EXPORT_FIELDS);
        dataQualityChecker = new DataQualityChecker(dataManager);
        interviewDateSyncService = new InterviewDateSyncService(recruitmentSupabase);
        detailModal = new DetailModal();
        firstInterviewModal = new FirstInterviewModal();
        secondInterviewModal = new SecondInterviewModal();
        onboardingModal = new OnboardingModal();
    }, 0);
    
    // 初始化表格（关键组件）
    table = new DynamicTable('tableContainer', {
        fields: CORE_FIELDS,
        showCheckbox: true,
        onRowClick: (id) => showDetail(id),
        onView: (id) => showDetail(id),
        onProcess: (id, stage) => handleProcess(id, stage),
        onSelectionChange: (selectedIds) => {
            updateBatchDeleteButton(selectedIds);
        }
    });
}

/**
 * 【优化】快速加载数据（首次加载使用）
 * 策略：先加载显示数据，后台异步同步
 */
async function loadDataFast() {
    showLoading();

    try {
        // 1. 先快速加载数据展示页面
        await loadDataWithoutSync();
        
        // 2. 后台异步执行数据同步（不阻塞页面）
        setTimeout(async () => {
            try {
                const syncResult = await dataManager.syncFromApplications();
                if (syncResult.success && (syncResult.inserted > 0 || syncResult.updated > 0)) {
                    // 同步完成后静默刷新数据
                    await loadDataWithoutSync();
                }
            } catch (error) {
                console.error('后台同步失败:', error);
            }
        }, 100);
    } catch (error) {
        console.error('加载数据过程中发生错误:', error);
        showError('加载数据失败: ' + error.message);
    }

    hideLoading();
}

/**
 * 加载数据（完整版：包含同步）
 * 【优化】手动触发时使用，如强制同步按钮
 */
async function loadData() {
    showLoading();

    try {
        const syncResult = await dataManager.syncFromApplications();
        
        if (syncResult.success) {
            if (syncResult.inserted > 0 || syncResult.updated > 0 || syncResult.deleted > 0) {
                console.log(`数据同步完成：新增 ${syncResult.inserted || 0} 条，更新 ${syncResult.updated || 0} 条，删除 ${syncResult.deleted || 0} 条`);
            }
        }
        
        await loadDataWithoutSync();
    } catch (error) {
        console.error('加载数据过程中发生错误:', error);
        showError('加载数据失败: ' + error.message);
    }

    hideLoading();
}

/**
 * 加载数据（轻量版：不包含同步，用于处理后的快速刷新）
 */
async function loadDataWithoutSync() {
    try {
        // 直接加载数据，不进行同步
        const result = await dataManager.loadData();

        if (result.success) {
            updateStats();
            updateFilterOptions();
            renderTable();
            updatePagination();
        } else {
            showError('加载数据失败: ' + result.error);
        }
    } catch (error) {
        console.error('加载数据过程中发生错误:', error);
        showError('加载数据失败: ' + error.message);
    }
}

/**
 * 显示加载状态
 */
function showLoading() {
    document.getElementById('tableContainer').innerHTML = '<div class="loading-message">正在加载数据...</div>';
}

/**
 * 隐藏加载状态
 */
function hideLoading() {
    // 加载完成后会自动渲染表格
}

/**
 * 显示错误信息
 */
function showError(message) {
    document.getElementById('tableContainer').innerHTML = `<div class="empty-message" style="color: #ff4d4f;">${message}</div>`;
}

/**
 * 更新统计信息
 */
function updateStats() {
    const stats = dataManager.getStatistics();
    const statsContainer = document.getElementById('statsCards');

    statsContainer.innerHTML = `
        <div class="stat-card" data-filter="all" title="点击查看全部候选人">
            <div class="stat-value">${stats.total}</div>
            <div class="stat-label">总应聘人数</div>
        </div>
        <div class="stat-card" data-filter="first_interview_pending" title="点击查看初试候选人">
            <div class="stat-value">${stats.firstInterviewPending}</div>
            <div class="stat-label">初试</div>
        </div>
        <div class="stat-card" data-filter="second_interview_pending" title="点击查看复试候选人">
            <div class="stat-value">${stats.secondInterviewPending}</div>
            <div class="stat-label">复试</div>
        </div>
        <div class="stat-card" data-filter="hire_pending" title="点击查看已录用候选人">
            <div class="stat-value">${stats.hirePending}</div>
            <div class="stat-label">录用</div>
        </div>
        <div class="stat-card" data-filter="awaiting_onboard" title="点击查看待报到候选人">
            <div class="stat-value">${stats.awaitingOnboard}</div>
            <div class="stat-label">待报到</div>
        </div>
        <div class="stat-card" data-filter="not_reported" title="点击查看未报到候选人">
            <div class="stat-value">${stats.notReported || 0}</div>
            <div class="stat-label">未报到</div>
        </div>
        <div class="stat-card highlight" data-filter="onboarded" title="点击查看已报到候选人">
            <div class="stat-value">${stats.onboarded}</div>
            <div class="stat-label">已报到</div>
        </div>
    `;

    // 绑定点击事件
    statsContainer.querySelectorAll('.stat-card').forEach(card => {
        card.addEventListener('click', () => {
            const filterType = card.dataset.filter;
            handleStatCardClick(filterType);
        });
    });
}

/**
 * 处理统计卡片点击
 */
function handleStatCardClick(filterType) {
    // 重置所有筛选条件
    document.getElementById('filterPosition').value = '';
    document.getElementById('filterJobType').value = '';
    document.getElementById('filterStage').value = '';
    document.getElementById('filterStatus').value = '';
    // 重置面试日期范围筛选
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    updateDateRangeUI();
    document.getElementById('filterTimeSlot').value = '';
    document.getElementById('filterSearch').value = '';

    // 构建筛选条件
    let filters = {};

    switch (filterType) {
        case 'all':
            // 显示全部，不需要额外筛选
            filters = {};
            break;
        case 'first_interview_pending':
            // 关键修复：初试统计包含所有已完成初试的人（包括已进入复试、录用等后续环节）
            filters = { special_status: 'first_interview_all' };
            document.getElementById('filterStage').value = '';
            document.getElementById('filterStatus').value = '';
            break;
        case 'second_interview_pending':
            // 关键修复：复试统计包含所有已完成复试的人（包括已进入录用等后续环节）
            filters = { special_status: 'second_interview_all' };
            document.getElementById('filterStage').value = '';
            document.getElementById('filterStatus').value = '';
            break;
        case 'hire_pending':
            // 显示所有已录用的人（包括待确认offer、待报到、未报到、已报到）
            filters = { special_status: 'hire_all' };
            document.getElementById('filterStage').value = '';
            break;
        case 'awaiting_onboard':
            // 显示待报到的候选人（current_stage='hired' 且 accept_offer='yes' 且未报到且无未报到原因）
            filters = { special_status: 'awaiting_onboard' };
            document.getElementById('filterStage').value = 'hired';
            document.getElementById('filterStatus').value = 'pending';
            break;
        case 'not_reported':
            // 显示未报到的候选人（current_stage='hired' 且 accept_offer='yes' 且有未报到原因）
            filters = { special_status: 'not_reported' };
            document.getElementById('filterStage').value = 'hired';
            document.getElementById('filterStatus').value = 'reject';
            break;
        case 'onboarded':
            // 显示已报到的候选人（is_reported='yes'）
            filters = { special_status: 'onboarded' };
            document.getElementById('filterStage').value = 'onboarded';
            break;
    }

    // 应用筛选（当选择"全部"时，重置所有筛选条件）
    const shouldReset = filterType === 'all';
    dataManager.applyFilters(filters, shouldReset);
    renderTable();
    updatePagination();

    // 显示提示
    const filterNames = {
        'all': '全部候选人',
        'first_interview_pending': '初试候选人（含后续环节）',
        'second_interview_pending': '复试候选人（含后续环节）',
        'hire_pending': '已录用候选人（含待报到、未报到、已报到）',
        'awaiting_onboard': '待报到候选人',
        'not_reported': '未报到候选人',
        'onboarded': '已报到候选人'
    };

    // 高亮选中的卡片
    document.querySelectorAll('.stat-card').forEach(card => {
        card.classList.remove('active');
    });
    document.querySelector(`.stat-card[data-filter="${filterType}"]`)?.classList.add('active');

    console.log(`已筛选：${filterNames[filterType]}`);

    // 显示清除筛选按钮
    document.getElementById('btnClearFilter').style.display = 'inline-block';
}

/**
 * 清除统计卡片筛选
 */
function clearStatFilter() {
    // 重置所有筛选条件
    document.getElementById('filterPosition').value = '';
    document.getElementById('filterJobType').value = '';
    document.getElementById('filterStage').value = '';
    document.getElementById('filterStatus').value = '';
    // 重置面试日期范围筛选
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    updateDateRangeUI();
    document.getElementById('filterTimeSlot').value = '';
    document.getElementById('filterSearch').value = '';

    // 清除高亮
    document.querySelectorAll('.stat-card').forEach(card => {
        card.classList.remove('active');
    });

    // 隐藏清除筛选按钮
    document.getElementById('btnClearFilter').style.display = 'none';

    // 重新加载数据（重置筛选）
    resetFilters();
}

/**
 * 更新筛选选项
 */
function updateFilterOptions() {
    const options = dataManager.getFilterOptions();

    // 更新岗位选项
    const positionSelect = document.getElementById('filterPosition');
    positionSelect.innerHTML = '<option value="">全部岗位</option>' +
        options.positions.map(pos => `<option value="${pos}">${pos}</option>`).join('');

    // 更新工种选项
    const jobTypeSelect = document.getElementById('filterJobType');
    jobTypeSelect.innerHTML = '<option value="">全部工种</option>' +
        options.jobTypes.map(type => `<option value="${type}">${type}</option>`).join('');
}

/**
 * 同步面试日期
 * 从bookings表同步到recruitment_process和applications表
 * 优化：使用并行更新代替串行更新
 */
async function syncInterviewDates() {
    try {
        console.log('开始同步面试日期...');

        // 获取所有有效的预约记录
        const { data: bookings, error } = await recruitmentSupabase
            .from('bookings')
            .select('application_id, booking_date, time_slot, status')
            .neq('status', 'cancelled')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('获取预约数据失败:', error);
            return { success: false, error: error.message };
        }

        if (!bookings || bookings.length === 0) {
            console.log('没有需要同步的预约数据');
            return { success: true, message: '没有需要同步的预约数据', count: 0 };
        }

        // 去重 - 只保留每个application_id最新的记录
        const uniqueBookings = [];
        const seenAppIds = new Set();

        for (const booking of bookings) {
            if (!seenAppIds.has(booking.application_id)) {
                uniqueBookings.push(booking);
                seenAppIds.add(booking.application_id);
            }
        }

        console.log(`找到 ${uniqueBookings.length} 条唯一预约记录需要同步`);

        // 优化：并行更新所有记录，而不是串行更新
        const updatePromises = uniqueBookings.map(async (booking) => {
            try {
                // 检查 application_id 是否有效
                if (!booking.application_id || booking.application_id === null || booking.application_id === 'null') {
                    console.warn(`跳过无效预约记录: application_id 为 null, booking.id: ${booking.id}`);
                    return { success: false, skipped: true };
                }
                
                // 并行更新recruitment_process表和applications表
                const [rpResult, appResult] = await Promise.all([
                    recruitmentSupabase
                        .from('recruitment_process')
                        .update({
                            interview_date: booking.booking_date,
                            interview_time_slot: booking.time_slot,
                            updated_at: new Date().toISOString()
                        })
                        .eq('application_id', booking.application_id),
                    recruitmentSupabase
                        .from('applications')
                        .update({
                            interview_date: booking.booking_date,
                            interview_time_slot: booking.time_slot,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', booking.application_id)
                ]);

                if (rpResult.error) {
                    console.error(`更新recruitment_process失败 (app_id: ${booking.application_id}):`, rpResult.error);
                }
                if (appResult.error) {
                    console.error(`更新applications失败 (id: ${booking.application_id}):`, appResult.error);
                }

                return { success: !rpResult.error && !appResult.error };
            } catch (err) {
                console.error(`同步失败 (app_id: ${booking.application_id}):`, err);
                return { success: false };
            }
        });

        const results = await Promise.all(updatePromises);
        const updateCount = results.filter(r => r.success).length;
        const failedCount = results.filter(r => !r.success).length;

        console.log(`面试日期同步完成: ${updateCount}/${uniqueBookings.length} 条记录成功，${failedCount} 条失败`);
        return {
            success: true,
            message: `同步完成: ${updateCount}/${uniqueBookings.length} 条记录`,
            count: updateCount,
            failed: failedCount
        };
    } catch (error) {
        console.error('同步面试日期失败:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 渲染表格
 */
function renderTable() {
    const pageData = dataManager.getPageData();
    table.render(pageData.data, CORE_FIELDS);
    updateTotalCount(pageData.pagination.totalCount);
}

/**
 * 更新总数显示
 */
function updateTotalCount(count) {
    document.getElementById('totalCount').textContent = `共 ${count} 条记录`;
}

/**
 * 更新分页
 */
function updatePagination() {
    const pagination = dataManager.getPageData().pagination;
    const container = document.getElementById('pagination');
    
    let html = '';
    
    // 上一页
    html += `<button ${pagination.currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${pagination.currentPage - 1})">上一页</button>`;
    
    // 页码
    for (let i = 1; i <= pagination.totalPages; i++) {
        if (i === 1 || i === pagination.totalPages || (i >= pagination.currentPage - 2 && i <= pagination.currentPage + 2)) {
            html += `<button class="${i === pagination.currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
        } else if (i === pagination.currentPage - 3 || i === pagination.currentPage + 3) {
            html += `<span>...</span>`;
        }
    }
    
    // 下一页
    html += `<button ${pagination.currentPage === pagination.totalPages ? 'disabled' : ''} onclick="goToPage(${pagination.currentPage + 1})">下一页</button>`;
    
    container.innerHTML = html;
}

/**
 * 跳转到指定页
 */
function goToPage(page) {
    dataManager.getPageData(page);
    renderTable();
    updatePagination();
}

/**
 * 绑定事件
 */
function bindEvents() {
    // 搜索按钮
    document.getElementById('btnSearch').addEventListener('click', applyFilters);
    
    // 重置按钮
    document.getElementById('btnReset').addEventListener('click', resetFilters);
    
    // 导出按钮
    document.getElementById('btnExport').addEventListener('click', handleExport);
    
    // 打印按钮
    document.getElementById('btnPrint').addEventListener('click', handlePrint);
    
    // 数据诊断按钮
    document.getElementById('btnDiagnoseSync').addEventListener('click', async () => {
        const btn = document.getElementById('btnDiagnoseSync');
        const originalText = btn.innerHTML;
        btn.innerHTML = '🔍 诊断中...';
        btn.disabled = true;
        
        try {
            await diagnoseDataSync();
        } catch (error) {
            console.error('数据诊断失败:', error);
            alert('诊断失败: ' + error.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
    
    // 强制同步按钮
    document.getElementById('btnForceSync').addEventListener('click', async () => {
        if (!confirm('确定要强制同步数据吗？这将从applications表重新同步所有数据。')) {
            return;
        }

        const btn = document.getElementById('btnForceSync');
        const originalText = btn.innerHTML;
        btn.innerHTML = '🔄 同步中...';
        btn.disabled = true;

        try {
            // 【优化】清除同步缓存，强制全量同步
            dataManager.clearSyncCache();
            
            const result = await dataManager.syncFromApplications(true);

            if (result.success) {
                // 同步面试日期
                const dateSyncResult = await syncInterviewDates();
                
                alert(result.message);
                await loadData();
            } else {
                alert('同步失败: ' + (result.error || '未知错误'));
            }
        } catch (error) {
            console.error('强制同步过程中发生错误:', error);
            alert('同步失败: ' + error.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });

    // 同步面试日期按钮
    const syncInterviewBtn = document.createElement('button');
    syncInterviewBtn.id = 'syncInterviewBtn';
    syncInterviewBtn.className = 'btn-secondary';
    syncInterviewBtn.innerHTML = '📅 同步面试日期';
    syncInterviewBtn.style.marginLeft = '10px';
    syncInterviewBtn.addEventListener('click', async () => {
        await syncInterviewDates();
        await loadData();
    });
    document.querySelector('.action-buttons')?.appendChild(syncInterviewBtn);
    
    // 数据质量检查按钮
    document.getElementById('btnDataQuality').addEventListener('click', handleDataQualityCheck);
    
    // 清理无效数据按钮
    document.getElementById('btnCleanupInvalid').addEventListener('click', async () => {
        if (!confirm('确定要清理无效数据吗？这将删除 application_id 为 null 或对应 applications 记录已不存在的招聘流程数据。')) {
            return;
        }
        
        const btn = document.getElementById('btnCleanupInvalid');
        const originalText = btn.innerHTML;
        btn.innerHTML = '🧹 清理中...';
        btn.disabled = true;
        
        try {
            console.log('开始手动清理无效数据...');
            const result = await dataManager.cleanupInvalidRecords();
            console.log('清理结果:', result);
            
            if (result.error) {
                alert('清理失败: ' + result.error);
            } else {
                alert(`清理完成！共删除 ${result.deletedCount} 条无效记录。`);
                await loadData();
            }
        } catch (error) {
            console.error('清理过程中发生错误:', error);
            alert('清理失败: ' + error.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });

    // 批量删除按钮
    document.getElementById('btnBatchDelete').addEventListener('click', handleBatchDelete);

    // 清除筛选按钮
    document.getElementById('btnClearFilter').addEventListener('click', clearStatFilter);

    // 筛选条件变化
    ['filterPosition', 'filterJobType', 'filterStage', 'filterStatus', 'filterTimeSlot'].forEach(id => {
        document.getElementById(id).addEventListener('change', applyFilters);
    });

    // 面试日期范围筛选
    document.getElementById('filterStartDate').addEventListener('change', handleDateRangeChange);
    document.getElementById('filterEndDate').addEventListener('change', handleDateRangeChange);

    // 清除日期范围筛选
    document.getElementById('btnClearDateRange').addEventListener('click', clearDateRangeFilter);

    // 搜索框回车
    document.getElementById('filterSearch').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') applyFilters();
    });
}

/**
 * 处理日期范围变化
 */
function handleDateRangeChange() {
    const startDate = document.getElementById('filterStartDate').value;
    const endDate = document.getElementById('filterEndDate').value;

    // 验证日期范围
    if (startDate && endDate) {
        if (new Date(startDate) > new Date(endDate)) {
            alert('起始日期不能晚于结束日期');
            document.getElementById('filterEndDate').value = '';
            return;
        }
    }

    // 更新UI状态
    updateDateRangeUI();

    // 应用筛选
    applyFilters();
}

/**
 * 更新日期范围筛选UI状态
 */
function updateDateRangeUI() {
    const startDate = document.getElementById('filterStartDate').value;
    const endDate = document.getElementById('filterEndDate').value;
    const dateRangeFilter = document.querySelector('.date-range-filter');
    const btnClearDate = document.getElementById('btnClearDateRange');

    if (startDate || endDate) {
        dateRangeFilter.classList.add('active');
        btnClearDate.style.display = 'inline-block';
    } else {
        dateRangeFilter.classList.remove('active');
        btnClearDate.style.display = 'none';
    }
}

/**
 * 清除日期范围筛选
 */
function clearDateRangeFilter() {
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    updateDateRangeUI();
    applyFilters();
}

/**
 * 应用筛选
 */
function applyFilters() {
    const filters = {
        position: document.getElementById('filterPosition').value,
        job_type: document.getElementById('filterJobType').value,
        stage: document.getElementById('filterStage').value,
        status: document.getElementById('filterStatus').value,
        // 面试日期范围筛选
        interview_date_start: document.getElementById('filterStartDate').value,
        interview_date_end: document.getElementById('filterEndDate').value,
        interview_time_slot: document.getElementById('filterTimeSlot').value,
        search: document.getElementById('filterSearch').value.trim()
    };

    dataManager.applyFilters(filters);
    renderTable();
    updatePagination();
}

/**
 * 重置筛选
 */
function resetFilters() {
    document.getElementById('filterPosition').value = '';
    document.getElementById('filterJobType').value = '';
    document.getElementById('filterStage').value = '';
    document.getElementById('filterStatus').value = '';
    // 重置面试日期范围筛选
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    updateDateRangeUI();
    document.getElementById('filterTimeSlot').value = '';
    document.getElementById('filterSearch').value = '';

    dataManager.resetFilters();
    renderTable();
    updatePagination();
}

/**
 * 显示详情
 */
async function showDetail(id) {
    const record = await dataManager.getRecord(id);
    if (record) {
        // 【优化】确保弹窗组件已初始化
        if (!detailModal) {
            detailModal = new DetailModal();
        }
        detailModal.show(record, DETAIL_FIELDS);
    }
}

/**
 * 处理流程操作
 */
async function handleProcess(id, stage) {
    const record = await dataManager.getRecord(id);
    if (!record) return;

    // 【优化】确保弹窗组件已初始化
    if (!firstInterviewModal) firstInterviewModal = new FirstInterviewModal();
    if (!secondInterviewModal) secondInterviewModal = new SecondInterviewModal();
    if (!onboardingModal) onboardingModal = new OnboardingModal();

    // 关键修复：根据按钮的 stage 参数（data-stage）决定打开哪个弹窗，而不是 current_stage
    if (stage === 'first') {
        // 初试处理
        firstInterviewModal.show(record, async (recordId, data) => {
            try {
                const result = await dataManager.processFirstInterview(recordId, data);
                if (result.success) {
                    // 【优化】使用轻量级刷新，避免同步操作导致的延迟
                    await loadDataWithoutSync();
                } else {
                    alert('处理失败: ' + (result.error || '未知错误'));
                }
                return result;
            } catch (error) {
                console.error('初试处理过程中发生错误:', error);
                alert('处理失败: ' + error.message);
                return { success: false, error: error.message };
            }
        });
    } else if (stage === 'second') {
        // 复试处理
        secondInterviewModal.show(record, async (recordId, data) => {
            try {
                const result = await dataManager.processSecondInterview(recordId, data);
                if (result.success) {
                    // 【优化】使用轻量级刷新，避免同步操作导致的延迟
                    await loadDataWithoutSync();
                } else {
                    alert('处理失败: ' + (result.error || '未知错误'));
                }
                return result;
            } catch (error) {
                console.error('复试处理过程中发生错误:', error);
                alert('处理失败: ' + error.message);
                return { success: false, error: error.message };
            }
        });
    } else if (stage === 'hired') {
        // 填写录用信息
        secondInterviewModal.show(record, async (recordId, data) => {
            try {
                const result = await dataManager.processHiring(recordId, data);
                if (result.success) {
                    // 【优化】使用轻量级刷新，避免同步操作导致的延迟
                    await loadDataWithoutSync();
                } else {
                    alert('处理失败: ' + (result.error || '未知错误'));
                }
                return result;
            } catch (error) {
                console.error('录用处理过程中发生错误:', error);
                alert('处理失败: ' + error.message);
                return { success: false, error: error.message };
            }
        });
    } else if (record.current_stage === 'hired') {
        // 录用阶段 - 根据是否接受offer决定显示哪个弹窗
        // 关键修复：支持多种accept_offer格式
        const hasAcceptedOffer = record.accept_offer === 'yes' || record.accept_offer === '是' || record.accept_offer === true || record.accept_offer === 1 || record.accept_offer === '1';
        const hasRejectedOffer = record.accept_offer === 'no' || record.accept_offer === '否';
        const hasNoReportReason = record.no_report_reason && record.no_report_reason.trim() !== '' && record.no_report_reason !== '无';
        // 关键修复：判断是否为已提交未报到状态（current_status为reject表示未报到）
        const isNotReported = record.current_status === 'reject' || record.current_status === 'rejected' || record.current_status === '不通过';

        // 关键修复：已拒绝状态不允许任何操作
        if (hasRejectedOffer) {
            alert('该候选人已拒绝offer，无法进行操作');
            return;
        }

        // 关键修复：未报到状态不允许任何操作
        if (hasNoReportReason || isNotReported) {
            alert('该候选人已标记为未报到，无法进行操作');
            return;
        }

        if (hasAcceptedOffer) {
            // 接受offer - 显示报到登记弹窗
            onboardingModal.show(record, async (recordId, data) => {
                try {
                    const result = await dataManager.processOnboarding(recordId, data);
                    if (result.success) {
                        // 【优化】使用轻量级刷新，避免同步操作导致的延迟
                        await loadDataWithoutSync();
                    } else {
                        alert('处理失败: ' + (result.error || '未知错误'));
                    }
                    return result;
                } catch (error) {
                    console.error('报到处理过程中发生错误:', error);
                    alert('处理失败: ' + error.message);
                    return { success: false, error: error.message };
                }
            });
        } else {
            // 未设置accept_offer - 显示复试弹窗填写录用信息
            secondInterviewModal.show(record, async (recordId, data) => {
                try {
                    const result = await dataManager.processHiring(recordId, data);
                    if (result.success) {
                        // 【优化】使用轻量级刷新，避免同步操作导致的延迟
                        await loadDataWithoutSync();
                    } else {
                        alert('处理失败: ' + (result.error || '未知错误'));
                    }
                    return result;
                } catch (error) {
                    console.error('录用处理过程中发生错误:', error);
                    alert('处理失败: ' + error.message);
                    return { success: false, error: error.message };
                }
            });
        }
    }
}

/**
 * 处理导出
 */
async function handleExport() {
    // 【优化】确保组件已初始化
    if (!exportManager) {
        exportManager = new ExportManager(EXPORT_FIELDS);
    }
    
    // 获取选中的记录ID
    const selectedIds = table.getSelectedIds();
    
    let data;
    if (selectedIds.length > 0) {
        // 只导出选中的记录
        const allData = dataManager.getPageData().data;
        data = allData.filter(row => selectedIds.includes(row.id));
    } else {
        // 如果没有选中记录，导出当前页所有数据
        data = dataManager.getPageData().data;
    }
    
    if (!data || data.length === 0) {
        alert('没有可导出的数据');
        return;
    }
    
    const fileName = `招聘流程数据_${new Date().toISOString().slice(0, 10)}`;
    exportManager.exportToExcel(data, fileName);
}

/**
 * 处理打印
 */
function handlePrint() {
    // 【优化】确保组件已初始化
    if (!exportManager) {
        exportManager = new ExportManager(EXPORT_FIELDS);
    }
    const data = dataManager.getPageData().data;
    exportManager.print(data);
}

/**
 * 处理强制同步
 */
async function handleForceSync() {
    if (!confirm('确定要强制同步数据吗？这将从应聘信息综合管理表中同步所有缺失字段。')) {
        return;
    }

    console.log('开始强制同步数据...');
    const result = await dataManager.syncFromApplications();

    if (result.success) {
        alert(result.message);
        await loadData();
    } else {
        alert('同步失败: ' + result.error);
    }
}

/**
 * 【新增】数据对比诊断 - 检查 applications 和 recruitment_process 表的数据差异
 */
async function diagnoseDataSync() {
    try {
        console.log('开始数据对比诊断...');
        
        // 1. 获取 applications 表数据（不指定字段，获取所有字段）
        const { data: applications, error: appError } = await recruitmentSupabase
            .from('applications')
            .select('*');
        
        if (appError) throw appError;
        
        // 2. 获取 recruitment_process 表数据
        const { data: rpData, error: rpError } = await recruitmentSupabase
            .from('recruitment_process')
            .select('id, application_id, name, source_status');
        
        if (rpError) throw rpError;
        
        // 3. 构建对比数据
        const rpAppIds = new Set(rpData.map(rp => rp.application_id));
        const missingInRp = [];
        const statusMismatch = [];
        
        applications.forEach(app => {
            // 获取 applications 表中的状态（从多个可能的字段获取）
            let appStatus = app.status || '';
            if (!appStatus) {
                // 尝试从 form_data、fields 等字段获取
                const dataFields = app.form_data || app.fields || app.dynamic_fields || {};
                const statusFields = ['status', '应聘状态', '申请状态', 'state'];
                for (const field of statusFields) {
                    if (dataFields[field]) {
                        appStatus = dataFields[field];
                        break;
                    }
                }
            }
            
            // 检查是否已取消/已拒绝
            const isCancelled = ['已取消', 'cancelled', 'canceled', 'cancel', '已撤销', '撤销'].includes(appStatus);
            const isRejected = ['已拒绝', 'rejected', 'reject', '拒绝', '不通过', '未通过'].includes(appStatus);
            
            // 只检查非取消、非拒绝的记录
            if (!isCancelled && !isRejected) {
                if (!rpAppIds.has(app.id)) {
                    missingInRp.push({
                        id: app.id,
                        name: app.name,
                        status: appStatus || 'pending'
                    });
                } else {
                    // 检查状态是否一致
                    const rpRecord = rpData.find(rp => rp.application_id === app.id);
                    if (rpRecord && rpRecord.source_status !== appStatus) {
                        statusMismatch.push({
                            id: app.id,
                            name: app.name,
                            appStatus: appStatus || 'pending',
                            rpStatus: rpRecord.source_status || 'pending'
                        });
                    }
                }
            }
        });
        
        // 4. 显示诊断结果
        console.log('=== 数据对比诊断结果 ===');
        console.log(`applications 表总记录数: ${applications.length}`);
        console.log(`recruitment_process 表总记录数: ${rpData.length}`);
        console.log(`未同步到 recruitment_process 的记录: ${missingInRp.length} 条`);
        console.log(`状态不一致的记录: ${statusMismatch.length} 条`);
        
        if (missingInRp.length > 0) {
            console.log('未同步的记录:', missingInRp);
        }
        if (statusMismatch.length > 0) {
            console.log('状态不一致的记录:', statusMismatch);
        }
        
        // 5. 显示提示
        let message = `数据对比诊断结果：\n\n`;
        message += `applications 表总记录数: ${applications.length}\n`;
        message += `recruitment_process 表总记录数: ${rpData.length}\n\n`;
        message += `未同步的记录: ${missingInRp.length} 条\n`;
        message += `状态不一致的记录: ${statusMismatch.length} 条\n\n`;
        
        if (missingInRp.length > 0) {
            message += `未同步的记录示例:\n`;
            missingInRp.slice(0, 5).forEach(item => {
                message += `- ${item.name} (ID: ${item.id}, 状态: ${item.status})\n`;
            });
            if (missingInRp.length > 5) {
                message += `... 还有 ${missingInRp.length - 5} 条\n`;
            }
            message += `\n`;
        }
        
        message += `建议：点击"强制同步数据"按钮进行数据同步。`;
        
        alert(message);
        
        return {
            totalApps: applications.length,
            totalRp: rpData.length,
            missingCount: missingInRp.length,
            mismatchCount: statusMismatch.length,
            missingRecords: missingInRp,
            mismatchRecords: statusMismatch
        };
        
    } catch (error) {
        console.error('数据对比诊断失败:', error);
        alert('诊断失败: ' + error.message);
        return null;
    }
}

/**
 * 处理数据质量检查
 */
async function handleDataQualityCheck() {
    // 【优化】确保组件已初始化
    if (!dataQualityChecker) {
        dataQualityChecker = new DataQualityChecker(dataManager);
    }
    await dataQualityChecker.showReportModal();
}

/**
 * 手动添加记录
 */
async function addManualRecord(data) {
    const result = await dataManager.addRecord(data);
    if (result.success) {
        // 【优化】使用轻量级刷新
        await loadDataWithoutSync();
        return true;
    } else {
        alert('添加失败: ' + result.error);
        return false;
    }
}

/**
 * 编辑记录
 */
async function editRecord(id, data) {
    const result = await dataManager.updateRecord(id, data);
    if (result.success) {
        // 【优化】使用轻量级刷新
        await loadDataWithoutSync();
        return true;
    } else {
        alert('更新失败: ' + result.error);
        return false;
    }
}

/**
 * 删除记录
 */
async function deleteRecord(id) {
    if (!confirm('确定要删除这条记录吗？此操作不可恢复。')) {
        return false;
    }
    
    const result = await dataManager.deleteRecord(id);
    if (result.success) {
        // 【优化】使用轻量级刷新
        await loadDataWithoutSync();
        return true;
    } else {
        alert('删除失败: ' + result.error);
        return false;
    }
}

/**
 * 更新批量删除按钮显示状态
 */
function updateBatchDeleteButton(selectedIds) {
    const btnBatchDelete = document.getElementById('btnBatchDelete');
    if (selectedIds && selectedIds.length > 0) {
        btnBatchDelete.style.display = 'inline-block';
        btnBatchDelete.textContent = `🗑️ 批量删除 (${selectedIds.length})`;
    } else {
        btnBatchDelete.style.display = 'none';
    }
}

/**
 * 处理批量删除
 */
async function handleBatchDelete() {
    const selectedIds = table.getSelectedIds();
    
    if (!selectedIds || selectedIds.length === 0) {
        alert('请先选择要删除的记录');
        return;
    }
    
    if (!confirm(`确定要删除选中的 ${selectedIds.length} 条记录吗？\n\n此操作不可恢复，请谨慎操作！`)) {
        return;
    }
    
    showLoading();
    
    const result = await dataManager.batchDeleteRecords(selectedIds);
    
    if (result.success) {
        alert(`删除成功：${result.deletedCount} 条记录`);
        table.clearSelection();
        updateBatchDeleteButton([]);
        // 【优化】使用轻量级刷新
        await loadDataWithoutSync();
    } else {
        alert('删除失败: ' + result.error);
    }
    
    hideLoading();
}

/**
 * 批量操作
 */
async function batchProcess(action, ids) {
    if (!ids || ids.length === 0) {
        alert('请先选择记录');
        return;
    }
    
    if (!confirm(`确定要对选中的 ${ids.length} 条记录执行此操作吗？`)) {
        return;
    }
    
    // 批量操作实现
    const results = await Promise.all(
        ids.map(id => dataManager.updateRecord(id, { batch_action: action }))
    );
    
    const successCount = results.filter(r => r.success).length;
    alert(`操作完成：成功 ${successCount} 条，失败 ${ids.length - successCount} 条`);
    
    // 【优化】使用轻量级刷新
    await loadDataWithoutSync();
}

/**
 * 刷新数据（轻量版）
 */
async function refreshData() {
    // 【优化】使用轻量级刷新，避免同步操作导致的延迟
    await loadDataWithoutSync();
}

/**
 * 获取当前筛选条件
 */
function getCurrentFilters() {
    return dataManager.getCurrentFilters();
}

/**
 * 设置每页显示数量
 */
function setPageSize(size) {
    dataManager.setPageSize(size);
    renderTable();
    updatePagination();
}

// 暴露全局函数供HTML调用
window.goToPage = goToPage;
window.showDetail = showDetail;
window.handleProcess = handleProcess;
window.handleExport = handleExport;
window.handlePrint = handlePrint;
window.resetFilters = resetFilters;
window.applyFilters = applyFilters;
window.refreshData = refreshData;