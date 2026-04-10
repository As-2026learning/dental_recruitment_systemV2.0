/**
 * 数据质量检查工具
 * 用于诊断和报告数据缺失问题
 */

class DataQualityChecker {
    constructor(dataManager) {
        this.dataManager = dataManager;
        this.essentialFields = [
            { field: 'id_card', label: '身份证号', required: true },
            { field: 'experience', label: '工作经验', required: false },
            { field: 'skills', label: '技能', required: false },
            { field: 'work_experience', label: '工作经历', required: false },
            { field: 'job_type', label: '工种', required: true }
        ];
    }

    /**
     * 检查数据质量
     */
    async checkDataQuality() {
        const data = this.dataManager.getAllData ? this.dataManager.getAllData() : 
                     (this.dataManager.allData || []);
        
        if (!data || data.length === 0) {
            return {
                success: false,
                message: '没有数据可检查'
            };
        }

        const report = {
            totalRecords: data.length,
            fieldStats: {},
            missingDataRecords: [],
            recommendations: []
        };

        // 初始化字段统计
        this.essentialFields.forEach(field => {
            report.fieldStats[field.field] = {
                label: field.label,
                present: 0,
                missing: 0,
                missingRate: 0
            };
        });

        // 检查每条记录
        data.forEach(record => {
            const missingFields = [];
            
            this.essentialFields.forEach(field => {
                const value = record[field.field];
                const hasValue = value !== null && value !== undefined && value !== '' && 
                                !(Array.isArray(value) && value.length === 0);
                
                if (hasValue) {
                    report.fieldStats[field.field].present++;
                } else {
                    report.fieldStats[field.field].missing++;
                    missingFields.push(field.label);
                }
            });

            // 记录有缺失数据的候选人
            if (missingFields.length > 0) {
                report.missingDataRecords.push({
                    id: record.id,
                    name: record.name,
                    phone: record.phone,
                    missingFields: missingFields
                });
            }
        });

        // 计算缺失率
        this.essentialFields.forEach(field => {
            const stats = report.fieldStats[field.field];
            stats.missingRate = ((stats.missing / report.totalRecords) * 100).toFixed(2) + '%';
        });

        // 生成建议
        this.generateRecommendations(report);

        return {
            success: true,
            report: report
        };
    }

    /**
     * 生成改进建议
     */
    generateRecommendations(report) {
        const recommendations = [];

        // 检查各字段缺失情况
        Object.entries(report.fieldStats).forEach(([field, stats]) => {
            if (stats.missing > 0) {
                const missingRate = parseFloat(stats.missingRate);
                if (missingRate > 50) {
                    recommendations.push({
                        priority: 'high',
                        field: stats.label,
                        message: `${stats.label}缺失率高达 ${stats.missingRate}，建议检查数据同步逻辑或补充数据源`
                    });
                } else if (missingRate > 20) {
                    recommendations.push({
                        priority: 'medium',
                        field: stats.label,
                        message: `${stats.label}缺失率为 ${stats.missingRate}，建议优化数据同步流程`
                    });
                }
            }
        });

        // 如果有大量记录缺失数据
        if (report.missingDataRecords.length > report.totalRecords * 0.5) {
            recommendations.push({
                priority: 'high',
                field: '整体',
                message: `超过50%的记录存在数据缺失，建议执行强制数据同步或检查源数据完整性`
            });
        }

        report.recommendations = recommendations;
    }

