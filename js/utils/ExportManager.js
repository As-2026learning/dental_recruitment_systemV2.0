/**
 * 招聘流程管理模块 - 导出管理器
 * 支持Excel、CSV、PDF导出
 */

class ExportManager {
    constructor(fieldConfig) {
        this.fieldConfig = fieldConfig || EXPORT_FIELDS;
    }

    /**
     * 导出为Excel
     */
    exportToExcel(data, options = {}) {
        const {
            fields = 'all',
            fileName = `招聘流程数据_${new Date().toISOString().split('T')[0]}`
        } = options;

        const exportFields = fields === 'all' 
            ? this.fieldConfig 
            : this.fieldConfig.filter(f => fields.includes(f.field));

        // 准备表头
        const headers = exportFields.map(f => f.label);
        
        // 准备数据
        const rows = data.map((row, index) => {
            return exportFields.map(field => {
                const value = row[field.field];
                return this.formatValueForExport(value, field.field);
            });
        });

        // 添加序号列
        headers.unshift('序号');
        rows.forEach((row, index) => row.unshift(index + 1));

        // 创建工作表
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        
        // 设置列宽
        ws['!cols'] = headers.map(() => ({ wch: 15 }));

        // 创建工作簿
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '招聘流程数据');

        // 下载文件
        XLSX.writeFile(wb, `${fileName}.xlsx`);
    }

    /**
     * 导出为CSV
     */
    exportToCSV(data, options = {}) {
        const {
            fields = 'all',
            fileName = `招聘流程数据_${new Date().toISOString().split('T')[0]}`
        } = options;

        const exportFields = fields === 'all' 
            ? this.fieldConfig 
            : this.fieldConfig.filter(f => fields.includes(f.field));

        // 准备表头
        let csv = '\uFEFF'; // BOM for Excel UTF-8
        csv += exportFields.map(f => f.label).join(',') + '\n';

        // 准备数据
        data.forEach((row, index) => {
            const values = exportFields.map(field => {
                const value = row[field.field];
                const formatted = this.formatValueForExport(value, field.field);
                // 处理包含逗号的值
                return formatted.includes(',') ? `"${formatted}"` : formatted;
            });
            csv += values.join(',') + '\n';
        });

        // 下载文件
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${fileName}.csv`;
        link.click();
    }

    /**
     * 导出为PDF
     */
    exportToPDF(data, options = {}) {
        const {
            fields = 'core',
            fileName = `招聘流程数据_${new Date().toISOString().split('T')[0]}`
        } = options;

        const exportFields = fields === 'all' 
            ? this.fieldConfig 
            : fields === 'core'
                ? CORE_FIELDS.filter(f => !f.isAction)
                : this.fieldConfig.filter(f => fields.includes(f.field));

        // 使用jsPDF创建PDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4');

        // 添加标题
        doc.setFontSize(16);
        doc.text('招聘流程数据报表', 14, 20);

        // 添加日期
        doc.setFontSize(10);
        doc.text(`生成日期：${new Date().toLocaleString('zh-CN')}`, 14, 30);

        // 准备表格数据
        const headers = exportFields.map(f => f.label);
        const rows = data.map((row, index) => {
            return exportFields.map(field => {
                const value = row[field.field];
                return this.formatValueForExport(value, field.field);
            });
        });

        // 添加表格
        doc.autoTable({
            head: [headers],
            body: rows,
            startY: 40,
            styles: { font: 'helvetica', fontSize: 8 },
            headStyles: { fillColor: [66, 139, 202] },
            alternateRowStyles: { fillColor: [245, 245, 245] }
        });

        // 保存PDF
        doc.save(`${fileName}.pdf`);
    }

    /**
     * 打印数据
     */
    print(data, options = {}) {
        const {
            fields = 'core',
            title = '招聘流程数据'
        } = options;

        const exportFields = fields === 'all' 
            ? this.fieldConfig 
            : fields === 'core'
                ? CORE_FIELDS.filter(f => !f.isAction)
                : this.fieldConfig.filter(f => fields.includes(f.field));

        // 创建打印窗口
        const printWindow = window.open('', '_blank');
        
        // 构建HTML
        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${title}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    h1 { text-align: center; }
                    .meta { text-align: center; margin-bottom: 20px; color: #666; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; font-weight: bold; }
                    tr:nth-child(even) { background-color: #f9f9f9; }
                    @media print {
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <h1>${title}</h1>
                <div class="meta">生成日期：${new Date().toLocaleString('zh-CN')}</div>
                <table>
                    <thead>
                        <tr>
                            ${exportFields.map(f => `<th>${f.label}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(row => `
                            <tr>
                                ${exportFields.map(field => `
                                    <td>${this.formatValueForExport(row[field.field], field.field)}</td>
                                `).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="no-print" style="margin-top: 20px; text-align: center;">
                    <button onclick="window.print()">打印</button>
                    <button onclick="window.close()">关闭</button>
                </div>
            </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
    }

    /**
     * 格式化导出值
     */
    formatValueForExport(value, fieldName) {
        if (value === null || value === undefined) return '';

        // 根据字段名判断格式化方式
        // 日期时间字段（排除 experience 等包含 time 但不是日期的字段）
        if ((fieldName.endsWith('_time') || fieldName === 'created_at' || fieldName === 'updated_at') && !fieldName.includes('experience')) {
            try {
                return new Date(value).toLocaleString('zh-CN');
            } catch (e) {
                return value;
            }
        }
        // 纯日期字段
        if (fieldName.endsWith('_date') && !fieldName.includes('experience')) {
            try {
                return new Date(value).toLocaleDateString('zh-CN');
            } catch (e) {
                return value;
            }
        }
        // 环节
        if (fieldName === 'current_stage') {
            return STAGE_ENUM[value] || value;
        }
        // 状态
        if (fieldName === 'current_status' || fieldName.includes('result')) {
            return STATUS_ENUM[value] || value;
        }
        // 性别
        if (fieldName === 'gender') {
            const genderMap = { male: '男', female: '女', '男': '男', '女': '女' };
            return genderMap[value] || value;
        }
        // 是否报到/接受offer
        if (fieldName === 'is_reported' || fieldName === 'accept_offer') {
            return value === 'yes' ? '是' : value === 'no' ? '否' : '';
        }
        // 拒绝原因
        if (fieldName.includes('reject_reason')) {
            const type = fieldName.includes('first') ? 'first' : 'second';
            const reasons = type === 'first' ? FIRST_REJECT_REASONS : SECOND_REJECT_REASONS;
            return reasons[value] || value;
        }
        // 未报到原因
        if (fieldName === 'no_report_reason') {
            return NO_REPORT_REASONS[value] || value;
        }
        // 数据来源
        if (fieldName === 'source_type') {
            return value === 'sync' ? '同步' : '手动添加';
        }
        // 布尔值
        if (fieldName === 'is_manual_add') {
            return value ? '是' : '否';
        }
        // 关键修复：工作经历字段使用FieldFormatters进行格式化
        if (fieldName === 'work_experience') {
            return FieldFormatters.workExperience(value);
        }
        // 数组/对象转字符串
        if (typeof value === 'object') {
            if (Array.isArray(value)) {
                return value.join(', ');
            }
            return JSON.stringify(value);
        }

        return String(value);
    }

    /**
     * 显示导出对话框
     */
    showExportDialog(data, onExport) {
        const dialog = document.createElement('div');
        dialog.className = 'modal export-dialog';
        dialog.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-container">
                <div class="modal-header">
                    <h3>导出数据</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>导出范围</label>
                        <div class="radio-group">
                            <label><input type="radio" name="exportScope" value="all" checked> 全部数据 (${data.length}条)</label>
                            <label><input type="radio" name="exportScope" value="filtered"> 当前筛选结果</label>
                            <label><input type="radio" name="exportScope" value="selected"> 选中记录</label>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>导出字段</label>
                        <div class="radio-group">
                            <label><input type="radio" name="exportFields" value="all" checked> 全部字段 (${this.fieldConfig.length}个)</label>
                            <label><input type="radio" name="exportFields" value="core"> 仅核心字段 (8个)</label>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>文件格式</label>
                        <div class="radio-group">
                            <label><input type="radio" name="exportFormat" value="xlsx" checked> Excel (.xlsx)</label>
                            <label><input type="radio" name="exportFormat" value="csv"> CSV (.csv)</label>
                            <label><input type="radio" name="exportFormat" value="pdf"> PDF (.pdf)</label>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>文件名</label>
                        <input type="text" id="exportFileName" value="招聘流程数据_${new Date().toISOString().split('T')[0]}" style="width: 100%;">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-cancel">取消</button>
                    <button class="btn-export">确认导出</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // 绑定事件
        dialog.querySelector('.modal-overlay').addEventListener('click', () => dialog.remove());
        dialog.querySelector('.modal-close').addEventListener('click', () => dialog.remove());
        dialog.querySelector('.btn-cancel').addEventListener('click', () => dialog.remove());
        
        dialog.querySelector('.btn-export').addEventListener('click', () => {
            const scope = dialog.querySelector('input[name="exportScope"]:checked').value;
            const fields = dialog.querySelector('input[name="exportFields"]:checked').value;
            const format = dialog.querySelector('input[name="exportFormat"]:checked').value;
            const fileName = dialog.querySelector('#exportFileName').value;

            if (onExport) {
                onExport({
                    scope,
                    fields,
                    format,
                    fileName
                });
            }
            dialog.remove();
        });

        dialog.style.display = 'flex';
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExportManager;
}
