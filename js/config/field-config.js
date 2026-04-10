/**
 * 招聘流程管理模块 - 字段配置文件
 * 整合方案 - 单表结构
 */

// ============================================
// 核心字段配置（列表页面展示）
// ============================================
const CORE_FIELDS = [
    { field: 'name', label: '姓名', width: 100, fixed: true },
    // { field: 'phone', label: '电话', width: 120, format: 'phone' }, // 隐藏电话列，保护隐私
    { field: 'position', label: '应聘岗位', width: 120 },
    { field: 'job_type', label: '工种', width: 100 },
    { field: 'interview_date', label: '面试日期', width: 120, format: 'date' },
    { field: 'interview_time_slot', label: '面试时段', width: 140, format: 'timeSlot' },
    { field: 'current_stage', label: '当前环节', width: 100, format: 'stage' },
    { field: 'current_status', label: '状态', width: 80, format: 'status' },
    { field: 'created_at', label: '创建时间', width: 150, format: 'datetime' },
    { field: 'operation', label: '操作', width: 200, fixed: true, isAction: true }
];

// ============================================
// 详情字段分组配置
// ============================================
const DETAIL_FIELDS = {
    basic: {
        label: '基本信息',
        order: 1,
        fields: [
            { field: 'name', label: '姓名' },
            { field: 'gender', label: '性别', format: 'gender' },
            { field: 'phone', label: '电话' },
            { field: 'age', label: '年龄' },
            { field: 'id_card', label: '身份证号' },
            { field: 'email', label: '邮箱' },
            { field: 'birth_date', label: '出生日期', format: 'date' },
            { field: 'education', label: '学历' },
            { field: 'experience', label: '工作经验' },
            { field: 'current_residence', label: '现居住地' },
            { field: 'hometown', label: '籍贯' },
            { field: 'marital_status', label: '婚姻状况', format: 'maritalStatus' },
            { field: 'political_status', label: '政治面貌' },
            { field: 'health_status', label: '健康状况' }
        ]
    },
    application: {
        label: '应聘信息',
        order: 2,
        fields: [
            { field: 'position', label: '应聘岗位' },
            { field: 'position_name', label: '岗位名称' },
            { field: 'job_type', label: '工种' },
            { field: 'salary_expectation', label: '薪资期望' },
            { field: 'skills', label: '技能特长' },
            { field: 'work_experience', label: '工作经历', format: 'workExperience' },
            { field: 'self_evaluation', label: '自我评价' },
            { field: 'career_plan', label: '职业规划' }
        ]
    },
    contact: {
        label: '紧急联系人',
        order: 3,
        fields: [
            { field: 'emergency_contact', label: '联系人姓名' },
            { field: 'emergency_phone', label: '联系人电话' }
        ]
    },
    interview: {
        label: '面试预约信息',
        order: 4,
        fields: [
            { field: 'interview_date', label: '面试日期', format: 'date' },
            { field: 'interview_time_slot', label: '面试时段', format: 'timeSlot' }
        ]
    },
    firstInterview: {
        label: '初试信息',
        order: 5,
        fields: [
            { field: 'first_interview_time', label: '初试时间', format: 'datetime' },
            { field: 'first_interviewer', label: '初试官' },
            { field: 'first_interview_result', label: '初试结果', format: 'result' },
            { field: 'first_reject_reason', label: '未通过原因', format: 'firstRejectReason' },
            { field: 'first_reject_detail', label: '详细说明' }
        ]
    },
    secondInterview: {
        label: '复试信息',
        order: 6,
        fields: [
            { field: 'second_interview_time', label: '复试时间', format: 'datetime' },
            { field: 'second_interviewer', label: '复试官' },
            { field: 'second_interview_result', label: '复试结果', format: 'result' },
            { field: 'hire_department', label: '录用部门' },
            { field: 'hire_position', label: '录用岗位' },
            { field: 'job_title', label: '职务' },
            { field: 'job_level', label: '职级' },
            { field: 'hire_salary', label: '录用薪资' },
            { field: 'hire_date', label: '预计入职日期', format: 'date' },
            { field: 'second_reject_reason', label: '未通过原因', format: 'secondRejectReason' },
            { field: 'second_reject_detail', label: '详细说明' }
        ]
    },
    hireStatus: {
        label: '录用状态',
        order: 7,
        fields: [
            { field: 'accept_offer', label: '是否接受offer', format: 'yesno' },
            { field: 'offer_reject_reason', label: '拒绝原因' },
            { field: 'current_stage', label: '当前环节', format: 'stage' },
            { field: 'current_status', label: '当前状态', format: 'status' }
        ]
    },
    onboarding: {
        label: '报到信息',
        order: 8,
        fields: [
            { field: 'is_reported', label: '是否报到', format: 'yesno' },
            { field: 'report_date', label: '报到日期', format: 'date' },
            { field: 'no_report_reason', label: '未报到原因', format: 'noReportReason' },
            { field: 'no_report_detail', label: '详细说明' }
        ]
    },
    system: {
        label: '系统信息',
        order: 9,
        fields: [
            { field: 'created_at', label: '创建时间', format: 'datetime' },
            { field: 'updated_at', label: '更新时间', format: 'datetime' },
            { field: 'source_type', label: '数据来源', format: 'sourceType' },
            { field: 'is_manual_add', label: '是否手动添加', format: 'boolean' }
        ]
    }
};