    /**
     * 生成数据质量报告
     */
    generateReportHTML(report) {
        if (!report) return '<p>暂无数据质量报告</p>';

        let html = `
            <div class="data-quality-report">
                <h3>数据质量诊断报告</h3>
                <div class="summary">
                    <p><strong>总记录数：</strong>${report.totalRecords}</p>
                    <p><strong>存在缺失数据的记录：</strong>${report.missingDataRecords.length} (${((report.missingDataRecords.length / report.totalRecords) * 100).toFixed(2)}%)</p>
                </div>
                
                <h4>字段完整性统计</h4>
                <table class="quality-table">
                    <thead>
                        <tr>
                            <th>字段</th>
                            <th>有值</th>
                            <th>缺失</th>
                            <th>缺失率</th>
                            <th>状态</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        Object.entries(report.fieldStats).forEach(([field, stats]) => {
            const missingRate = parseFloat(stats.missingRate);
            let statusClass = 'good';
            let statusText = '良好';
            
            if (missingRate > 50) {
                statusClass = 'critical';
                statusText = '严重';
            } else if (missingRate > 20) {
                statusClass = 'warning';
                statusText = '警告';
            }

            html += `
                <tr>
                    <td>${stats.label}</td>
                    <td>${stats.present}</td>
                    <td>${stats.missing}</td>
                    <td>${stats.missingRate}</td>
                    <td class="${statusClass}">${statusText}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
        `;

        if (report.recommendations.length > 0) {
            html += `
                <h4>改进建议</h4>
                <ul class="recommendations">
            `;
            
            report.recommendations.forEach(rec => {
                const priorityClass = rec.priority === 'high' ? 'critical' : 'warning';
                html += `<li class="${priorityClass}">[${rec.priority === 'high' ? '高' : '中'}优先级] ${rec.message}</li>`;
            });
            
            html += `</ul>`;
        }

        if (report.missingDataRecords.length > 0) {
            html += `
                <h4>缺失数据详情（前10条）</h4>
                <table class="missing-data-table">
                    <thead>
                        <tr>
                            <th>姓名</th>
                            <th>电话</th>
                            <th>缺失字段</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            report.missingDataRecords.slice(0, 10).forEach(record => {
                html += `
                    <tr>
                        <td>${record.name}</td>
                        <td>${record.phone}</td>
                        <td>${record.missingFields.join(', ')}</td>
                    </tr>
                `;
            });
            
            html += `
                    </tbody>
                </table>
            `;
        }

        html += `</div>`;
        return html;
    }

    /**
     * 显示数据质量报告弹窗
     */
    async showReportModal() {
        const result = await this.checkDataQuality();
        
        if (!result.success) {
            alert(result.message);
            return;
        }

        const html = this.generateReportHTML(result.report);
        
        // 创建弹窗
        const modal = document.createElement('div');
        modal.className = 'modal data-quality-modal';
        modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-container" style="max-width: 800px; max-height: 80vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3>数据质量诊断</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    ${html}
                </div>
                <div class="modal-footer">
                    <button class="btn-close">关闭</button>
                </div>
            </div>
        `;

        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            .data-quality-report h3 { margin-bottom: 15px; color: #333; }
            .data-quality-report h4 { margin: 20px 0 10px; color: #555; }
            .data-quality-report .summary { background: #f5f5f5; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
            .quality-table, .missing-data-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            .quality-table th, .quality-table td, .missing-data-table th, .missing-data-table td { 
                border: 1px solid #ddd; padding: 8px; text-align: left; 
            }
            .quality-table th { background: #f2f2f2; }
            .quality-table .good { color: #52c41a; font-weight: bold; }
            .quality-table .warning { color: #faad14; font-weight: bold; }
            .quality-table .critical { color: #f5222d; font-weight: bold; }
            .recommendations { list-style: none; padding: 0; }
            .recommendations li { padding: 8px; margin: 5px 0; border-radius: 4px; }
            .recommendations .warning { background: #fff7e6; border-left: 3px solid #faad14; }
            .recommendations .critical { background: #fff2f0; border-left: 3px solid #f5222d; }
        `;
        document.head.appendChild(style);

        document.body.appendChild(modal);

        // 绑定事件
        modal.querySelector('.modal-overlay').addEventListener('click', () => modal.remove());
        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('.btn-close').addEventListener('click', () => modal.remove());

        modal.style.display = 'flex';
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataQualityChecker;
}
