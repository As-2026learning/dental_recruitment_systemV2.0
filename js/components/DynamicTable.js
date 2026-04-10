/**
 * 招聘流程管理模块 - 动态表格组件
 * 支持动态列渲染、排序、选择等功能
 */

class DynamicTable {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            fields: [],
            data: [],
            showCheckbox: true,
            showIndex: false,
            onRowClick: null,
            onSelectionChange: null,
            ...options
        };
        this.selectedIds = new Set();
        this.sortField = null;
        this.sortOrder = 'asc';
    }

    /**
     * 渲染表格
     * 【优化】使用requestAnimationFrame避免阻塞主线程
     */
    render(data = this.options.data, fields = this.options.fields) {
        this.options.data = data;
        this.options.fields = fields;

        if (!this.container) {
            console.error('表格容器不存在:', this.container);
            return;
        }

        // 【优化】使用requestAnimationFrame避免渲染阻塞
        requestAnimationFrame(() => {
            const table = document.createElement('table');
            table.className = 'recruitment-table';

            // 渲染表头
            const thead = this.renderHeader(fields);
            table.appendChild(thead);

            // 渲染表体
            const tbody = this.renderBody(data, fields);
            table.appendChild(tbody);

            // 清空容器并添加表格
            this.container.innerHTML = '';
            this.container.appendChild(table);

            // 绑定事件
            this.bindEvents();
        });
    }

    /**
     * 渲染表头
     */
    renderHeader(fields) {
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');

        // 复选框列
        if (this.options.showCheckbox) {
            const th = document.createElement('th');
            th.className = 'checkbox-col';
            th.innerHTML = '<input type="checkbox" id="selectAll">';
            tr.appendChild(th);
        }

        // 序号列
        if (this.options.showIndex) {
            const th = document.createElement('th');
            th.className = 'index-col';
            th.textContent = '序号';
            tr.appendChild(th);
        }

        // 数据列
        fields.forEach(field => {
            const th = document.createElement('th');
            th.textContent = field.label;
            th.style.width = field.width ? `${field.width}px` : 'auto';
            
            if (field.fixed) {
                th.classList.add('fixed-col');
            }

            // 添加排序功能
            if (field.sortable) {
                th.classList.add('sortable');
                th.dataset.field = field.field;
                th.addEventListener('click', () => this.handleSort(field.field));
            }

            tr.appendChild(th);
        });

        thead.appendChild(tr);
        return thead;
    }

    /**
     * 渲染表体
     */
    renderBody(data, fields) {
        const tbody = document.createElement('tbody');

        if (data.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = fields.length + (this.options.showCheckbox ? 1 : 0) + (this.options.showIndex ? 1 : 0);
            td.className = 'empty-message';
            td.textContent = '暂无数据';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return tbody;
        }

        data.forEach((row, index) => {
            const tr = document.createElement('tr');
            tr.dataset.id = row.id;

            // 高亮选中行
            if (this.selectedIds.has(row.id)) {
                tr.classList.add('selected');
            }

            // 复选框
            if (this.options.showCheckbox) {
                const td = document.createElement('td');
                td.className = 'checkbox-col';
                td.innerHTML = `<input type="checkbox" class="row-checkbox" value="${row.id}" ${this.selectedIds.has(row.id) ? 'checked' : ''}>`;
                tr.appendChild(td);
            }

            // 序号
            if (this.options.showIndex) {
                const td = document.createElement('td');
                td.className = 'index-col';
                td.textContent = index + 1;
                tr.appendChild(td);
            }

            // 数据列
            fields.forEach(field => {
                const td = document.createElement('td');
                
                if (field.isAction) {
                    td.innerHTML = this.renderActions(row);
                } else if (field.field === 'current_stage') {
                    // 当前环节列特殊处理：录用阶段根据accept_offer和no_report_reason显示不同文本
                    let stageText = this.formatValue(row[field.field], field.format);
                    if (row.current_stage === 'hired') {
                        // 关键修复：支持多种accept_offer格式
                        const hasAcceptedOffer = row.accept_offer === 'yes' || row.accept_offer === '是' || row.accept_offer === true || row.accept_offer === 1 || row.accept_offer === '1';
                        const hasRejectedOffer = row.accept_offer === 'no' || row.accept_offer === '否';

                        if (hasAcceptedOffer) {
                            // 已接受offer，根据是否有未报到记录判断
                            if (row.no_report_reason && row.no_report_reason.trim() !== '' && row.no_report_reason !== '无') {
                                stageText = '未报到';
                            } else {
                                stageText = '待报到';
                            }
                        } else if (hasRejectedOffer) {
                            // 拒绝offer，当前环节仍显示"录用"，状态显示"已拒绝"
                            stageText = '录用';
                        }
                    }
                    td.textContent = stageText;
                } else if (field.field === 'current_status') {
                    // 状态列特殊处理
                    let statusText = this.formatValue(row[field.field], field.format);
                    // 关键修复：只在需要特殊显示时覆盖，否则使用格式化后的值
                    if (row.current_stage === 'hired') {
                        // 关键修复：支持多种accept_offer格式
                        const hasAcceptedOffer = row.accept_offer === 'yes' || row.accept_offer === '是' || row.accept_offer === true || row.accept_offer === 1 || row.accept_offer === '1';
                        const hasRejectedOffer = row.accept_offer === 'no' || row.accept_offer === '否';
                        const hasNoReportReason = row.no_report_reason && row.no_report_reason.trim() !== '' && row.no_report_reason !== '无';

                        // 只在特定情况下覆盖状态显示
                        if (hasRejectedOffer && row[field.field] !== 'rejected') {
                            statusText = '已拒绝';
                        } else if (hasAcceptedOffer && hasNoReportReason) {
                            // 已接受offer但有未报到记录，显示未报到
                            statusText = '未报到';
                        }
                    }
                    td.textContent = statusText;
                } else {
                    const value = row[field.field];
                    td.textContent = this.formatValue(value, field.format);
                }

                if (field.fixed) {
                    td.classList.add('fixed-col');
                }

                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        return tbody;
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
     * 渲染操作按钮
     */
    renderActions(row) {
        const actions = [];
        
        // 查看按钮
        actions.push(`<button class="btn-view" data-id="${row.id}">查看</button>`);

        // 根据当前环节显示不同操作
        switch (row.current_stage) {
            case 'application':
                // 投递简历阶段 - 显示初试处理按钮
                actions.push(`<button class="btn-process" data-id="${row.id}" data-stage="first">初试处理</button>`);
                break;
            case 'first_interview':
                // 【优化】根据初试状态显示不同的按钮文本
                if (row.current_status === 'pending') {
                    // 初试待处理 - 显示初试处理按钮
                    actions.push(`<button class="btn-process" data-id="${row.id}" data-stage="first">初试处理</button>`);
                } else if (row.current_status === 'passed') {
                    // 初试通过，显示复试处理按钮
                    actions.push(`<button class="btn-process" data-id="${row.id}" data-stage="second">复试处理</button>`);
                } else if (row.current_status === 'reject') {
                    // 初试不通过 - 不显示处理按钮
                }
                break;
            case 'second_interview':
                // 【优化】根据复试状态显示不同的按钮文本
                const secondInterviewHasAcceptedOffer = row.accept_offer === 'yes' || row.accept_offer === '是' || row.accept_offer === true || row.accept_offer === 1 || row.accept_offer === '1';
                if (row.current_status === 'pending') {
                    // 复试待处理 - 显示复试处理按钮
                    actions.push(`<button class="btn-process" data-id="${row.id}" data-stage="second">复试处理</button>`);
                } else if (row.current_status === 'passed' && !secondInterviewHasAcceptedOffer) {
                    // 复试通过但未填写录用信息，显示填写录用信息按钮
                    actions.push(`<button class="btn-process" data-id="${row.id}" data-stage="hired">填写录用信息</button>`);
                } else if (row.current_status === 'reject') {
                    // 复试不通过 - 不显示处理按钮
                }
                break;
            case 'hired':
                // 根据accept_offer状态显示不同按钮
                // 关键修复：支持多种accept_offer格式
                const hasAcceptedOffer = row.accept_offer === 'yes' || row.accept_offer === '是' || row.accept_offer === true || row.accept_offer === 1 || row.accept_offer === '1';
                const hasRejectedOffer = row.accept_offer === 'no' || row.accept_offer === '否';
                const hasNoReportReason = row.no_report_reason && row.no_report_reason.trim() !== '' && row.no_report_reason !== '无';
                // 关键修复：判断是否为已提交未报到状态（current_status为reject表示未报到）
                const isNotReported = row.current_status === 'reject' || row.current_status === 'rejected' || row.current_status === '不通过';

                if (hasRejectedOffer) {
                    // 已拒绝offer - 不显示任何操作按钮（终止流程）
                    // 关键修复：已拒绝状态不应有任何操作
                    break;
                } else if (hasNoReportReason || isNotReported) {
                    // 未报到状态 - 不显示任何操作按钮（终止流程）
                    // 关键修复：已提交未报到状态不应显示报到登记按钮
                    break;
                } else if (hasAcceptedOffer) {
                    // 接受offer且未报到 - 显示报到登记按钮
                    if (row.current_status === 'pending' || row.current_status === '待处理') {
                        actions.push(`<button class="btn-process" data-id="${row.id}" data-stage="onboarding">报到登记</button>`);
                    }
                } else {
                    // 未设置accept_offer - 显示填写录用信息按钮
                    actions.push(`<button class="btn-process" data-id="${row.id}" data-stage="hired">填写录用信息</button>`);
                }
                break;
        }

        return actions.join(' ');
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 全选/取消全选
        const selectAllCheckbox = this.container.querySelector('#selectAll');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const checkboxes = this.container.querySelectorAll('.row-checkbox');
                checkboxes.forEach(checkbox => {
                    checkbox.checked = e.target.checked;
                    const id = parseInt(checkbox.value);
                    if (e.target.checked) {
                        this.selectedIds.add(id);
                    } else {
                        this.selectedIds.delete(id);
                    }
                });
                this.updateRowSelection();
                this.notifySelectionChange();
            });
        }

        // 单行选择
        this.container.querySelectorAll('.row-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const id = parseInt(e.target.value);
                if (e.target.checked) {
                    this.selectedIds.add(id);
                } else {
                    this.selectedIds.delete(id);
                }
                this.updateRowSelection();
                this.notifySelectionChange();
            });
        });

        // 行点击
        if (this.options.onRowClick) {
            this.container.querySelectorAll('tbody tr').forEach(tr => {
                tr.addEventListener('click', (e) => {
                    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
                        const id = parseInt(tr.dataset.id);
                        this.options.onRowClick(id);
                    }
                });
            });
        }

        // 操作按钮点击
        this.container.querySelectorAll('.btn-view').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(e.target.dataset.id);
                if (this.options.onView) {
                    this.options.onView(id);
                }
            });
        });

        this.container.querySelectorAll('.btn-process').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(e.target.dataset.id);
                const stage = e.target.dataset.stage;
                if (this.options.onProcess) {
                    this.options.onProcess(id, stage);
                }
            });
        });
    }

    /**
     * 更新行选中状态
     */
    updateRowSelection() {
        this.container.querySelectorAll('tbody tr').forEach(tr => {
            const id = parseInt(tr.dataset.id);
            if (this.selectedIds.has(id)) {
                tr.classList.add('selected');
            } else {
                tr.classList.remove('selected');
            }
        });
    }

    /**
     * 通知选择变化
     */
    notifySelectionChange() {
        if (this.options.onSelectionChange) {
            this.options.onSelectionChange([...this.selectedIds]);
        }
    }

    /**
     * 获取选中的ID
     */
    getSelectedIds() {
        return [...this.selectedIds];
    }

    /**
     * 清除选择
     */
    clearSelection() {
        this.selectedIds.clear();
        const selectAllCheckbox = this.container.querySelector('#selectAll');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
        }
        this.container.querySelectorAll('.row-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        this.updateRowSelection();
        this.notifySelectionChange();
    }

    /**
     * 处理排序
     */
    handleSort(field) {
        if (this.sortField === field) {
            this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortOrder = 'asc';
        }

        // 更新排序图标
        this.container.querySelectorAll('th.sortable').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.field === field) {
                th.classList.add(`sort-${this.sortOrder}`);
            }
        });

        // 执行排序
        this.options.data.sort((a, b) => {
            const aVal = a[field];
            const bVal = b[field];
            
            if (aVal === null || aVal === undefined) return 1;
            if (bVal === null || bVal === undefined) return -1;
            
            if (typeof aVal === 'string') {
                return this.sortOrder === 'asc' 
                    ? aVal.localeCompare(bVal)
                    : bVal.localeCompare(aVal);
            }
            
            return this.sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        });

        // 重新渲染
        this.render(this.options.data, this.options.fields);
    }

    /**
     * 更新数据
     */
    updateData(newData) {
        this.options.data = newData;
        this.render(newData, this.options.fields);
    }
}

// 导出（如果在模块环境中）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DynamicTable;
}
