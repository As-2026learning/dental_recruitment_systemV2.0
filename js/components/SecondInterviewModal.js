/**
 * 招聘流程管理模块 - 复试处理弹窗组件
 */

class SecondInterviewModal {
    constructor(modalId = 'secondInterviewModal') {
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
                    <h3>复试处理</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="candidate-info-card">
                        <h4>候选人信息</h4>
                        <div class="info-grid" id="candidateInfoSecond"></div>
                    </div>
                    <div class="previous-result-card">
                        <h4>初试结果</h4>
                        <div class="info-grid" id="firstResultInfo"></div>
                    </div>
                    <form id="secondInterviewForm">
                        <div class="form-group">
                            <label>复试时间 <span class="required">*</span></label>
                            <input type="datetime-local" name="second_interview_time" required>
                        </div>
                        <div class="form-group">
                            <label>复试官 <span class="required">*</span></label>
                            <input type="text" name="second_interviewer" required placeholder="请输入复试官姓名">
                        </div>
                        <div class="form-group">
                            <label>复试结果 <span class="required">*</span></label>
                            <select name="second_interview_result" required>
                                <option value="">请选择</option>
                                <option value="pass">通过</option>
                                <option value="reject">不通过</option>
                            </select>
                        </div>
                        <div class="pass-fields" style="display:none;">
                            <div class="form-group">
                                <label>录用部门 <span class="required">*</span></label>
                                <input type="text" name="hire_department" placeholder="请输入录用部门">
                            </div>
                            <div class="form-group">
                                <label>录用岗位 <span class="required">*</span></label>
                                <input type="text" name="hire_position" placeholder="请输入录用岗位">
                            </div>
                            <div class="form-group">
                                <label>职务 <span class="required">*</span></label>
                                <input type="text" name="job_title" required placeholder="请输入职务">
                            </div>
                            <div class="form-group">
                                <label>职级 <span class="required">*</span></label>
                                <input type="text" name="job_level" required placeholder="请输入职级">
                            </div>
                            <div class="form-group">
                                <label>录用薪资</label>
                                <input type="text" name="hire_salary" placeholder="请输入录用薪资">
                            </div>
                            <div class="form-group">
                                <label>是否接受offer <span class="required">*</span></label>
                                <select name="accept_offer" required>
                                    <option value="">请选择</option>
                                    <option value="yes">是</option>
                                    <option value="no">否</option>
                                </select>
                            </div>
                            <div class="form-group offer-reject-reason-group" style="display:none;">
                                <label>拒绝原因 <span class="required">*</span></label>
                                <textarea name="offer_reject_reason" rows="3" placeholder="请输入拒绝offer的具体原因"></textarea>
                            </div>
                            <div class="form-group">
                                <label>预计入职日期</label>
                                <input type="date" name="hire_date">
                            </div>
                        </div>
                        <div class="form-group reject-reason-group" style="display:none;">
                            <label>未通过原因 <span class="required">*</span></label>
                            <select name="second_reject_reason">
                                <option value="">请选择</option>
                                ${Object.entries(SECOND_REJECT_REASONS).map(([key, label]) => 
                                    `<option value="${key}">${label}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group reject-detail-group" style="display:none;">
                            <label>详细说明</label>
                            <textarea name="second_reject_detail" rows="3" placeholder="请输入详细说明"></textarea>
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
        const form = this.modal.querySelector('#secondInterviewForm');
        const resultSelect = form.querySelector('[name="second_interview_result"]');
        const passFields = this.modal.querySelector('.pass-fields');
        const rejectReasonGroup = this.modal.querySelector('.reject-reason-group');
        const rejectDetailGroup = this.modal.querySelector('.reject-detail-group');
        const rejectReasonSelect = form.querySelector('[name="second_reject_reason"]');
        const acceptOfferSelect = form.querySelector('[name="accept_offer"]');
        const offerRejectReasonGroup = this.modal.querySelector('.offer-reject-reason-group');

        resultSelect.addEventListener('change', (e) => {
            const requiredPassFields = passFields.querySelectorAll('[required]');
            if (e.target.value === 'pass') {
                passFields.style.display = 'block';
                rejectReasonGroup.style.display = 'none';
                rejectDetailGroup.style.display = 'none';
                requiredPassFields.forEach(field => field.required = true);
                rejectReasonSelect.required = false;
                rejectReasonSelect.value = '';
            } else if (e.target.value === 'reject') {
                passFields.style.display = 'none';
                rejectReasonGroup.style.display = 'block';
                requiredPassFields.forEach(field => field.required = false);
                rejectReasonSelect.required = true;
                // 清空通过字段
                passFields.querySelectorAll('input, select').forEach(field => field.value = '');
            } else {
                passFields.style.display = 'none';
                rejectReasonGroup.style.display = 'none';
                rejectDetailGroup.style.display = 'none';
                requiredPassFields.forEach(field => field.required = false);
                rejectReasonSelect.required = false;
            }
        });

        rejectReasonSelect.addEventListener('change', (e) => {
            if (e.target.value === 'other') {
                rejectDetailGroup.style.display = 'block';
            } else {
                rejectDetailGroup.style.display = 'none';
                form.querySelector('[name="second_reject_detail"]').value = '';
            }
        });

        // 是否接受offer字段的事件监听
        acceptOfferSelect.addEventListener('change', (e) => {
            const offerRejectReasonField = form.querySelector('[name="offer_reject_reason"]');
            if (e.target.value === 'no') {
                offerRejectReasonGroup.style.display = 'block';
                offerRejectReasonField.required = true;
            } else {
                offerRejectReasonGroup.style.display = 'none';
                offerRejectReasonField.required = false;
                offerRejectReasonField.value = '';
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
        this.modal.querySelector('#candidateInfoSecond').innerHTML = infoHtml;

        // 填充初试结果（优先从JSONB字段读取，兼容旧字段）
        console.log('复试弹窗 - 记录数据:', record);
        console.log('复试弹窗 - first_interview字段:', record.first_interview);
        console.log('复试弹窗 - first_interview_time字段:', record.first_interview_time);
        console.log('复试弹窗 - first_interviewer字段:', record.first_interviewer);
        console.log('复试弹窗 - first_interview_result字段:', record.first_interview_result);
        
        const firstInterview = record.first_interview || {};
        const firstInterviewTime = firstInterview.time || record.first_interview_time;
        const firstInterviewer = firstInterview.interviewer || record.first_interviewer;
        const firstInterviewResult = firstInterview.result || record.first_interview_result;
        
        console.log('复试弹窗 - 解析后的初试时间:', firstInterviewTime);
        console.log('复试弹窗 - 解析后的初试官:', firstInterviewer);
        console.log('复试弹窗 - 解析后的初试结果:', firstInterviewResult);
        
        const firstResultHtml = `
            <div class="info-item"><label>初试时间：</label><span>${firstInterviewTime ? new Date(firstInterviewTime).toLocaleString('zh-CN') : '-'}</span></div>
            <div class="info-item"><label>初试官：</label><span>${firstInterviewer || '-'}</span></div>
            <div class="info-item"><label>初试结果：</label><span class="${firstInterviewResult === 'pass' ? 'text-success' : ''}">${firstInterviewResult === 'pass' ? '通过' : (firstInterviewResult === 'reject' ? '不通过' : '-')}</span></div>
        `;
        this.modal.querySelector('#firstResultInfo').innerHTML = firstResultHtml;

        // 重置表单
        const form = this.modal.querySelector('#secondInterviewForm');
        form.reset();
        this.modal.querySelector('.pass-fields').style.display = 'none';
        this.modal.querySelector('.reject-reason-group').style.display = 'none';
        this.modal.querySelector('.reject-detail-group').style.display = 'none';

        // 如果有已有数据，填充表单
        if (record.second_interview_time) {
            form.querySelector('[name="second_interview_time"]').value = this.formatDateTimeLocal(record.second_interview_time);
        }
        if (record.second_interviewer) {
            form.querySelector('[name="second_interviewer"]').value = record.second_interviewer;
        }
        if (record.second_interview_result) {
            form.querySelector('[name="second_interview_result"]').value = record.second_interview_result;
            // 触发结果变更事件，显示/隐藏相关字段
            form.querySelector('[name="second_interview_result"]').dispatchEvent(new Event('change'));
            
            if (record.second_interview_result === 'pass') {
                // 填充录用信息（如果有）
                this.fillHireInfo(form, record);
            } else if (record.second_interview_result === 'reject') {
                if (record.second_reject_reason) {
                    form.querySelector('[name="second_reject_reason"]').value = record.second_reject_reason;
                    form.querySelector('[name="second_reject_reason"]').dispatchEvent(new Event('change'));
                }
                if (record.second_reject_detail) {
                    form.querySelector('[name="second_reject_detail"]').value = record.second_reject_detail;
                }
            }
        } else {
            // 即使没有复试结果，如果已有录用信息，也自动填充
            // 这种情况发生在：之前填写过复试通过和录用信息，但页面重新加载后
            if (record.hire_department || record.hire_position || record.job_title || record.job_level) {
                // 自动设置复试结果为"通过"并显示录用信息区域
                form.querySelector('[name="second_interview_result"]').value = 'pass';
                form.querySelector('[name="second_interview_result"]').dispatchEvent(new Event('change'));
                this.fillHireInfo(form, record);
            }
        }

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
        const form = this.modal.querySelector('#secondInterviewForm');
        
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const data = {
            second_interview_time: formData.get('second_interview_time'),
            second_interviewer: formData.get('second_interviewer'),
            second_interview_result: formData.get('second_interview_result')
        };
        
        console.log('SecondInterviewModal.handleSubmit - 基本信息:', data);

        if (data.second_interview_result === 'pass') {
            data.hire_department = formData.get('hire_department');
            data.hire_position = formData.get('hire_position');
            data.job_title = formData.get('job_title');
            data.job_level = formData.get('job_level');
            data.hire_salary = formData.get('hire_salary');
            data.accept_offer = formData.get('accept_offer');
            data.offer_reject_reason = formData.get('offer_reject_reason');
            data.hire_date = formData.get('hire_date');
            
            console.log('SecondInterviewModal.handleSubmit - 录用信息:', {
                hire_department: data.hire_department,
                hire_position: data.hire_position,
                job_title: data.job_title,
                job_level: data.job_level,
                hire_salary: data.hire_salary,
                accept_offer: data.accept_offer
            });
            
            // 根据是否接受offer设置状态
            if (data.accept_offer === 'yes') {
                data.current_stage = 'hired';
                data.current_status = 'pending';
            } else {
                data.current_stage = 'hired';
                data.current_status = 'reject';
            }
        } else {
            // 【修复】复试不通过时，current_stage 应该设置为 second_interview
            data.current_stage = 'second_interview';
            data.current_status = 'reject';
            data.second_reject_reason = formData.get('second_reject_reason');
            data.second_reject_detail = formData.get('second_reject_detail');
        }
        
        console.log('SecondInterviewModal.handleSubmit - 完整数据:', data);

        if (this.onSubmit) {
            const result = await this.onSubmit(this.currentRecord.id, data);
            console.log('SecondInterviewModal.handleSubmit - 提交结果:', result);
            if (result.success) {
                // 显示成功提示
                const statusText = data.current_stage === 'hired' ? '录用信息提交成功' : '复试处理成功';
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

    formatDateTimeLocal(dateString) {
        const date = new Date(dateString);
        return date.toISOString().slice(0, 16);
    }

    /**
     * 填充录用信息到表单
     * @param {HTMLFormElement} form - 表单元素
     * @param {Object} record - 记录数据
     */
    fillHireInfo(form, record) {
        console.log('SecondInterviewModal.fillHireInfo - 填充录用信息:', {
            hire_department: record.hire_department,
            hire_position: record.hire_position,
            job_title: record.job_title,
            job_level: record.job_level,
            hire_salary: record.hire_salary,
            accept_offer: record.accept_offer,
            offer_reject_reason: record.offer_reject_reason,
            hire_date: record.hire_date
        });
        
        if (record.hire_department) {
            form.querySelector('[name="hire_department"]').value = record.hire_department;
        }
        if (record.hire_position) {
            form.querySelector('[name="hire_position"]').value = record.hire_position;
        }
        if (record.job_title) {
            form.querySelector('[name="job_title"]').value = record.job_title;
        }
        if (record.job_level) {
            form.querySelector('[name="job_level"]').value = record.job_level;
        }
        if (record.hire_salary) {
            form.querySelector('[name="hire_salary"]').value = record.hire_salary;
        }
        if (record.accept_offer) {
            form.querySelector('[name="accept_offer"]').value = record.accept_offer;
            form.querySelector('[name="accept_offer"]').dispatchEvent(new Event('change'));
        }
        if (record.offer_reject_reason) {
            form.querySelector('[name="offer_reject_reason"]').value = record.offer_reject_reason;
        }
        if (record.hire_date) {
            form.querySelector('[name="hire_date"]').value = record.hire_date;
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SecondInterviewModal;
}
