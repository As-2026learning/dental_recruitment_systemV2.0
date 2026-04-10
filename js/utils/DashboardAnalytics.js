/**
 * 招聘流程数据看板 - 核心指标计算模块
 * 提供全流程各环节关键指标的计算、分析和统计功能
 */

class DashboardAnalytics {
    constructor(data) {
        this.rawData = data || [];
        this.metrics = {};
    }

    /**
     * 设置数据源
     * @param {Array} data - 招聘流程数据
     */
    setData(data) {
        this.rawData = data || [];
        this.calculateAllMetrics();
    }

    /**
     * 计算所有指标
     */
    calculateAllMetrics() {
        this.metrics = {
            // 基础统计数据
            basic: this.calculateBasicStats(),
            
            // 各环节转化数据
            funnel: this.calculateFunnelMetrics(),
            
            // 转化率数据
            conversion: this.calculateConversionRates(),
            
            // 淘汰率数据
            rejection: this.calculateRejectionRates(),
            
            // 时间效率数据
            efficiency: this.calculateEfficiencyMetrics(),
            
            // 渠道分析数据
            channel: this.calculateChannelMetrics(),
            
            // 岗位分析数据
            position: this.calculatePositionMetrics(),
            
            // 数据质量评估
            quality: this.assessDataQuality()
        };
        
        return this.metrics;
    }

    /**
     * 计算基础统计数据
     */
    calculateBasicStats() {
        const data = this.rawData;
        
        return {
            // 总人数
            totalApplicants: data.length,
            
            // 各环节人数
            byStage: {
                application: data.filter(d => d.current_stage === 'application').length,
                firstInterview: data.filter(d => d.current_stage === 'first_interview').length,
                secondInterview: data.filter(d => d.current_stage === 'second_interview').length,
                hired: data.filter(d => d.current_stage === 'hired').length,
                onboarded: data.filter(d => d.current_stage === 'onboarded').length
            },
            
            // 各状态人数
            byStatus: {
                pending: data.filter(d => d.current_status === 'pending').length,
                pass: data.filter(d => d.current_status === 'pass').length,
                reject: data.filter(d => d.current_status === 'reject').length
            },
            
            // 关键节点人数
            keyMetrics: {
                // 初试通过人数
                firstInterviewPass: data.filter(d => d.first_interview_result === 'pass').length,
                // 复试通过人数
                secondInterviewPass: data.filter(d => d.second_interview_result === 'pass').length,
                // 接受offer人数
                offerAccepted: data.filter(d => d.accept_offer === 'yes').length,
                // 拒绝offer人数
                offerRejected: data.filter(d => d.accept_offer === 'no').length,
                // 成功入职人数 - 与流程管理页面保持一致：current_stage === 'onboarded'
                onboarded: data.filter(d => d.current_stage === 'onboarded').length,
                // 未报到人数
                notOnboarded: data.filter(d => d.no_report_reason).length
            }
        };
    }