// ============================================
// 导出字段配置（全部字段）
// ============================================
const EXPORT_FIELDS = [
    { field: 'id', label: 'ID' },
    { field: 'application_id', label: '应聘ID' },
    { field: 'name', label: '姓名' },
    { field: 'gender', label: '性别' },
    { field: 'phone', label: '电话' },
    { field: 'id_card', label: '身份证号' },
    { field: 'age', label: '年龄' },
    { field: 'position', label: '应聘岗位' },
    { field: 'job_type', label: '工种' },
    { field: 'education', label: '学历' },
    { field: 'experience', label: '工作经验' },
    { field: 'skills', label: '技能' },
    { field: 'work_experience', label: '工作经历' },
    { field: 'salary_expectation', label: '薪资期望' },
    { field: 'notes', label: '备注' },
    { field: 'current_stage', label: '当前环节' },
    { field: 'current_status', label: '当前状态' },
    { field: 'first_interview_time', label: '初试时间' },
    { field: 'first_interviewer', label: '初试官' },
    { field: 'first_interview_result', label: '初试结果' },
    { field: 'first_reject_reason', label: '初试未通过原因' },
    { field: 'first_reject_detail', label: '初试未通过详情' },
    { field: 'second_interview_time', label: '复试时间' },
    { field: 'second_interviewer', label: '复试官' },
    { field: 'second_interview_result', label: '复试结果' },
    { field: 'second_reject_reason', label: '复试未通过原因' },
    { field: 'second_reject_detail', label: '复试未通过详情' },
    { field: 'hire_department', label: '录用部门' },
    { field: 'hire_position', label: '录用岗位' },
    { field: 'job_title', label: '职务' },
    { field: 'job_level', label: '职级' },
    { field: 'hire_salary', label: '录用薪资' },
    { field: 'accept_offer', label: '是否接受offer' },
    { field: 'offer_reject_reason', label: '拒绝offer原因' },
    { field: 'hire_date', label: '预计入职日期' },
    { field: 'is_reported', label: '是否报到' },
    { field: 'report_date', label: '报到日期' },
    { field: 'no_report_reason', label: '未报到原因' },
    { field: 'no_report_detail', label: '未报到详情' },
    { field: 'created_at', label: '创建时间' },
    { field: 'updated_at', label: '更新时间' },
    { field: 'created_by', label: '创建人' },
    { field: 'updated_by', label: '更新人' },
    { field: 'source_type', label: '数据来源' },
    { field: 'is_manual_add', label: '是否手动添加' }
];

// ============================================
// 状态枚举定义
// ============================================
const STAGE_ENUM = {
    application: '投递简历',
    first_interview: '初试',
    second_interview: '复试',
    hired: '录用',
    onboarded: '已报到'
};

const STATUS_ENUM = {
    pending: '待处理',
    pass: '通过',
    reject: '不通过',
    // 关键修复：添加数据库中实际存储的英文状态映射
    passed: '通过',
    rejected: '已拒绝',
    completed: '已完成',
    // 中文状态映射（防止重复转换）
    '待处理': '待处理',
    '通过': '通过',
    '不通过': '不通过',
    '已拒绝': '已拒绝',
    '已完成': '已完成'
};

// ============================================
// 未通过原因枚举定义
// ============================================
const FIRST_REJECT_REASONS = {
    skill_mismatch: '技能不符合要求',
    experience_lack: '经验不足',
    salary_high: '薪资期望过高',
    stability_low: '稳定性差',
    attitude_issue: '态度问题',
    other: '其他'
};

const SECOND_REJECT_REASONS = {
    professional_weak: '专业能力不足',
    comprehensive_poor: '综合素质不符',
    teamwork_poor: '团队协作能力差',
    salary_disagree: '薪资无法达成一致',
    other: '其他'
};

const NO_REPORT_REASONS = {
    medical_fail: '体检未通过',
    no_medical: '未去体检',
    salary_issue: '因薪资原因放弃',
    other: '其他'
};

