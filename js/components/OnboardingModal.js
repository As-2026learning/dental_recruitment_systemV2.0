/**
 * 招聘流程管理模块 - 录用报到弹窗组件
 */

class OnboardingModal {
    constructor(modalId = 'onboardingModal') {
        this.modal = document.getElementById(modalId);
        if (!this.modal) {
            this.createModal(modalId);
        }
        this.currentRecord = null;
        this.onSubmit = null;
        this.bindCloseEvents();
    }

    createModal(modalId) {
        this.modal = document.createElement('div');
        this.modal.id = modalId;
        this.modal.className = 'modal process-modal';
        this.modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-container">
                <div class="modal-header">
                    <h3>录用报到登记</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="candidate-info-card">
                        <h4>候选人信息</h4>
                        <div class="info-grid" id="candidateInfoOnboarding"></div>
                    </div>
                    <div class="previous-result-card">
                        <h4>录用信息</h4>
                        <div class="info-grid" id="hireInfo"></div>
                    </div>
                    <form id="onboardingForm">
                        <div class="form-group">
                            <label>是否报到 <span class="required">*</span></label>
                            <select name="is_reported" required>
                                <option value="">请选择</option>
                                <option value="yes">是</option>
                                <option value="no">否</option>
                            </select>
                        </div>
                        <div class="reported-fields" style="display:none;">
                            <div class="form-group">
                                <label>报到日期 <span class="required">*</span></label>
                                <input type="date" name="report_date">
                            </div>
                        </div>
                        <div class="not-reported-fields" style="display:none;">
                            <div class="form-group">
                                <label>未报到原因 <span class="required">*</span></label>
                                <select name="no_report_reason">
                                    <option value="">请选择</option>
                                    ${Object.entries(NO_REPORT_REASONS).map(([key, label]) => 
                                        `<option value="${key}">${label}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            <div class="form-group no-report-detail-group" style="display:none;">
                                <label>详细说明</label>
                                <textarea name="no_report_detail" rows="3" placeholder="请输入详细说明"></textarea>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn-cancel">取消</button>
                    <button class="btn-submit">确认提交</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.modal);
        this.bindFormEvents();
    }

    bindCloseEvents() {
        this.modal.querySelector('.modal-overlay').addEventListener('click', () => this.hide());
        this.modal.querySelector('.modal-close').addEventListener('click', () => this.hide());
        this.modal.querySelector('.btn-cancel').addEventListener('click', () => this.hide());
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) {
                this.hide();
            }
        });
    }

    bindFormEvents() {
        const form = this.modal.querySelector('#onboardingForm');
        const isReportedSelect = form.querySelector('[name="is_reported"]');
        const reportedFields = this.modal.querySelector('.reported-fields');
        const notReportedFields = this.modal.querySelector('.not-reported-fields');
        const noReportReasonSelect = form.querySelector('[name="no_report_reason"]');
        const noReportDetailGroup = this.modal.querySelector('.no-report-detail-group');

        isReportedSelect.addEventListener('change', (e) => {
            if (e.target.value === 'yes') {
                reportedFields.style.display = 'block';
                notReportedFields.style.display = 'none';
                reportedFields.querySelector('[name="report_date"]').required = true;
                notReportedFields.querySelector('[name="no_report_reason"]').required = false;
                notReportedFields.querySelector('[name="no_report_reason"]').value = '';
                noReportDetailGroup.style.display = 'none';
            } else if (e.target.value === 'no') {
                reportedFields.style.display = 'none';
                notReportedFields.style.display = 'block';
                reportedFields.querySelector('[name="report_date"]').required = false;
                notReportedFields.querySelector('[name="no_report_reason"]').required = true;
                reportedFields.querySelector('[name="report_date"]').value = '';
            } else {
                reportedFields.style.display = 'none';
                notReportedFields.style.display = 'none';
                reportedFields.querySelector('[name="report_date"]').required = false;
                notReportedFields.querySelector('[name="no_report_reason"]').required = false;
            }
        });

        noReportReasonSelect.addEventListener('change', (e) => {
            if (e.target.value === 'other') {
                noReportDetailGroup.style.display = 'block';
            } else {
                noReportDetailGroup.style.display = 'none';
                form.querySelector('[name="no_report_detail"]').value = '';
            }
        });

        this.modal.querySelector('.btn-submit').addEventListener('click', () => this.handleSubmit());
    }

    show(record, onSubmitCallback) {
        this.currentRecord = record;
        this.onSubmit = onSubmitCallback;

        // 调试日志
        console.log('报到登记弹窗 - 记录数据:', record);
        console.log('报到登记弹窗 - 录用部门:', record.hire_department);
        console.log('报到登记弹窗 - 录用岗位:', record.hire_position);
        console.log('报到登记弹窗 - 职级:', record.job_level);
        console.log('报到登记弹窗 - 录用薪资:', record.hire_salary);
        console.log('报到登记弹窗 - 预计入职日期:', record.hire_date);
        console.log('报到登记弹窗 - current_status:', record.current_status);
        console.log('报到登记弹窗 - no_report_reason:', record.no_report_reason);

        // 关键修复：检查是否已经标记为未报到
        const isNotReported = record.current_status === 'reject' || record.current_status === 'rejected' || record.current_status === '不通过';
        const hasNoReportReason = record.no_report_reason && record.no_report_reason.trim() !== '' && record.no_report_reason !== '无';

        if (isNotReported || hasNoReportReason) {
            alert('该候选人已标记为未报到，无法再次操作');
            return;
        }

        // 填充候选人信息
        const infoHtml = `
            <div class="info-item"><label>姓名：</label><span>${record.name || '-'}</span></div>
            <div class="info-item"><label>电话：</label><span>${record.phone || '-'}</span></div>
            <div class="info-item"><label>应聘岗位：</label><span>${record.position || '-'}</span></div>
            <div class="info-item"><label>工种：</label><span>${record.job_type || '-'}</span></div>
        `;
        this.modal.querySelector('#candidateInfoOnboarding').innerHTML = infoHtml;

        // 填充录用信息
        const hireInfoHtml = `
            <div class="info-item"><label>录用部门：</label><span>${record.hire_department || '-'}</span></div>
            <div class="info-item"><label>录用岗位：</label><span>${record.hire_position || '-'}</span></div>
            <div class="info-item"><label>职级：</label><span>${record.job_level || '-'}</span></div>
            <div class="info-item"><label>录用薪资：</label><span>${record.hire_salary || '-'}</span></div>
            <div class="info-item"><label>预计入职日期：</label><span>${record.hire_date || '-'}</span></div>
        `;
        this.modal.querySelector('#hireInfo').innerHTML = hireInfoHtml;

        // 重置表单
        const form = this.modal.querySelector('#onboardingForm');
        form.reset();
        this.modal.querySelector('.reported-fields').style.display = 'none';
        this.modal.querySelector('.not-reported-fields').style.display = 'none';

        this.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    hide() {
        this.modal.style.display = 'none';
        document.body.style.overflow = '';
        this.currentRecord = null;
        this.onSubmit = null;
    }

    isVisible() {
        return this.modal.style.display === 'flex';
    }

    async handleSubmit() {
        const form = this.modal.querySelector('#onboardingForm');
        
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const data = {
            is_reported: formData.get('is_reported')
        };

        if (data.is_reported === 'yes') {
            data.current_stage = 'onboarded';
            data.current_status = 'pass';
            data.report_date = formData.get('report_date');
        } else {
            // 关键修复：未报到时保持stage为hired，但status设为reject
            // 这样可以通过 current_stage='hired' + current_status='reject' 识别未报到状态
            data.current_stage = 'hired';
            data.current_status = 'reject';
            data.no_report_reason = formData.get('no_report_reason');
            data.no_report_detail = formData.get('no_report_detail');
        }

        if (this.onSubmit) {
            const result = await this.onSubmit(this.currentRecord.id, data);
            if (result.success) {
                // 显示成功提示
                const statusText = data.is_reported === 'yes' ? '报到成功' : '未报到登记成功';
                alert(statusText);
                this.hide();
            } else {
                // 显示错误提示
                alert('提交失败: ' + (result.error || '未知错误'));
            }
        } else {
            alert('系统错误: 未找到提交处理程序');
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OnboardingModal;
}
