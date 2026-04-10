/**
 * 招聘流程管理模块 - 详情弹窗组件
 * 用于展示候选人完整信息
 */

class DetailModal {
    constructor(modalId = 'detailModal') {
        this.modal = document.getElementById(modalId);
        if (!this.modal) {
            this.createModal(modalId);
        }
        this.content = this.modal.querySelector('.modal-content');
        this.bindCloseEvents();
    }

    /**
     * 创建弹窗DOM结构
     */
    createModal(modalId) {
        this.modal = document.createElement('div');
        this.modal.id = modalId;
        this.modal.className = 'modal detail-modal';
        this.modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-container">
                <div class="modal-header">
                    <h3>招聘详情</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-content"></div>
                <div class="modal-footer">
                    <button class="btn-close">关闭</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.modal);
    }

    /**
     * 绑定关闭事件
     */
    bindCloseEvents() {
        // 点击遮罩关闭
        this.modal.querySelector('.modal-overlay').addEventListener('click', () => this.hide());
        
        // 点击关闭按钮
        this.modal.querySelector('.modal-close').addEventListener('click', () => this.hide());
        
        // 点击底部关闭按钮
        this.modal.querySelector('.btn-close').addEventListener('click', () => this.hide());

        // ESC键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) {
                this.hide();
            }
        });
    }

    /**
     * 显示弹窗
     */
    show(record) {
        const html = this.renderContent(record);
        this.content.innerHTML = html;
        this.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // 禁止背景滚动
    }

    /**
     * 隐藏弹窗
     */
    hide() {
        this.modal.style.display = 'none';
        document.body.style.overflow = ''; // 恢复背景滚动
    }

    /**
     * 判断是否显示
     */
    isVisible() {
        return this.modal.style.display === 'flex';
    }

    /**
     * 渲染内容
     */
    renderContent(record) {
        let html = '';

        // 处理JSONB格式的初试信息，展开为独立字段
        const processedRecord = { ...record };
        if (record.first_interview && typeof record.first_interview === 'object') {
            processedRecord.first_interview_time = record.first_interview.time || record.first_interview_time;
            processedRecord.first_interviewer = record.first_interview.interviewer || record.first_interviewer;
            processedRecord.first_interview_result = record.first_interview.result || record.first_interview_result;
            processedRecord.first_reject_reason = record.first_interview.reject_reason || record.first_reject_reason;
            processedRecord.first_reject_detail = record.first_interview.reject_detail || record.first_reject_detail;
        }

        // 按 order 排序分组
        const sortedGroups = Object.entries(DETAIL_FIELDS)
            .sort(([, a], [, b]) => (a.order || 99) - (b.order || 99));

        // 遍历所有分组
        for (const [groupKey, groupConfig] of sortedGroups) {
            const groupFields = groupConfig.fields;
            
            // 过滤出有值的字段
            let validFields = groupFields.filter(field => {
                const value = processedRecord[field.field];
                return value !== null && value !== undefined && value !== '';
            });

            // 对于录用状态分组，在录用阶段始终显示
            if (groupKey === 'hireStatus' && record.current_stage === 'hired') {
                // 始终显示录用状态分组，即使某些字段为空
                validFields = groupFields.map(field => {
                    const value = processedRecord[field.field];
                    return { ...field, displayValue: value || '-' };
                });
            }

            if (validFields.length === 0) continue;

            html += `
                <div class="detail-group" data-group="${groupKey}">
                    <h4 class="group-title">${groupConfig.label}</h4>
                    <div class="detail-grid">
                        ${validFields.map(field => this.renderField(processedRecord, field)).join('')}
                    </div>
                </div>
            `;
        }

        // 如果拒绝offer，添加提示信息
        if (record.current_stage === 'hired' && record.accept_offer === 'no') {
            html = `
                <div class="detail-alert detail-alert-danger" style="background-color: #fff2f0; border: 1px solid #ffccc7; padding: 12px 16px; margin-bottom: 16px; border-radius: 4px; color: #cf1322;">
                    <strong>⚠️ 提示：</strong>该候选人已拒绝offer
                    ${record.offer_reject_reason ? `<br><span style="margin-top: 8px; display: block;">拒绝原因：${record.offer_reject_reason}</span>` : ''}
                </div>
            ` + html;
        }

        return html;
    }

    /**
     * 渲染单个字段
     */
    renderField(record, field) {
        const value = record[field.field];
        const formattedValue = this.formatValue(value, field.format);

        // 根据字段类型添加特殊样式
        let valueClass = '';
        if (field.field.includes('result')) {
            valueClass = this.getResultClass(value);
        }

        // 为工作经历字段添加 data-field 属性以便应用特殊样式
        const dataFieldAttr = field.field === 'work_experience' ? 'data-field="work_experience"' : '';

        return `
            <div class="detail-item">
                <label class="field-label">${field.label}</label>
                <span class="field-value ${valueClass}" ${dataFieldAttr}>${formattedValue}</span>
            </div>
        `;
    }

    /**
     * 格式化值
     */
    formatValue(value, formatType) {
        if (FieldFormatters && FieldFormatters.format) {
            return FieldFormatters.format(value, formatType);
        }
        return value || '-';
    }

    /**
     * 获取结果样式类
     */
    getResultClass(value) {
        switch (value) {
            case 'pass':
                return 'text-success';
            case 'reject':
                return 'text-danger';
            case 'pending':
                return 'text-warning';
            default:
                return '';
        }
    }
}

// 导出（如果在模块环境中）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DetailModal;
}