    /**
     * 计算漏斗指标 - 包含完整的过程数据
     */
    calculateFunnelMetrics() {
        const data = this.rawData;
        const total = data.length;
        
        if (total === 0) {
            return { stages: [], detailedStages: [], total: 0 };
        }
        
        // 基础统计
        const firstInterviewTotal = data.filter(d => d.first_interview_result).length;
        const firstInterviewPass = data.filter(d => d.first_interview_result === 'pass').length;
        const firstInterviewReject = data.filter(d => d.first_interview_result === 'reject').length;
        
        const secondInterviewTotal = data.filter(d => d.second_interview_result).length;
        const secondInterviewPass = data.filter(d => d.second_interview_result === 'pass').length;
        const secondInterviewReject = data.filter(d => d.second_interview_result === 'reject').length;
        
        const offerTotal = data.filter(d => d.accept_offer).length;
        const offerAccepted = data.filter(d => d.accept_offer === 'yes').length;
        const offerRejected = data.filter(d => d.accept_offer === 'no').length;
        
        // 【修复】与流程管理页面保持一致：使用 current_stage === 'onboarded' 统计已报到人数
        const onboarded = data.filter(d => d.current_stage === 'onboarded').length;
        const notOnboarded = data.filter(d => d.no_report_reason).length;
        
        // 简化版漏斗（用于展示）
        const stages = [
            {
                name: '简历投递',
                key: 'application',
                count: total,
                rate: 100
            },
            {
                name: '初试通过',
                key: 'first_interview_pass',
                count: firstInterviewPass,
                rate: total > 0 ? (firstInterviewPass / total * 100).toFixed(1) : 0
            },
            {
                name: '复试通过',
                key: 'second_interview_pass',
                count: secondInterviewPass,
                rate: firstInterviewPass > 0 ? (secondInterviewPass / firstInterviewPass * 100).toFixed(1) : 0
            },
            {
                name: '接受Offer',
                key: 'offer_accepted',
                count: offerAccepted,
                rate: secondInterviewPass > 0 ? (offerAccepted / secondInterviewPass * 100).toFixed(1) : 0
            },
            {
                name: '成功入职',
                key: 'onboarded',
                count: onboarded,
                rate: offerAccepted > 0 ? (onboarded / offerAccepted * 100).toFixed(1) : 0
            }
        ];
        
        // 详细版漏斗（包含所有过程数据）
        const detailedStages = [
            {
                stage: '简历投递',
                total: total,
                pass: null,
                reject: null,
                pending: null,
                conversionRate: '100%'
            },
            {
                stage: '初试',
                total: firstInterviewTotal,
                pass: firstInterviewPass,
                reject: firstInterviewReject,
                pending: firstInterviewTotal - firstInterviewPass - firstInterviewReject,
                passRate: firstInterviewTotal > 0 ? (firstInterviewPass / firstInterviewTotal * 100).toFixed(1) + '%' : '0%',
                rejectRate: firstInterviewTotal > 0 ? (firstInterviewReject / firstInterviewTotal * 100).toFixed(1) + '%' : '0%',
                conversionRate: total > 0 ? (firstInterviewTotal / total * 100).toFixed(1) + '%' : '0%'
            },
            {
                stage: '复试',
                total: secondInterviewTotal,
                pass: secondInterviewPass,
                reject: secondInterviewReject,
                pending: secondInterviewTotal - secondInterviewPass - secondInterviewReject,
                passRate: secondInterviewTotal > 0 ? (secondInterviewPass / secondInterviewTotal * 100).toFixed(1) + '%' : '0%',
                rejectRate: secondInterviewTotal > 0 ? (secondInterviewReject / secondInterviewTotal * 100).toFixed(1) + '%' : '0%',
                conversionRate: firstInterviewPass > 0 ? (secondInterviewTotal / firstInterviewPass * 100).toFixed(1) + '%' : '0%'
            },
            {
                stage: '录用',
                total: offerTotal,
                pass: offerAccepted,
                reject: offerRejected,
                pending: offerTotal - offerAccepted - offerRejected,
                passRate: offerTotal > 0 ? (offerAccepted / offerTotal * 100).toFixed(1) + '%' : '0%',
                rejectRate: offerTotal > 0 ? (offerRejected / offerTotal * 100).toFixed(1) + '%' : '0%',
                conversionRate: secondInterviewPass > 0 ? (offerTotal / secondInterviewPass * 100).toFixed(1) + '%' : '0%'
            },
            {
                stage: '报到',
                total: offerAccepted,
                pass: onboarded,
                reject: notOnboarded,
                pending: offerAccepted - onboarded - notOnboarded,
                passRate: offerAccepted > 0 ? (onboarded / offerAccepted * 100).toFixed(1) + '%' : '0%',
                rejectRate: offerAccepted > 0 ? (notOnboarded / offerAccepted * 100).toFixed(1) + '%' : '0%',
                conversionRate: offerAccepted > 0 ? (onboarded / offerAccepted * 100).toFixed(1) + '%' : '0%'
            }
        ];
        
        return { stages, detailedStages, total };
    }