// ============================================
// 数据格式化工具函数
// ============================================
const FieldFormatters = {
    // 格式化手机号（脱敏）
    phone(value) {
        if (!value) return '-';
        return value.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
    },

    // 格式化环节
    stage(value) {
        return STAGE_ENUM[value] || value || '-';
    },

    // 格式化状态
    status(value) {
        return STATUS_ENUM[value] || value || '-';
    },

    // 格式化日期时间
    datetime(value) {
        if (!value) return '-';
        return new Date(value).toLocaleString('zh-CN');
    },

    // 格式化日期
    date(value) {
        if (!value) return '-';
        return new Date(value).toLocaleDateString('zh-CN');
    },

    // 格式化性别
    gender(value) {
        const map = { male: '男', female: '女' };
        return map[value] || value || '-';
    },

    // 格式化结果
    result(value) {
        const map = { pass: '通过', reject: '不通过', pending: '待处理' };
        return map[value] || value || '-';
    },

    // 格式化未通过原因
    rejectReason(value, type = 'first') {
        if (!value) return '-';
        const reasons = type === 'first' ? FIRST_REJECT_REASONS : SECOND_REJECT_REASONS;
        return reasons[value] || value;
    },

    // 格式化初试未通过原因
    firstRejectReason(value) {
        if (!value) return '-';
        return FIRST_REJECT_REASONS[value] || value;
    },

    // 格式化复试未通过原因
    secondRejectReason(value) {
        if (!value) return '-';
        return SECOND_REJECT_REASONS[value] || value;
    },

    // 格式化是否报到
    yesno(value) {
        if (value === 'yes') return '是';
        if (value === 'no') return '否';
        return '-';
    },

    // 格式化未报到原因
    noReportReason(value) {
        if (!value) return '-';
        return NO_REPORT_REASONS[value] || value;
    },

    // 格式化数据来源
    sourceType(value) {
        const map = { sync: '同步', manual: '手动添加' };
        return map[value] || value || '-';
    },

    // 格式化布尔值
    boolean(value) {
        return value ? '是' : '否';
    },

    // 格式化婚姻状况
    maritalStatus(value) {
        const map = { single: '未婚', married: '已婚', divorced: '离异', widowed: '丧偶' };
        return map[value] || value || '-';
    },

    // 格式化面试时段 - 与预约管理模块保持一致
    timeSlot(value) {
        if (!value) return '-';
        // 统一的时段映射定义（与admin-standalone.html中的TIME_SLOTS保持一致）
        const slotMap = {
            'slot_1': '上午场 09:00-10:00',
            'slot_2': '上午场 10:00-10:30',
            'slot_3': '下午场 13:00-14:00',
            'slot_4': '下午场 14:00-15:00',
            'slot_5': '下午场 15:00-15:30',
            // 兼容旧数据格式
            'morning': '上午场 09:00-10:00',
            'afternoon': '下午场 14:00-15:00',
            'evening': '晚上 18:00-21:00',
            'am': '上午场 09:00-10:00',
            'pm': '下午场 14:00-15:00'
        };
        return slotMap[value] || value;
    },

    // 格式化工作经历
    workExperience(value) {
        if (!value) return '-';

        // 如果是字符串，尝试解析为JSON
        let experiences = value;
        if (typeof value === 'string') {
            try {
                experiences = JSON.parse(value);
            } catch (e) {
                // 解析失败，返回原字符串
                return value;
            }
        }

        // 如果不是数组，返回原值
        if (!Array.isArray(experiences)) {
            return value;
        }

        // 格式化每条工作经历
        const formattedExperiences = experiences.map(exp => {
            const company = exp.company || '';
            const position = exp.position || '';
            const startDate = exp.startDate || '';
            const endDate = exp.endDate || '';
            const isCurrent = exp.isCurrent;
            const leaveReason = exp.leaveReason || '';
            const responsibilities = exp.responsibilities || '';

            // 构建时间范围显示
            let timeRange = '';
            if (startDate) {
                timeRange = startDate;
                if (endDate) {
                    timeRange += ` 至 ${endDate}`;
                } else if (isCurrent) {
                    timeRange += ' 至今';
                }
            }

            // 构建完整的工作经历描述
            let description = '';
            if (company) {
                description += company;
            }
            if (position) {
                description += company ? ` - ${position}` : position;
            }
            if (timeRange) {
                description += description ? ` (${timeRange})` : timeRange;
            }
            if (leaveReason && leaveReason !== '个人原因') {
                description += ` [离职原因: ${leaveReason}]`;
            }
            if (responsibilities) {
                description += `\n工作职责: ${responsibilities}`;
            }

            return description || '工作经历信息不完整';
        });

        return formattedExperiences.join('\n\n');
    },

    // 通用格式化
    format(value, formatType) {
        if (!formatType) return value || '-';
        const formatter = this[formatType];
        return formatter ? formatter(value) : (value || '-');
    }
};

// 导出配置（如果在模块环境中）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CORE_FIELDS,
        DETAIL_FIELDS,
        EXPORT_FIELDS,
        STAGE_ENUM,
        STATUS_ENUM,
        FIRST_REJECT_REASONS,
        SECOND_REJECT_REASONS,
        NO_REPORT_REASONS,
        FieldFormatters
    };
}