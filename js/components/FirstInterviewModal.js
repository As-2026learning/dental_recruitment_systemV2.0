/**
 * 招聘流程管理模块 - 初试处理弹窗组件
 */

class FirstInterviewModal {
    constructor(modalId = 'firstInterviewModal') {
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
                    <h3>初试处理</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="candidate-info-card">
                        <h4>候选人信息</h4>
                        <div class="info-grid" id="candidateInfo"></div>
                    </div>
                    <form id="firstInterviewForm">
                        <div class="form-group">
                            <label>初试时间 <span class="required">*</span></label>
                            <input type="datetime-local" name="first_interview_time" required>
                        </div>
                        <div class="form-group">
                            <label>初试官 <span class="required">*</span></label>
                            <input type="text" name="first_interviewer" required placeholder="请输入初试官姓名">
                        </div>
                        <div class="form-group">
                            <label>初试结果 <span class="required">*</span></label>
                            <select name="first_interview_result" required>
                                <option value="">请选择</option>
                                <option value="pass">通过</option>
                                <option value="reject">不通过</option>
                            </select>
                        </div>
                        <div class="form-group reject-reason-group" style="display:none;">
                            <label>未通过原因 <span class="required">*</span></label>
                            <select name="first_reject_reason">
                                <option value="">请选择</option>
                                ${Object.entries(FIRST_REJECT_REASONS).map(([key, label]) => 
                                    `<option value="${key}">${label}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group reject-detail-group" style="display:none;">
                            <label>详细说明</label>
                            <textarea name="first_reject_detail" rows="3" placeholder="请输入详细说明"></textarea>
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
        const form = this.modal.querySelector('#firstInterviewForm');
        const resultSelect = form.querySelector('[name="first_interview_result"]');
        const rejectReasonGroup = this.modal.querySelector('.reject-reason-group');
        const rejectDetailGroup = this.modal.querySelector('.reject-detail-group');
        const rejectReasonSelect = form.querySelector('[name="first_reject_reason"]');

        resultSelect.addEventListener('change', (e) => {
            if (e.target.value === 'reject') {
                rejectReasonGroup.style.display = 'block';
                rejectReasonSelect.required = true;
            } else {
                rejectReasonGroup.style.display = 'none';
                rejectDetailGroup.style.display = 'none';
                rejectReasonSelect.required = false;
                rejectReasonSelect.value = '';
                form.querySelector('[name="first_reject_detail"]').value = '';
            }
        });

        rejectReasonSelect.addEventListener('change', (e) => {
            if (e.target.value === 'other') {
                rejectDetailGroup.style.display = 'block';
            } else {
                rejectDetailGroup.style.display = 'none';
                form.querySelector('[name="first_reject_detail"]').value = '';
            }
        });

        this.modal.querySelector('.btn-submit').addEventListener('click', () => this.handleSubmit());
    }

    show(record, onSubmitCallback) {
        this.currentRecord = record;
        this.onSubmit = onSubmitCallback;
        
        // 填充候选人信息
        const infoHtml = `
            <div class="info-item"><label>姓名：</label><span>${record.name || '-'}</span></div>
            <div class="info-item"><label>电话：</label><span>${record.phone || '-'}</span></div>
            <div class="info-item"><label>应聘岗位：</label><span>${record.position || '-'}</span></div>
            <div class="info-item"><label>工种：</label><span>${record.job_type || '-'}</span></div>
        `;
        this.modal.querySelector('#candidateInfo').innerHTML = infoHtml;

        // 获取表单
        const form = this.modal.querySelector('#firstInterviewForm');
        
        // 先隐藏条件字段
        this.modal.querySelector('.reject-reason-group').style.display = 'none';
        this.modal.querySelector('.reject-detail-group').style.display = 'none';
        
        // 重置表单
        form.reset();

        // 如果有已有数据，填充表单
        setTimeout(() => {
            if (record.first_interview_time) {
                const timeField = form.querySelector('[name="first_interview_time"]');
                if (timeField) timeField.value = this.formatDateTimeLocal(record.first_interview_time);
            }
            if (record.first_interviewer) {
                const interviewerField = form.querySelector('[name="first_interviewer"]');
                if (interviewerField) interviewerField.value = record.first_interviewer;
            }
            if (record.first_interview_result) {
                const resultField = form.querySelector('[name="first_interview_result"]');
                if (resultField) {
                    resultField.value = record.first_interview_result;
                    // 触发结果变更事件，显示/隐藏相关字段
                    resultField.dispatchEvent(new Event('change'));
                }
                
                if (record.first_interview_result === 'reject') {
                    if (record.first_reject_reason) {
                        const reasonField = form.querySelector('[name="first_reject_reason"]');
                        if (reasonField) {
                            reasonField.value = record.first_reject_reason;
                            reasonField.dispatchEvent(new Event('change'));
                        }
                    }
                    if (record.first_reject_detail) {
                        const detailField = form.querySelector('[name="first_reject_detail"]');
                        if (detailField) detailField.value = record.first_reject_detail;
                    }
                }
            }
        }, 0);

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
        const form = this.modal.querySelector('#firstInterviewForm');
        
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        
        // 调试：打印表单数据
        console.log('FirstInterviewModal - 表单数据:');
        for (let [key, value] of formData.entries()) {
            console.log(`  ${key}: ${value}`);
        }
        
        // 构建初试信息JSON对象
        const firstInterviewData = {
            time: formData.get('first_interview_time'),
            interviewer: formData.get('first_interviewer'),
            result: formData.get('first_interview_result'),
            reject_reason: null,
            reject_detail: null
        };

        const data = {
            first_interview: firstInterviewData,
            // 兼容旧字段
            first_interview_time: formData.get('first_interview_time'),
            first_interviewer: formData.get('first_interviewer'),
            first_interview_result: formData.get('first_interview_result')
        };

        console.log('FirstInterviewModal - first_interview_result:', data.first_interview_result);
        console.log('FirstInterviewModal - 条件判断:', data.first_interview_result === 'pass');

        if (data.first_interview_result === 'pass') {
            // 关键修复：初试通过后应该进入复试阶段
            data.current_stage = 'second_interview';
            data.current_status = 'pending';
            console.log('FirstInterviewModal - 设置状态为通过，进入复试阶段');
        } else if (data.first_interview_result === 'reject') {
            // 【修复】初试不通过时，current_stage 应该设置为 first_interview
            data.current_stage = 'first_interview';
            data.current_status = 'reject';
            data.first_interview.reject_reason = formData.get('first_reject_reason');
            data.first_interview.reject_detail = formData.get('first_reject_detail');
            // 兼容旧字段
            data.first_reject_reason = formData.get('first_reject_reason');
            data.first_reject_detail = formData.get('first_reject_detail');
            console.log('FirstInterviewModal - 设置状态为不通过，当前环节为初试');
        } else {
            console.log('FirstInterviewModal - 未知的初试结果:', data.first_interview_result);
        }
        
        console.log('FirstInterviewModal - 最终data:', data);

        if (this.onSubmit) {
            try {
                const result = await this.onSubmit(this.currentRecord.id, data);
                console.log('FirstInterviewModal - onSubmit结果:', result);
                if (result && result.success) {
                    // 显示成功提示
                    const statusText = data.first_interview_result === 'pass' ? '初试通过，进入复试阶段' : '初试处理完成';
                    alert(statusText);
                    this.hide();
                } else {
                    alert('处理失败: ' + (result && result.error ? result.error : '未知错误'));
                }
            } catch (error) {
                console.error('FirstInterviewModal - onSubmit错误:', error);
                alert('处理失败: ' + error.message);
            }
        } else {
            alert('系统错误: 未找到提交处理程序');
        }
    }

    formatDateTimeLocal(dateString) {
        const date = new Date(dateString);
        return date.toISOString().slice(0, 16);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FirstInterviewModal;
}