    /**
     * 计算各环节转化率
     */
    calculateConversionRates() {
        const data = this.rawData;
        const metrics = {};
        
        // 初试转化率 = 初试通过人数 / 初试参与人数
        const firstInterviewTotal = data.filter(d => d.first_interview_result).length;
        const firstInterviewPass = data.filter(d => d.first_interview_result === 'pass').length;
        metrics.firstInterview = firstInterviewTotal > 0 
            ? (firstInterviewPass / firstInterviewTotal * 100).toFixed(1) 
            : 0;
        
        // 复试转化率 = 复试通过人数 / 复试参与人数
        const secondInterviewTotal = data.filter(d => d.second_interview_result).length;
        const secondInterviewPass = data.filter(d => d.second_interview_result === 'pass').length;
        metrics.secondInterview = secondInterviewTotal > 0 
            ? (secondInterviewPass / secondInterviewTotal * 100).toFixed(1) 
            : 0;
        
        // Offer接受率 = 接受offer人数 / 发放offer人数
        const offerTotal = data.filter(d => d.accept_offer).length;
        const offerAccepted = data.filter(d => d.accept_offer === 'yes').length;
        metrics.offerAcceptance = offerTotal > 0 
            ? (offerAccepted / offerTotal * 100).toFixed(1) 
            : 0;
        
        // 报到率 = 实际报到人数 / 接受offer人数
        const acceptedOffer = data.filter(d => d.accept_offer === 'yes').length;
        // 【修复】与流程管理页面保持一致：使用 current_stage === 'onboarded' 统计已报到人数
        const onboarded = data.filter(d => d.current_stage === 'onboarded').length;
        metrics.onboard = acceptedOffer > 0 
            ? (onboarded / acceptedOffer * 100).toFixed(1) 
            : 0;
        
        // 整体转化率 = 成功入职人数 / 总应聘人数
        const total = data.length;
        // 【修复】重新计算已报到人数，确保使用 current_stage === 'onboarded'
        const overallOnboarded = data.filter(d => d.current_stage === 'onboarded').length;
        metrics.overall = total > 0 
            ? (overallOnboarded / total * 100).toFixed(1) 
            : 0;
        
        return metrics;
    }

    /**
     * 计算各环节淘汰率
     */
    calculateRejectionRates() {
        const data = this.rawData;
        const metrics = {};
        
        // 初试淘汰率
        const firstInterviewTotal = data.filter(d => d.first_interview_result).length;
        const firstInterviewReject = data.filter(d => d.first_interview_result === 'reject').length;
        metrics.firstInterview = firstInterviewTotal > 0 
            ? (firstInterviewReject / firstInterviewTotal * 100).toFixed(1) 
            : 0;
        
        // 复试淘汰率
        const secondInterviewTotal = data.filter(d => d.second_interview_result).length;
        const secondInterviewReject = data.filter(d => d.second_interview_result === 'reject').length;
        metrics.secondInterview = secondInterviewTotal > 0 
            ? (secondInterviewReject / secondInterviewTotal * 100).toFixed(1) 
            : 0;
        
        // Offer拒绝率
        const offerTotal = data.filter(d => d.accept_offer).length;
        const offerRejected = data.filter(d => d.accept_offer === 'no').length;
        metrics.offer = offerTotal > 0 
            ? (offerRejected / offerTotal * 100).toFixed(1) 
            : 0;
        
        // 未报到率
        const acceptedOffer = data.filter(d => d.accept_offer === 'yes').length;
        const notOnboarded = data.filter(d => d.no_report_reason).length;
        metrics.notOnboarded = acceptedOffer > 0 
            ? (notOnboarded / acceptedOffer * 100).toFixed(1) 
            : 0;
        
        // 整体淘汰率
        const total = data.length;
        const rejected = data.filter(d => 
            d.current_status === 'reject' || 
            d.accept_offer === 'no' || 
            d.no_report_reason
        ).length;
        metrics.overall = total > 0 
            ? (rejected / total * 100).toFixed(1) 
            : 0;
        
        return metrics;
    }

