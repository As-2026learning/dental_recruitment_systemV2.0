/**
 * 面试日期同步服务
 * 负责在招聘流程管理、应聘信息综合管理、预约管理三个模块之间同步面试日期数据
 */
class InterviewDateSyncService {
    constructor(supabaseClient) {
        this.client = supabaseClient;
        this.syncLog = [];
        this.maxLogEntries = 100;
    }

    /**
     * 记录同步日志
     */
    logSync(operation, source, target, data, success, error = null) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            operation,
            source,
            target,
            data,
            success,
            error: error ? error.message : null
        };
        
        this.syncLog.unshift(logEntry);
        
        // 限制日志条目数量
        if (this.syncLog.length > this.maxLogEntries) {
            this.syncLog.pop();
        }
        
        // 控制台输出
        if (success) {
            console.log(`[面试日期同步] ${operation}: ${source} -> ${target}`, data);
        } else {
            console.error(`[面试日期同步失败] ${operation}: ${source} -> ${target}`, error);
        }
        
        return logEntry;
    }

    /**
     * 获取面试日期 - 从bookings表查询
     */
    async getInterviewDateFromBookings(applicationId) {
        try {
            const { data, error } = await this.client
                .from('bookings')
                .select('booking_date, time_slot, status, updated_at')
                .eq('application_id', applicationId)
                .neq('status', 'cancelled')
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;
            
            if (data && data.length > 0) {
                return {
                    interviewDate: data[0].booking_date,
                    timeSlot: data[0].time_slot,
                    status: data[0].status,
                    source: 'bookings',
                    updatedAt: data[0].updated_at
                };
            }
            
            return null;
        } catch (error) {
            console.error('从bookings获取面试日期失败:', error);
            return null;
        }
    }

    /**
     * 同步面试日期到recruitment_process表
     */
    async syncToRecruitmentProcess(applicationId, interviewDate, timeSlot = null) {
        try {
            // 先查询是否已存在记录
            const { data: existing, error: queryError } = await this.client
                .from('recruitment_process')
                .select('id, interview_date, interview_time_slot')
                .eq('application_id', applicationId)
                .single();

            if (queryError && queryError.code !== 'PGRST116') {
                throw queryError;
            }

            const updateData = {
                interview_date: interviewDate,
                interview_time_slot: timeSlot,
                updated_at: new Date().toISOString()
            };

            let result;
            if (existing) {
                // 更新现有记录
                result = await this.client
                    .from('recruitment_process')
                    .update(updateData)
                    .eq('id', existing.id);
            } else {
                // 插入新记录
                updateData.application_id = applicationId;
                updateData.created_at = new Date().toISOString();
                result = await this.client
                    .from('recruitment_process')
                    .insert([updateData]);
            }

            if (result.error) throw result.error;

            this.logSync('sync', 'bookings', 'recruitment_process', 
                { applicationId, interviewDate, timeSlot }, true);
            
            return { success: true, message: '同步到招聘流程表成功' };
        } catch (error) {
            this.logSync('sync', 'bookings', 'recruitment_process', 
                { applicationId, interviewDate, timeSlot }, false, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 同步面试日期到applications表
     */
    async syncToApplications(applicationId, interviewDate, timeSlot = null) {
        try {
            const updateData = {
                interview_date: interviewDate,
                interview_time_slot: timeSlot,
                updated_at: new Date().toISOString()
            };

            const { error } = await this.client
                .from('applications')
                .update(updateData)
                .eq('id', applicationId);

            if (error) throw error;

            this.logSync('sync', 'bookings', 'applications', 
                { applicationId, interviewDate, timeSlot }, true);
            
            return { success: true, message: '同步到应聘信息表成功' };
        } catch (error) {
            this.logSync('sync', 'bookings', 'applications', 
                { applicationId, interviewDate, timeSlot }, false, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 全量同步 - 从bookings表同步到所有相关表
     */
    async fullSync() {
        const results = {
            total: 0,
            success: 0,
            failed: 0,
            errors: []
        };

        try {
            // 获取所有有效的预约记录
            const { data: bookings, error } = await this.client
                .from('bookings')
                .select('application_id, booking_date, time_slot, status')
                .neq('status', 'cancelled')
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (!bookings || bookings.length === 0) {
                return { success: true, message: '没有需要同步的预约数据', results };
            }

            results.total = bookings.length;

            // 去重 - 只保留每个application_id最新的记录
            const uniqueBookings = [];
            const seenAppIds = new Set();
            
            for (const booking of bookings) {
                if (!seenAppIds.has(booking.application_id)) {
                    uniqueBookings.push(booking);
                    seenAppIds.add(booking.application_id);
                }
            }

            // 批量同步
            for (const booking of uniqueBookings) {
                const syncResult = await this.syncInterviewDate(
                    booking.application_id,
                    booking.booking_date,
                    booking.time_slot
                );

                if (syncResult.success) {
                    results.success++;
                } else {
                    results.failed++;
                    results.errors.push({
                        applicationId: booking.application_id,
                        error: syncResult.error
                    });
                }
            }

            return {
                success: results.failed === 0,
                message: `全量同步完成: 成功 ${results.success} 条, 失败 ${results.failed} 条`,
                results
            };
        } catch (error) {
            return {
                success: false,
                message: '全量同步失败: ' + error.message,
                results
            };
        }
    }

    /**
     * 同步面试日期到所有相关表
     */
    async syncInterviewDate(applicationId, interviewDate, timeSlot = null) {
        const results = [];

        // 同步到recruitment_process表
        const rpResult = await this.syncToRecruitmentProcess(
            applicationId, interviewDate, timeSlot
        );
        results.push({ table: 'recruitment_process', ...rpResult });

        // 同步到applications表
        const appResult = await this.syncToApplications(
            applicationId, interviewDate, timeSlot
        );
        results.push({ table: 'applications', ...appResult });

        const allSuccess = results.every(r => r.success);
        
        return {
            success: allSuccess,
            message: allSuccess ? '同步成功' : '部分同步失败',
            results
        };
    }

    /**
     * 监听bookings表变化并自动同步
     */
    async subscribeToBookingsChanges(callback) {
        try {
            const subscription = this.client
                .channel('bookings_changes')
                .on('postgres_changes', 
                    { 
                        event: '*', 
                        schema: 'public', 
                        table: 'bookings' 
                    }, 
                    async (payload) => {
                        console.log('bookings表变化:', payload);
                        
                        const { eventType, new: newRecord, old: oldRecord } = payload;
                        
                        // 处理插入和更新事件
                        if (eventType === 'INSERT' || eventType === 'UPDATE') {
                            // 跳过已取消的预约
                            if (newRecord.status === 'cancelled') {
                                console.log('跳过已取消的预约');
                                return;
                            }
                            
                            // 自动同步
                            const syncResult = await this.syncInterviewDate(
                                newRecord.application_id,
                                newRecord.booking_date,
                                newRecord.time_slot
                            );
                            
                            if (callback) {
                                callback({
                                    type: eventType,
                                    applicationId: newRecord.application_id,
                                    interviewDate: newRecord.booking_date,
                                    timeSlot: newRecord.time_slot,
                                    syncResult
                                });
                            }
                        }
                    }
                )
                .subscribe();

            console.log('已订阅bookings表变化');
            return { success: true, subscription };
        } catch (error) {
            console.error('订阅bookings表变化失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 获取同步日志
     */
    getSyncLog(limit = 50) {
        return this.syncLog.slice(0, limit);
    }

    /**
     * 清空同步日志
     */
    clearSyncLog() {
        this.syncLog = [];
        return { success: true, message: '日志已清空' };
    }
}

// 导出服务
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InterviewDateSyncService;
}
