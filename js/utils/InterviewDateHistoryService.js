/**
 * 面试日期变更历史记录服务
 * 用于追踪面试安排的调整情况
 */
class InterviewDateHistoryService {
    constructor(supabaseClient) {
        this.client = supabaseClient;
        this.tableName = 'interview_date_history';
    }

    /**
     * 记录面试日期变更
     */
    async recordChange(data) {
        try {
            const historyRecord = {
                application_id: data.applicationId,
                candidate_name: data.candidateName,
                candidate_phone: data.candidatePhone,
                old_date: data.oldDate,
                old_time_slot: data.oldTimeSlot,
                new_date: data.newDate,
                new_time_slot: data.newTimeSlot,
                change_reason: data.changeReason || '',
                changed_by: data.changedBy || 'system',
                change_type: data.changeType || 'update', // create, update, cancel
                created_at: new Date().toISOString()
            };

            const { error } = await this.client
                .from(this.tableName)
                .insert([historyRecord]);

            if (error) throw error;

            console.log('[面试日期历史] 记录变更:', historyRecord);
            return { success: true, message: '变更记录已保存' };
        } catch (error) {
            console.error('记录面试日期变更失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 获取候选人的面试日期变更历史
     */
    async getHistoryByApplicationId(applicationId, limit = 50) {
        try {
            const { data, error } = await this.client
                .from(this.tableName)
                .select('*')
                .eq('application_id', applicationId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;

            return { success: true, data: data || [] };
        } catch (error) {
            console.error('获取面试日期历史失败:', error);
            return { success: false, error: error.message, data: [] };
        }
    }

    /**
     * 获取所有面试日期变更历史（带筛选）
     */
    async getAllHistory(filters = {}, limit = 100) {
        try {
            let query = this.client
                .from(this.tableName)
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            // 应用筛选条件
            if (filters.applicationId) {
                query = query.eq('application_id', filters.applicationId);
            }
            if (filters.candidateName) {
                query = query.ilike('candidate_name', `%${filters.candidateName}%`);
            }
            if (filters.changeType) {
                query = query.eq('change_type', filters.changeType);
            }
            if (filters.startDate) {
                query = query.gte('created_at', filters.startDate);
            }
            if (filters.endDate) {
                query = query.lte('created_at', filters.endDate);
            }

            const { data, error } = await query;

            if (error) throw error;

            return { success: true, data: data || [] };
        } catch (error) {
            console.error('获取面试日期历史失败:', error);
            return { success: false, error: error.message, data: [] };
        }
    }

    /**
     * 获取面试日期变更统计
     */
    async getChangeStatistics(days = 30) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const { data, error } = await this.client
                .from(this.tableName)
                .select('change_type, created_at')
                .gte('created_at', startDate.toISOString());

            if (error) throw error;

            const stats = {
                total: data.length,
                create: 0,
                update: 0,
                cancel: 0,
                byDay: {}
            };

            data.forEach(record => {
                // 按类型统计
                if (stats[record.change_type] !== undefined) {
                    stats[record.change_type]++;
                }

                // 按天统计
                const day = record.created_at.split('T')[0];
                if (!stats.byDay[day]) {
                    stats.byDay[day] = 0;
                }
                stats.byDay[day]++;
            });

            return { success: true, stats };
        } catch (error) {
            console.error('获取变更统计失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 生成变更历史报告HTML
     */
    generateHistoryHTML(historyData) {
        if (!historyData || historyData.length === 0) {
            return '<div class="no-data">暂无变更记录</div>';
        }

        const getChangeTypeLabel = (type) => {
            const labels = {
                'create': '新建预约',
                'update': '修改预约',
                'cancel': '取消预约'
            };
            return labels[type] || type;
        };

        const getChangeTypeClass = (type) => {
            const classes = {
                'create': 'type-create',
                'update': 'type-update',
                'cancel': 'type-cancel'
            };
            return classes[type] || '';
        };

        let html = `
            <div class="interview-history">
                <h4>面试日期变更历史</h4>
                <div class="history-list">
        `;

        historyData.forEach(record => {
            const changeDate = new Date(record.created_at).toLocaleString('zh-CN');
            const oldDateTime = record.old_date 
                ? `${record.old_date} ${record.old_time_slot || ''}` 
                : '无';
            const newDateTime = record.new_date 
                ? `${record.new_date} ${record.new_time_slot || ''}` 
                : '无';

            html += `
                <div class="history-item ${getChangeTypeClass(record.change_type)}">
                    <div class="history-header">
                        <span class="change-type">${getChangeTypeLabel(record.change_type)}</span>
                        <span class="change-time">${changeDate}</span>
                    </div>
                    <div class="history-content">
                        <div class="change-detail">
                            <span class="label">从:</span>
                            <span class="old-value">${oldDateTime}</span>
                        </div>
                        <div class="change-detail">
                            <span class="label">到:</span>
                            <span class="new-value">${newDateTime}</span>
                        </div>
                        ${record.change_reason ? `
                            <div class="change-reason">
                                <span class="label">原因:</span>
                                <span>${record.change_reason}</span>
                            </div>
                        ` : ''}
                        <div class="change-operator">
                            <span class="label">操作人:</span>
                            <span>${record.changed_by}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
            <style>
                .interview-history {
                    padding: 16px;
                }
                .interview-history h4 {
                    margin: 0 0 16px 0;
                    color: #262626;
                    font-size: 16px;
                }
                .history-list {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .history-item {
                    padding: 12px;
                    border-radius: 8px;
                    background: #f5f5f5;
                    border-left: 4px solid #d9d9d9;
                }
                .history-item.type-create {
                    background: #f6ffed;
                    border-left-color: #52c41a;
                }
                .history-item.type-update {
                    background: #e6f7ff;
                    border-left-color: #1890ff;
                }
                .history-item.type-cancel {
                    background: #fff1f0;
                    border-left-color: #ff4d4f;
                }
                .history-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }
                .change-type {
                    font-weight: 600;
                    font-size: 13px;
                }
                .type-create .change-type { color: #52c41a; }
                .type-update .change-type { color: #1890ff; }
                .type-cancel .change-type { color: #ff4d4f; }
                .change-time {
                    font-size: 12px;
                    color: #8c8c8c;
                }
                .history-content {
                    font-size: 13px;
                }
                .change-detail {
                    margin-bottom: 4px;
                }
                .change-detail .label {
                    color: #8c8c8c;
                    margin-right: 8px;
                }
                .old-value {
                    color: #ff4d4f;
                    text-decoration: line-through;
                }
                .new-value {
                    color: #52c41a;
                    font-weight: 500;
                }
                .change-reason, .change-operator {
                    margin-top: 8px;
                    padding-top: 8px;
                    border-top: 1px dashed #d9d9d9;
                }
                .no-data {
                    text-align: center;
                    padding: 40px;
                    color: #8c8c8c;
                }
            </style>
        `;

        return html;
    }

    /**
     * 清理历史记录（保留最近N天的记录）
     */
    async cleanupOldHistory(keepDays = 90) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - keepDays);

            const { error } = await this.client
                .from(this.tableName)
                .delete()
                .lt('created_at', cutoffDate.toISOString());

            if (error) throw error;

            return { success: true, message: `已清理 ${keepDays} 天前的历史记录` };
        } catch (error) {
            console.error('清理历史记录失败:', error);
            return { success: false, error: error.message };
        }
    }
}

// 导出服务
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InterviewDateHistoryService;
}