    /**
     * 计算效率指标
     */
    calculateEfficiencyMetrics() {
        const data = this.rawData;
        
        // 计算平均招聘周期 - 与流程管理页面保持一致：current_stage === 'onboarded'
        const completedRecords = data.filter(d => d.current_stage === 'onboarded' && d.created_at);
        
        let avgDays = 0;
        if (completedRecords.length > 0) {
            const totalDays = completedRecords.reduce((sum, d) => {
                const start = new Date(d.created_at);
                const end = d.report_date ? new Date(d.report_date) : new Date();
                const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                return sum + days;
            }, 0);
            avgDays = (totalDays / completedRecords.length).toFixed(1);
        }
        
        // 各环节平均耗时
        const stageDurations = {
            application: this.calculateStageDuration('application', 'first_interview'),
            firstInterview: this.calculateStageDuration('first_interview', 'second_interview'),
            secondInterview: this.calculateStageDuration('second_interview', 'hired'),
            hiring: this.calculateStageDuration('hired', 'onboarded')
        };
        
        return {
            avgDays,
            stageDurations,
            completedCount: completedRecords.length
        };
    }

    /**
     * 计算特定环节的平均耗时
     */
    calculateStageDuration(fromStage, toStage) {
        // 这里需要根据实际数据结构调整计算逻辑
        // 简化处理，返回平均值
        return 0;
    }

    /**
     * 计算渠道分析指标 - 包含各阶段详细数据
     */
    calculateChannelMetrics() {
        const data = this.rawData;
        const channels = {};
        
        data.forEach(d => {
            const channel = d.source_channel || '未知渠道';
            if (!channels[channel]) {
                channels[channel] = {
                    name: channel,
                    // 各环节人数统计
                    total: 0,                    // 简历投递
                    firstInterview: 0,           // 初试参与
                    firstInterviewPass: 0,       // 初试通过
                    firstInterviewReject: 0,     // 初试淘汰
                    secondInterview: 0,          // 复试参与
                    secondInterviewPass: 0,      // 复试通过
                    secondInterviewReject: 0,    // 复试淘汰
                    offer: 0,                    // 发放offer
                    offerAccepted: 0,            // 接受offer
                    offerRejected: 0,            // 拒绝offer
                    onboarded: 0,                // 成功入职
                    notOnboarded: 0,             // 未报到
                    
                    // 转化率
                    firstInterviewRate: 0,       // 初试参与率
                    firstPassRate: 0,            // 初试通过率
                    secondInterviewRate: 0,      // 复试参与率
                    secondPassRate: 0,           // 复试通过率
                    offerRate: 0,                // offer发放率
                    offerAcceptRate: 0,          // offer接受率
                    onboardRate: 0,              // 报到率
                    overallConversion: 0         // 整体转化率
                };
            }
            
            channels[channel].total++;
            
            // 初试环节
            if (d.first_interview_result) {
                channels[channel].firstInterview++;
                if (d.first_interview_result === 'pass') {
                    channels[channel].firstInterviewPass++;
                } else if (d.first_interview_result === 'reject') {
                    channels[channel].firstInterviewReject++;
                }
            }
            
            // 复试环节
            if (d.second_interview_result) {
                channels[channel].secondInterview++;
                if (d.second_interview_result === 'pass') {
                    channels[channel].secondInterviewPass++;
                } else if (d.second_interview_result === 'reject') {
                    channels[channel].secondInterviewReject++;
                }
            }
            
            // 录用环节
            if (d.accept_offer) {
                channels[channel].offer++;
                if (d.accept_offer === 'yes') {
                    channels[channel].offerAccepted++;
                } else if (d.accept_offer === 'no') {
                    channels[channel].offerRejected++;
                }
            }
            
            // 报到环节 - 与流程管理页面保持一致：current_stage === 'onboarded'
            if (d.current_stage === 'onboarded') {
                channels[channel].onboarded++;
            }
            if (d.no_report_reason) {
                channels[channel].notOnboarded++;
            }
        });
        
        // 计算各渠道的转化率
        Object.values(channels).forEach(ch => {
            ch.firstInterviewRate = ch.total > 0 
                ? (ch.firstInterview / ch.total * 100).toFixed(1) : 0;
            ch.firstPassRate = ch.firstInterview > 0 
                ? (ch.firstInterviewPass / ch.firstInterview * 100).toFixed(1) : 0;
            ch.secondInterviewRate = ch.firstInterviewPass > 0 
                ? (ch.secondInterview / ch.firstInterviewPass * 100).toFixed(1) : 0;
            ch.secondPassRate = ch.secondInterview > 0 
                ? (ch.secondInterviewPass / ch.secondInterview * 100).toFixed(1) : 0;
            ch.offerRate = ch.secondInterviewPass > 0 
                ? (ch.offer / ch.secondInterviewPass * 100).toFixed(1) : 0;
            ch.offerAcceptRate = ch.offer > 0 
                ? (ch.offerAccepted / ch.offer * 100).toFixed(1) : 0;
            ch.onboardRate = ch.offerAccepted > 0 
                ? (ch.onboarded / ch.offerAccepted * 100).toFixed(1) : 0;
            ch.overallConversion = ch.total > 0 
                ? (ch.onboarded / ch.total * 100).toFixed(1) : 0;
        });
        
        // 按入职人数排序
        return Object.values(channels).sort((a, b) => b.onboarded - a.onboarded);
    }

    /**
     * 计算岗位分析指标
     */
    calculatePositionMetrics() {
        const data = this.rawData;
        const positions = {};
        
        data.forEach(d => {
            const position = d.position || '未知岗位';
            if (!positions[position]) {
                positions[position] = {
                    name: position,
                    total: 0,
                    firstPass: 0,
                    secondPass: 0,
                    offerAccepted: 0,
                    onboarded: 0
                };
            }
            positions[position].total++;
            
            if (d.first_interview_result === 'pass') {
                positions[position].firstPass++;
            }
            if (d.second_interview_result === 'pass') {
                positions[position].secondPass++;
            }
            if (d.accept_offer === 'yes') {
                positions[position].offerAccepted++;
            }
            // 与流程管理页面保持一致：current_stage === 'onboarded'
            if (d.current_stage === 'onboarded') {
                positions[position].onboarded++;
            }
        });
        
        // 计算各岗位的转化率
        Object.values(positions).forEach(pos => {
            pos.conversionRate = pos.total > 0 
                ? (pos.onboarded / pos.total * 100).toFixed(1) 
                : 0;
        });
        
        // 按入职人数排序
        return Object.values(positions).sort((a, b) => b.onboarded - a.onboarded);
    }

    /**
     * 评估数据质量
     */
    assessDataQuality() {
        const data = this.rawData;
        const issues = [];
        
        // 检查必填字段缺失
        data.forEach((d, index) => {
            if (!d.name) {
                issues.push({ type: 'missing_name', index, id: d.id, message: '姓名为空' });
            }
            if (!d.phone) {
                issues.push({ type: 'missing_phone', index, id: d.id, message: '电话为空' });
            }
            if (!d.position) {
                issues.push({ type: 'missing_position', index, id: d.id, message: '岗位为空' });
            }
        });
        
        // 检查数据逻辑一致性
        data.forEach((d, index) => {
            // 后续环节数据不得大于前置环节数据
            if (d.second_interview_result && !d.first_interview_result) {
                issues.push({ 
                    type: 'logic_error', 
                    index, 
                    id: d.id, 
                    message: '有复试结果但无初试结果' 
                });
            }
            if (d.accept_offer && !d.second_interview_result) {
                issues.push({ 
                    type: 'logic_error', 
                    index, 
                    id: d.id, 
                    message: '有offer状态但无复试结果' 
                });
            }
            if (d.is_reported && d.accept_offer !== 'yes') {
                issues.push({ 
                    type: 'logic_error', 
                    index, 
                    id: d.id, 
                    message: '已报到但未接受offer' 
                });
            }
        });
        
        // 检查数据完整性
        const completeness = {
            total: data.length,
            withName: data.filter(d => d.name).length,
            withPhone: data.filter(d => d.phone).length,
            withPosition: data.filter(d => d.position).length,
            withStage: data.filter(d => d.current_stage).length,
            withStatus: data.filter(d => d.current_status).length
        };
        
        return {
            issues,
            issueCount: issues.length,
            completeness,
            completenessRate: data.length > 0 
                ? ((completeness.withName / data.length) * 100).toFixed(1) 
                : 0
        };
    }

    /**
     * 获取趋势数据（按日期分组）
     */
    getTrendData(days = 30) {
        const data = this.rawData;
        const trend = {};
        
        // 生成日期范围
        const dates = [];
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            dates.push(date.toISOString().split('T')[0]);
        }
        
        // 初始化每天的数据
        dates.forEach(date => {
            trend[date] = {
                date,
                newApplicants: 0,
                firstPass: 0,
                secondPass: 0,
                offerAccepted: 0,
                onboarded: 0
            };
        });
        
        // 统计每天的数据
        data.forEach(d => {
            const date = d.created_at ? d.created_at.split('T')[0] : null;
            if (date && trend[date]) {
                trend[date].newApplicants++;
            }
            
            const firstPassDate = d.first_interview_time ? d.first_interview_time.split('T')[0] : null;
            if (firstPassDate && trend[firstPassDate] && d.first_interview_result === 'pass') {
                trend[firstPassDate].firstPass++;
            }
            
            const onboardDate = d.report_date ? d.report_date.split('T')[0] : null;
            if (onboardDate && trend[onboardDate] && d.is_reported === 'yes') {
                trend[onboardDate].onboarded++;
            }
        });
        
        return Object.values(trend);
    }

    /**
     * 获取所有指标
     */
    getMetrics() {
        return this.metrics;
    }

    /**
     * 导出数据为Excel格式
     */
    exportToExcel() {
        const data = this.rawData;
        
        // 准备导出数据
        const exportData = data.map(d => ({
            '姓名': d.name,
            '电话': d.phone,
            '岗位': d.position,
            '工种': d.job_type,
            '当前环节': this.getStageText(d.current_stage),
            '状态': this.getStatusText(d.current_status),
            '初试结果': this.getResultText(d.first_interview_result),
            '复试结果': this.getResultText(d.second_interview_result),
            'Offer状态': this.getOfferText(d.accept_offer),
            '报到状态': this.getOnboardText(d.is_reported),
            '创建时间': d.created_at ? new Date(d.created_at).toLocaleString('zh-CN') : '-'
        }));
        
        return exportData;
    }

    /**
     * 获取环节文本
     */
    getStageText(stage) {
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
    getStatusText(status) {
        const statusMap = {
            'pending': '待处理',
            'pass': '通过',
            'reject': '不通过'
        };
        return statusMap[status] || status || '-';
    }

    /**
     * 获取结果文本
     */
    getResultText(result) {
        const resultMap = {
            'pass': '通过',
            'reject': '不通过',
            'pending': '待处理'
        };
        return resultMap[result] || result || '-';
    }

    /**
     * 获取Offer文本
     */
    getOfferText(offer) {
        const offerMap = {
            'yes': '已接受',
            'no': '已拒绝'
        };
        return offerMap[offer] || '待确认';
    }

    /**
     * 获取报到文本
     */
    getOnboardText(onboard) {
        const onboardMap = {
            'yes': '已报到',
            'no': '未报到'
        };
        return onboardMap[onboard] || '待报到';
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DashboardAnalytics;
}
