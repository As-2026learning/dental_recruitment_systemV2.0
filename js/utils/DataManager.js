/**
 * 招聘流程数据管理器
 * 负责数据的加载、同步、筛选和导出
 */
class RecruitmentDataManager {
    constructor(client) {
        this.client = client;
        this.allData = [];
        this.filteredData = [];
        this.totalCount = 0;
        this.filters = {};
        this.currentPage = 1;
        this.pageSize = 10;
    }

    /**
     * 从applications表同步数据到recruitment_process表
     * 【优化】支持增量同步，减少不必要的数据传输
     */
    async syncFromApplications(forceFull = false) {
        try {
            // 【优化】检查是否需要全量同步（基于缓存的上次同步时间）
            const lastSyncTime = this._getLastSyncTime();
            const needFullSync = forceFull || !lastSyncTime;
            
            // 【优化】增量同步：只获取上次同步后更新的记录
            let appQuery = this.client.from('applications').select('*');
            if (!needFullSync && lastSyncTime) {
                appQuery = appQuery.gt('updated_at', lastSyncTime);
            }
            
            // 【优化】并行获取数据，但只获取必要字段
            const [applicationsResult, bookingsResult, existingRpResult] = await Promise.all([
                appQuery.order('created_at', { ascending: false }),
                this.client.from('bookings').select('id, application_id, status'),
                this.client.from('recruitment_process').select('id, application_id, name, source_status, current_stage, current_status, updated_at')
            ]);
            
            // 【优化】如果没有更新的数据，直接返回
            if (!needFullSync && (!applicationsResult.data || applicationsResult.data.length === 0)) {
                return { success: true, message: '没有需要同步的新数据', count: 0, inserted: 0, updated: 0 };
            }

            const { data: applications, error: appError } = applicationsResult;
            const { data: bookings, error: bookingError } = bookingsResult;
            const { data: existingRpData, error: rpError } = existingRpResult;

            if (appError) throw appError;
            if (!applications || applications.length === 0) {
                return { success: true, message: 'applications表中没有数据需要同步', count: 0 };
            }

            if (bookingError) {
                console.error('获取bookings数据失败:', bookingError);
            }
            if (rpError) {
                console.error('获取recruitment_process数据失败:', rpError);
            }

            // 构建application_id到booking状态的映射
            const bookingStatusMap = new Map();
            (bookings || []).forEach(booking => {
                if (booking.application_id) {
                    bookingStatusMap.set(booking.application_id, booking.status);
                }
            });

            // 构建application_id到recruitment_process数据的映射（同时用于合并和检查存在性）
            // 关键修复：使用字符串作为key，避免类型不匹配问题
            const rpDataMap = new Map();
            const existingAppMap = new Map();
            const existingNameMap = new Map(); // 新增：按姓名查找已存在的记录
            (existingRpData || []).forEach(rp => {
                if (rp.application_id) {
                    // 统一转换为字符串作为key
                    const appIdStr = String(rp.application_id);
                    rpDataMap.set(appIdStr, rp);
                    existingAppMap.set(appIdStr, rp);
                }
                // 同时按姓名存储，用于匹配application_id为null的记录
                if (rp.name) {
                    existingNameMap.set(rp.name, rp);
                }
            });

            console.log(`找到 ${rpDataMap.size} 条已有的招聘流程数据用于合并`);
            console.log('已有的 application_id 列表:', Array.from(existingAppMap.keys()).slice(0, 10));
            console.log('按姓名查找的记录数:', existingNameMap.size);

            // 【修复】只过滤已取消、已拒绝的数据，保留已确认已处理的数据
            // 关键修复：从多个可能的位置获取状态
            const validApplications = applications.filter(app => {
                // 1. 首先检查 app.status
                let appStatus = app.status || '';
                
                // 2. 如果 app.status 为空，检查 form_data、fields、dynamic_fields
                if (!appStatus) {
                    const dataFields = app.form_data || app.fields || app.dynamic_fields || {};
                    const statusFields = ['status', '应聘状态', '申请状态', 'state'];
                    for (const field of statusFields) {
                        if (dataFields[field]) {
                            appStatus = dataFields[field];
                            break;
                        }
                    }
                }
                
                const isAppCancelled =
                    appStatus === '已取消' || appStatus === 'cancelled' || appStatus === 'canceled' ||
                    appStatus === 'cancel' || appStatus === '已撤销' || appStatus === '撤销';
                const isAppRejected =
                    appStatus === '已拒绝' || appStatus === 'rejected' || appStatus === 'reject' ||
                    appStatus === '拒绝' || appStatus === '不通过' || appStatus === '未通过';
                
                // 只过滤已取消和已拒绝，保留已确认、已处理等其他状态
                const isValid = !(isAppCancelled || isAppRejected);
                
                // 调试：记录特定记录和过滤的记录
                if (app.name === '11' || app.name === '15') {
                    console.log(`【过滤调试】记录: ${app.name} (ID: ${app.id}), 状态: ${appStatus}, 是否有效: ${isValid}`);
                }
                if (!isValid) {
                    console.log(`过滤记录: ${app.name} (ID: ${app.id}), 状态: ${appStatus}`);
                }
                
                return isValid;
            });

            console.log(`原始记录数: ${applications.length}, 有效记录数: ${validApplications.length}, 已过滤记录数: ${applications.length - validApplications.length}`);

            // 4. 准备要插入的新记录和要更新的记录
            const newRecords = [];
            const updateRecords = [];

            for (const app of validApplications) {
                // 检查 app.id 是否有效
                if (!app.id || app.id === null || app.id === 'null') {
                    console.warn(`跳过无效记录: app.id 为 null 或 undefined, app.name: ${app.name}`);
                    continue;
                }
                
                // 关键修复：使用字符串作为key
                const appIdStr = String(app.id);
                
                // 调试：追踪特定记录（11和15）
                if (app.name === '11' || app.name === '15') {
                    console.log(`【调试】处理记录: ${app.name} (ID: ${app.id}, 类型: ${typeof app.id})`);
                    console.log(`【调试】appIdStr: ${appIdStr}`);
                    console.log(`【调试】existingAppMap 是否包含:`, existingAppMap.has(appIdStr));
                }
                
                // 从dynamic_fields中提取数据
                const dynamicFields = app.dynamic_fields || app.form_data || app.fields || {};

                // 辅助函数：从dynamicFields或app根级别获取字段值（支持多种字段名）
                const getFieldValue = (fieldNames) => {
                    // 首先检查dynamicFields
                    for (const name of fieldNames) {
                        if (dynamicFields[name] !== undefined && dynamicFields[name] !== null && dynamicFields[name] !== '') {
                            return dynamicFields[name];
                        }
                    }
                    // 然后检查app根级别字段
                    for (const name of fieldNames) {
                        if (app[name] !== undefined && app[name] !== null && app[name] !== '') {
                            return app[name];
                        }
                    }
                    // 最后检查form_data字段（有些数据可能存储在form_data中）
                    const formData = app.form_data || {};
                    for (const name of fieldNames) {
                        if (formData[name] !== undefined && formData[name] !== null && formData[name] !== '') {
                            return formData[name];
                        }
                    }
                    return null;
                };

                // 获取身份证号码（支持多种存储位置：app.id_card, form_data.id_card, dynamic_fields.id_card）
                let idCard = app.id_card || app.form_data?.id_card || app.dynamic_fields?.id_card;
                if (!idCard) {
                    idCard = getFieldValue([
                        'id_card', 'ID_card', 'ID Card', 'ID card', 'idcard', 'IDCard',
                        '身份证', '身份证号', '身份证号码',
                        'idCard', 'IdCard'
                    ]);
                }
                
                // 获取工种
                const jobType = getFieldValue([
                    'job_type', 'jobType', 'Job Type', 'job type',
                    '工种', '职位类型', '工作类型'
                ]) || app.job_type;
                
                // 获取技能
                const skills = getFieldValue([
                    'skills', 'Skills', 'SKILLS',
                    '技能', '专业技能', '技术技能'
                ]);
                
                // 获取工作经验（详细的职业经历描述，不是年限）
                let workExperience = getFieldValue([
                    'work_experience', 'work experience', 'Work_Experience', 'Work Experience', 'WORK_EXPERIENCE',
                    '工作经历', '工作履历', '履历',
                    'employment_history', 'Employment History', 'employment history',
                    'career_history', 'Career History', 'career history',
                    'previous_jobs', 'Previous Jobs', 'previous jobs', '以往工作'
                ]);

                // 获取工作年限（experience字段可能存储在dynamicFields中）
                let experience = app.experience || getFieldValue([
                    'experience', 'Experience', 'EXPERIENCE',
                    'related experience', 'Related Experience', 'Related experience',
                    '工作年限', '工作经验年限', '年限', '相关工作经验',
                    '工作年数', '从业年限'
                ]);
                
                // 过滤：如果 workExperience 看起来像年限（如"3-5年"），则清空
                if (workExperience && typeof workExperience === 'string') {
                    const looksLikeYears = /^[0-9]+[-+]?[0-9]*年/.test(workExperience) || 
                                          /^[0-9]+[-+]?[0-9]*个月/.test(workExperience) ||
                                          /年限/.test(workExperience);
                    if (looksLikeYears) {
                        console.log(`  过滤：workExperience "${workExperience}" 看起来像年限，已清空`);
                        workExperience = null;
                    }
                }
                
                // 获取招聘渠道（支持多种字段名）
                let sourceChannel = getFieldValue([
                    'source_channel', 'Source_channel', 'Source Channel', 'source channel',
                    'recruitment_channel', 'Recruitment_channel', 'Recruitment Channel',
                    'channel', 'Channel', 'CHANNEL',
                    '招聘渠道', '渠道', '来源渠道', '应聘渠道'
                ]);
                
                // 调试：打印数据获取情况
                console.log('同步记录 - 姓名:', app.name, 'ID:', app.id);
                console.log('  app.id_card:', app.id_card);
                console.log('  app.form_data?.id_card:', app.form_data?.id_card);
                console.log('  app.dynamic_fields?.id_card:', app.dynamic_fields?.id_card);
                console.log('  dynamicFields 所有键:', Object.keys(dynamicFields));
                console.log('  dynamicFields 完整内容:', JSON.stringify(dynamicFields, null, 2));
                // 查找所有可能包含身份证号的字段
                const possibleIdCardFields = ['id_card', 'ID_card', 'ID card', 'idCard', 'IDCard', '身份证', '身份证号', '身份证号码'];
                possibleIdCardFields.forEach(field => {
                    if (dynamicFields[field]) {
                        console.log(`  找到身份证号字段 [${field}]:`, dynamicFields[field]);
                    }
                    if (app[field]) {
                        console.log(`  找到身份证号字段 app[${field}]:`, app[field]);
                    }
                });
                // 查找所有可能包含工作年限的字段
                const possibleExpFields = ['experience', 'Experience', 'related experience', 'Related Experience', '工作年限', '相关工作经验'];
                possibleExpFields.forEach(field => {
                    if (dynamicFields[field]) {
                        console.log(`  找到工作年限字段 [${field}]:`, dynamicFields[field]);
                    }
                });
                console.log('  结果 -> jobType:', jobType, 'idCard:', idCard || '无', 'experience:', app.experience, 'skills:', skills ? '有' : '无', 'workExperience:', workExperience ? '有' : '无', 'sourceChannel:', sourceChannel);
                
                // 关键修复：合并recruitment_process表中的数据（初试/复试信息）
                const rpData = rpDataMap.get(appIdStr);
                if (rpData) {
                    console.log(`  合并recruitment_process数据:`, {
                        first_interview_time: rpData.first_interview?.time || rpData.first_interview_time,
                        first_interview_result: rpData.first_interview?.result || rpData.first_interview_result,
                        second_interview_time: rpData.second_interview?.time || rpData.second_interview_time,
                        second_interview_result: rpData.second_interview?.result || rpData.second_interview_result,
                        current_stage: rpData.current_stage,
                        current_status: rpData.current_status,
                        accept_offer: rpData.accept_offer,
                        hire_info: rpData.hire_info
                    });

                    // 合并初试信息
                    if (rpData.first_interview?.time || rpData.first_interview_time) {
                        app.first_interview_time = rpData.first_interview?.time || rpData.first_interview_time;
                    }
                    if (rpData.first_interview?.interviewer || rpData.first_interviewer) {
                        app.first_interviewer = rpData.first_interview?.interviewer || rpData.first_interviewer;
                    }
                    if (rpData.first_interview?.result || rpData.first_interview_result) {
                        app.first_interview_result = rpData.first_interview?.result || rpData.first_interview_result;
                    }
                    
                    // 【修复】合并 current_stage 和 current_status，确保已处理的记录显示正确的环节
                    if (rpData.current_stage) {
                        app.current_stage = rpData.current_stage;
                    }
                    if (rpData.current_status) {
                        app.current_status = rpData.current_status;
                    }

                    // 合并复试信息
                    if (rpData.second_interview?.time || rpData.second_interview_time) {
                        app.second_interview_time = rpData.second_interview?.time || rpData.second_interview_time;
                    }
                    if (rpData.second_interview?.interviewer || rpData.second_interviewer) {
                        app.second_interviewer = rpData.second_interview?.interviewer || rpData.second_interviewer;
                    }
                    if (rpData.second_interview?.result || rpData.second_interview_result) {
                        app.second_interview_result = rpData.second_interview?.result || rpData.second_interview_result;
                    }

                    // 合并录用信息
                    if (rpData.hire_department) app.hire_department = rpData.hire_department;
                    if (rpData.hire_position) app.hire_position = rpData.hire_position;
                    // 关键修复：合并职务和职级字段
                    if (rpData.job_title) app.job_title = rpData.job_title;
                    if (rpData.job_level) app.job_level = rpData.job_level;
                    if (rpData.hire_salary) app.hire_salary = rpData.hire_salary;
                    if (rpData.hire_date) app.hire_date = rpData.hire_date;
                    // 关键修复：accept_offer 可能是 'yes'、'no'、'是'、'否' 等，需要正确处理
                    // 同时支持 rpData.accept_offer 和 rpData.hire_info.accept_offer
                    let acceptOfferValue = rpData.accept_offer;
                    if ((acceptOfferValue === undefined || acceptOfferValue === null || acceptOfferValue === '') && rpData.hire_info) {
                        acceptOfferValue = rpData.hire_info.accept_offer;
                    }
                    if (acceptOfferValue !== undefined && acceptOfferValue !== null && acceptOfferValue !== '') {
                        app.accept_offer = acceptOfferValue;
                        console.log(`    合并 accept_offer: ${acceptOfferValue} (类型: ${typeof acceptOfferValue})`);
                    }
                    // 关键修复：合并拒绝原因
                    if (rpData.offer_reject_reason) app.offer_reject_reason = rpData.offer_reject_reason;
                    // 关键修复：is_reported 可能是布尔值、字符串或数字，需要正确处理
                    if (rpData.is_reported !== undefined && rpData.is_reported !== null) {
                        app.is_reported = rpData.is_reported;
                        console.log(`    合并 is_reported: ${rpData.is_reported} (类型: ${typeof rpData.is_reported})`);
                    }
                    if (rpData.report_date) {
                        app.report_date = rpData.report_date;
                        console.log(`    合并 report_date: ${rpData.report_date}`);
                    }
                    // 关键修复：合并未报到原因
                    if (rpData.no_report_reason !== undefined && rpData.no_report_reason !== null) {
                        app.no_report_reason = rpData.no_report_reason;
                        console.log(`    合并 no_report_reason: ${rpData.no_report_reason}`);
                    }
                }

                // 使用之前定义的 appIdStr 进行比较
                let existingRecord = existingAppMap.get(appIdStr);
                
                // 如果按application_id找不到，尝试按姓名查找
                if (!existingRecord && app.name) {
                    existingRecord = existingNameMap.get(app.name);
                    if (existingRecord) {
                        console.log(`【调试】按姓名找到记录: ${app.name}，更新application_id从${existingRecord.application_id}到${app.id}`);
                        // 更新记录的application_id
                        existingRecord.application_id = app.id;
                    }
                }
                
                // 调试：追踪特定记录
                if (app.name === '11' || app.name === '15') {
                    console.log(`【调试】检查 existingRecord:`, existingRecord ? '存在' : '不存在');
                    if (existingRecord) {
                        console.log(`【调试】existingRecord.id:`, existingRecord.id, `application_id:`, existingRecord.application_id);
                    }
                }
                
                if (existingRecord) {
                    // 检查 existingRecord.id 是否有效
                    if (!existingRecord.id || existingRecord.id === null || existingRecord.id === 'null') {
                        console.warn(`跳过无效记录: existingRecord.id 为 null 或 undefined, app.name: ${app.name}, app.id: ${app.id}`);
                        continue;
                    }
                    
                    // 已有记录，更新所有字段（如果新值不为空）
                    const updateData = { id: existingRecord.id };
                    let needUpdate = false;
                    
                    // 辅助函数：检查值是否有效（不为null、undefined、空字符串）
                    const isValidValue = (value) => {
                        return value !== null && value !== undefined && value !== '';
                    };
                    
                    if (isValidValue(jobType)) {
                        updateData.job_type = jobType;
                        needUpdate = true;
                    }
                    if (isValidValue(idCard)) {
                        updateData.id_card = idCard;
                        needUpdate = true;
                    }
                    if (isValidValue(skills)) {
                        updateData.skills = skills;
                        needUpdate = true;
                    }
                    if (isValidValue(experience)) {
                        updateData.experience = experience;
                        needUpdate = true;
                    }
                    if (isValidValue(workExperience)) {
                        updateData.work_experience = workExperience;
                        needUpdate = true;
                    }
                    if (isValidValue(sourceChannel)) {
                        updateData.source_channel = sourceChannel;
                        needUpdate = true;
                    }
                    
                    // 关键修复：根据数据状态重新计算 current_stage 和 current_status
                    const stageInfo = this.determineStageFromData(app);
                    
                    // 关键修复：同步更新 source_status
                    const newSourceStatus = (() => {
                        if (app.status && app.status !== '') {
                            return app.status.toString().substring(0, 50);
                        }
                        const dynamicFields = app.dynamic_fields || app.form_data || app.fields || {};
                        const statusFields = ['status', '应聘状态', '申请状态', 'state'];
                        for (const field of statusFields) {
                            if (dynamicFields[field] && dynamicFields[field] !== '') {
                                return dynamicFields[field].toString().substring(0, 50);
                            }
                        }
                        return 'pending';
                    })();
                    
                    if (newSourceStatus !== existingRecord.source_status) {
                        updateData.source_status = newSourceStatus;
                        needUpdate = true;
                        console.log(`更新 source_status: ${app.name} (ID: ${app.id}) 从 "${existingRecord.source_status}" 到 "${newSourceStatus}"`);
                    }
                    
                    // 如果环节或状态发生变化，需要更新
                    if (stageInfo.stage !== existingRecord.current_stage) {
                        updateData.current_stage = stageInfo.stage;
                        needUpdate = true;
                        console.log(`更新环节: ${app.name} (ID: ${app.id}) 从 "${existingRecord.current_stage}" 到 "${stageInfo.stage}"`);
                    }
                    
                    if (stageInfo.status !== existingRecord.current_status) {
                        updateData.current_status = stageInfo.status;
                        needUpdate = true;
                        console.log(`更新状态: ${app.name} (ID: ${app.id}) 从 "${existingRecord.current_status}" 到 "${stageInfo.status}"`);
                    }
                    
                    // 同步更新面试日期和时段
                    if (isValidValue(app.interview_date)) {
                        updateData.interview_date = app.interview_date;
                        needUpdate = true;
                    }
                    if (isValidValue(app.interview_time_slot)) {
                        updateData.interview_time_slot = app.interview_time_slot;
                        needUpdate = true;
                    }
                    
                    // 关键修复：同步更新报到信息
                    if (app.is_reported !== undefined && app.is_reported !== null) {
                        updateData.is_reported = app.is_reported;
                        needUpdate = true;
                    }
                    if (isValidValue(app.report_date)) {
                        updateData.report_date = app.report_date;
                        needUpdate = true;
                    }
                    // 关键修复：同步更新未报到原因
                    if (app.no_report_reason !== undefined && app.no_report_reason !== null) {
                        updateData.no_report_reason = app.no_report_reason;
                        needUpdate = true;
                    }

                    if (needUpdate) {
                        updateRecords.push(updateData);
                    }
                } else {
                    // 新记录 - 根据数据状态确定正确的环节
                    const stageInfo = this.determineStageFromData(app);
                    
                    // 调试：追踪特定记录
                    if (app.name === '11' || app.name === '15') {
                        console.log(`【调试】进入else分支（新记录）: ${app.name} (ID: ${app.id})`);
                        console.log(`【调试】stageInfo:`, stageInfo);
                    }
                    
                    newRecords.push({
                        application_id: app.id,
                        name: app.name,
                        gender: app.gender,
                        phone: app.phone,
                        age: app.age,
                        id_card: idCard,
                        email: app.email,
                        birth_date: app.birth_date,
                        position: app.position,
                        job_type: jobType,
                        education: app.education,
                        experience: experience,
                        current_residence: app.current_residence,
                        hometown: app.hometown,
                        marital_status: app.marital_status,
                        political_status: app.political_status,
                        health_status: app.health_status,
                        skills: skills,
                        work_experience: workExperience,
                        salary_expectation: app.salary_expectation,
                        self_evaluation: app.self_evaluation,
                        career_plan: app.career_plan,
                        emergency_contact: app.emergency_contact,
                        emergency_phone: app.emergency_phone,
                        notes: app.notes,
                        dynamic_fields: app.dynamic_fields,
                        first_interview: {
                            time: app.first_interview_time,
                            interviewer: app.first_interviewer,
                            result: app.first_interview_result,
                            reject_reason: app.first_reject_reason,
                            reject_detail: app.first_reject_detail
                        },
                        // 关键修复：从多个可能的位置获取应聘状态
                        source_status: (() => {
                            // 1. 首先检查 app.status
                            if (app.status && app.status !== '') {
                                return app.status.toString().substring(0, 50);
                            }
                            // 2. 检查 dynamic_fields
                            const dynamicFields = app.dynamic_fields || app.form_data || app.fields || {};
                            const statusFields = ['status', '应聘状态', '申请状态', 'state'];
                            for (const field of statusFields) {
                                if (dynamicFields[field] && dynamicFields[field] !== '') {
                                    return dynamicFields[field].toString().substring(0, 50);
                                }
                            }
                            // 3. 默认为 pending
                            return 'pending';
                        })(),
                        source_channel: sourceChannel || app.source_channel,
                        current_stage: stageInfo.stage,
                        current_status: stageInfo.status,
                        source_type: 'sync',
                        is_manual_add: false,
                        created_at: app.created_at,
                        updated_at: app.updated_at
                    });
                    
                    // 调试：追踪特定记录
                    if (app.name === '11' || app.name === '15') {
                        console.log(`【调试】已添加到newRecords: ${app.name} (ID: ${app.id}), 当前数组长度: ${newRecords.length}`);
                    }
                }
            }

            // 5. 批量插入新记录
            let insertedCount = 0;
            
            // 调试：检查11和15是否在newRecords中
            console.log(`【调试】newRecords数组长度: ${newRecords.length}`);
            const debugRecords = newRecords.filter(r => r.name === '11' || r.name === '15');
            if (debugRecords.length > 0) {
                console.log('【调试】newRecords中包含11或15:', debugRecords.map(r => ({name: r.name, id: r.application_id})));
            } else {
                console.log('【调试】newRecords中不包含11或15');
            }
            
            if (newRecords.length > 0) {
                console.log(`准备插入 ${newRecords.length} 条新记录`);
                
                // 字段长度限制验证和截断
                const MAX_FIELD_LENGTHS = {
                    source_status: 50,
                    source_channel: 50,
                    name: 100,
                    phone: 20,
                    position: 100,
                    job_type: 50,
                    id_card: 18,
                    email: 100
                };
                
                const validatedRecords = newRecords.map(record => {
                    const validated = { ...record };
                    Object.entries(MAX_FIELD_LENGTHS).forEach(([field, maxLength]) => {
                        if (validated[field] && typeof validated[field] === 'string' && validated[field].length > maxLength) {
                            console.warn(`字段 ${field} 长度超过限制 (${validated[field].length} > ${maxLength})，已截断`);
                            validated[field] = validated[field].substring(0, maxLength);
                        }
                    });
                    return validated;
                });
                
                const { data: inserted, error: insertError } = await this.client
                    .from('recruitment_process')
                    .insert(validatedRecords)
                    .select();

                if (insertError) {
                    console.error('插入新记录失败:', insertError);
                    console.error('错误详情:', JSON.stringify(insertError, null, 2));
                    // 调试：打印前3条要插入的记录
                    console.error('要插入的记录示例:', JSON.stringify(validatedRecords.slice(0, 3), null, 2));
                    
                    // 调试：检查11和15是否在validatedRecords中
                    const debugValidated = validatedRecords.filter(r => r.name === '11' || r.name === '15');
                    if (debugValidated.length > 0) {
                        console.error('【调试】validatedRecords中包含11或15:', debugValidated.map(r => ({name: r.name, id: r.application_id})));
                    }
                } else {
                    insertedCount = inserted ? inserted.length : 0;
                    console.log(`成功同步 ${insertedCount} 条新记录`);
                    
                    // 调试：检查11和15是否被插入
                    const debugInserted = inserted.filter(r => r.name === '11' || r.name === '15');
                    if (debugInserted.length > 0) {
                        console.log('【调试】成功插入11或15:', debugInserted.map(r => ({name: r.name, id: r.application_id})));
                    } else if (validatedRecords.some(r => r.name === '11' || r.name === '15')) {
                        console.log('【调试】11或15在validatedRecords中，但插入结果中没有');
                    }
                }
            }

            // 6. 批量更新现有记录（优化：并行更新）
            let updatedCount = 0;
            if (updateRecords.length > 0) {
                console.log(`准备更新 ${updateRecords.length} 条记录`);

                // 字段长度限制验证和截断
                const MAX_FIELD_LENGTHS = {
                    source_status: 50,
                    source_channel: 50,
                    name: 100,
                    phone: 20,
                    position: 100,
                    job_type: 50,
                    id_card: 18,
                    email: 100
                };

                // 优化：使用并行更新代替串行更新
                const updatePromises = updateRecords.map(async (record) => {
                    try {
                        // 验证和截断字段长度
                        // 注意：不要复制 application_id，因为它不应该被更新
                        const { id, application_id, ...fieldsToUpdate } = record;
                        const validatedRecord = { ...fieldsToUpdate };
                        
                        Object.entries(MAX_FIELD_LENGTHS).forEach(([field, maxLength]) => {
                            if (validatedRecord[field] && typeof validatedRecord[field] === 'string' && validatedRecord[field].length > maxLength) {
                                console.warn(`更新字段 ${field} 长度超过限制 (${validatedRecord[field].length} > ${maxLength})，已截断`);
                                validatedRecord[field] = validatedRecord[field].substring(0, maxLength);
                            }
                        });

                        const { error: updateError } = await this.client
                            .from('recruitment_process')
                            .update(validatedRecord)
                            .eq('id', id);

                        if (updateError) {
                            console.error(`更新记录 ${id} 失败:`, updateError);
                            console.error('错误详情:', JSON.stringify(updateError, null, 2));
                            return { success: false, error: updateError };
                        } else {
                            return { success: true };
                        }
                    } catch (err) {
                        console.error(`更新记录 ${id} 异常:`, err);
                        return { success: false, error: err };
                    }
                });

                const results = await Promise.all(updatePromises);
                updatedCount = results.filter(r => r.success).length;
                const failedCount = results.filter(r => !r.success).length;
                console.log(`成功更新 ${updatedCount} 条记录，失败 ${failedCount} 条`);
                
                // 记录失败的更新
                const failedUpdates = results.filter(r => !r.success);
                if (failedUpdates.length > 0) {
                    console.error('失败的更新详情:', failedUpdates.map(r => r.error));
                }
            }

            // 7. 清理已取消的记录
            const cleanupResult = await this.cleanupCancelledRecords();
            
            // 8. 清理无效的招聘流程记录（application_id 为 null 或对应 applications 记录已不存在）
            const invalidCleanupResult = await this.cleanupInvalidRecords();

            // 【优化】更新最后同步时间
            this._setLastSyncTime(new Date().toISOString());
            
            return {
                success: true,
                message: `同步完成：新增 ${insertedCount} 条，更新 ${updatedCount} 条，清理 ${cleanupResult.deletedCount || 0} 条已取消记录，清理 ${invalidCleanupResult.deletedCount || 0} 条无效记录`,
                inserted: insertedCount,
                updated: updatedCount,
                deleted: (cleanupResult.deletedCount || 0) + (invalidCleanupResult.deletedCount || 0)
            };

        } catch (error) {
            console.error('同步数据失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 清理已取消的记录
     * 删除recruitment_process中对应applications表或bookings表已取消的记录
     */
    async cleanupCancelledRecords() {
        try {
            // 1. 获取applications表中已取消的记录的application_id
            const { data: cancelledApps, error: appError } = await this.client
                .from('applications')
                .select('id, name, status');
            
            if (appError) throw appError;
            
            // 2. 获取bookings表中已取消的记录的application_id
            const { data: cancelledBookings, error: bookingError } = await this.client
                .from('bookings')
                .select('application_id, status');
            
            if (bookingError) {
                console.error('获取bookings数据失败:', bookingError);
            }
            
            // 找出applications表中已取消的记录
            const appCancelledIds = cancelledApps
                .filter(app => {
                    const appStatus = app.status || '';
                    return appStatus === '已取消' ||
                           appStatus === 'cancelled' ||
                           appStatus === 'canceled' ||
                           appStatus === 'cancel' ||
                           appStatus === '已撤销' ||
                           appStatus === '撤销';
                })
                .map(app => app.id);

            // 找出applications表中已拒绝的记录
            const appRejectedIds = cancelledApps
                .filter(app => {
                    const appStatus = app.status || '';
                    return appStatus === '已拒绝' ||
                           appStatus === 'rejected' ||
                           appStatus === 'reject' ||
                           appStatus === '拒绝' ||
                           appStatus === '不通过' ||
                           appStatus === '未通过';
                })
                .map(app => app.id);

            // 找出bookings表中已取消的记录
            const bookingCancelledIds = (cancelledBookings || [])
                .filter(booking => {
                    const bookingStatus = booking.status || '';
                    return bookingStatus === '已取消' ||
                           bookingStatus === 'cancelled' ||
                           bookingStatus === 'canceled' ||
                           bookingStatus === 'cancel' ||
                           bookingStatus === '已撤销' ||
                           bookingStatus === '撤销';
                })
                .map(booking => booking.application_id)
                .filter(id => id); // 过滤掉null/undefined

            // 合并所有需要清理的application_id（去重）
            const allCancelledIds = [...new Set([...appCancelledIds, ...appRejectedIds, ...bookingCancelledIds])];
            
            if (allCancelledIds.length === 0) {
                console.log('没有已取消的记录需要清理');
                return { deletedCount: 0 };
            }
            
            console.log(`发现 ${appCancelledIds.length} 条应聘已取消记录`);
            console.log(`发现 ${bookingCancelledIds.length} 条预约已取消记录`);
            console.log(`共 ${allCancelledIds.length} 条记录需要清理:`, allCancelledIds);
            
            // 3. 删除recruitment_process中对应的记录
            const { data: deletedRecords, error: deleteError } = await this.client
                .from('recruitment_process')
                .delete()
                .in('application_id', allCancelledIds)
                .select();
            
            if (deleteError) {
                console.error('清理已取消记录失败:', deleteError);
                return { deletedCount: 0, error: deleteError.message };
            }
            
            const deletedCount = deletedRecords ? deletedRecords.length : 0;
            console.log(`成功清理 ${deletedCount} 条已取消记录`);
            
            return { deletedCount };
        } catch (error) {
            console.error('清理已取消记录时出错:', error);
            return { deletedCount: 0, error: error.message };
        }
    }

    /**
     * 清理无效的招聘流程记录
     * 删除 application_id 为 null 或对应 applications 记录已不存在的 recruitment_process 记录
     */
    async cleanupInvalidRecords() {
        try {
            console.log('开始清理无效的招聘流程记录...');
            
            // 1. 获取所有 recruitment_process 记录
            const { data: rpRecords, error: rpError } = await this.client
                .from('recruitment_process')
                .select('id, application_id, name');
            
            if (rpError) throw rpError;
            
            // 2. 获取所有有效的 applications 记录 ID
            const { data: apps, error: appError } = await this.client
                .from('applications')
                .select('id');
            
            if (appError) throw appError;
            
            const validAppIds = new Set(apps.map(app => app.id));
            
            // 3. 找出无效的 recruitment_process 记录
            const invalidRecords = rpRecords.filter(rp => {
                // application_id 为 null 或 undefined
                if (!rp.application_id || rp.application_id === null || rp.application_id === 'null') {
                    return true;
                }
                // 对应的 applications 记录已不存在
                if (!validAppIds.has(rp.application_id)) {
                    return true;
                }
                return false;
            });
            
            if (invalidRecords.length === 0) {
                console.log('没有无效的招聘流程记录需要清理');
                return { deletedCount: 0 };
            }
            
            console.log(`发现 ${invalidRecords.length} 条无效的招聘流程记录需要清理:`, 
                invalidRecords.map(r => ({ id: r.id, application_id: r.application_id, name: r.name })));
            
            // 4. 删除无效的 recruitment_process 记录
            const invalidIds = invalidRecords.map(rp => rp.id);
            const { data: deletedRecords, error: deleteError } = await this.client
                .from('recruitment_process')
                .delete()
                .in('id', invalidIds)
                .select();
            
            if (deleteError) {
                console.error('清理无效记录失败:', deleteError);
                return { deletedCount: 0, error: deleteError.message };
            }
            
            const deletedCount = deletedRecords ? deletedRecords.length : 0;
            console.log(`成功清理 ${deletedCount} 条无效记录`);
            
            return { deletedCount };
        } catch (error) {
            console.error('清理无效记录时出错:', error);
            return { deletedCount: 0, error: error.message };
        }
    }

    /**
     * 根据数据状态确定招聘环节
     * 用于数据同步时设置正确的current_stage和current_status
     */
    determineStageFromData(app) {
        // 调试：打印 app 对象的关键字段
        console.log(`determineStageFromData - ${app.name} (ID: ${app.id}):`, {
            first_interview_time: app.first_interview_time,
            first_interviewer: app.first_interviewer,
            first_interview_result: app.first_interview_result,
            second_interview_time: app.second_interview_time,
            second_interview_result: app.second_interview_result,
            hire_department: app.hire_department,
            hire_position: app.hire_position,
            accept_offer: app.accept_offer,
            is_reported: app.is_reported,
            current_stage: app.current_stage
        });
        
        // 优先级从高到低判断
        
        // 1. 已报到 - 最终状态
        // 使用更健壮的检查：支持布尔值 true、字符串 'true'、数字 1
        const isReported = app.is_reported === true ||
                          app.is_reported === 'true' ||
                          app.is_reported === 1 ||
                          app.is_reported === '1' ||
                          app.is_reported === 'yes';

        // 关键修复：如果存在"未报到原因"，说明实际未报到，不应判定为已报到
        const hasNoReportReason = app.no_report_reason &&
                                   app.no_report_reason.trim() !== '' &&
                                   app.no_report_reason !== '无';

        if ((isReported || app.current_stage === 'onboarded') && !hasNoReportReason) {
            console.log(`  -> 判定为: 已报到 (is_reported=${app.is_reported}, isReported=${isReported}, hasNoReportReason=${hasNoReportReason})`);
            return { stage: 'onboarded', status: 'completed' };
        }

        // 1.5 待报到/未报到状态 - 已接受offer但未实际报到（有未报到原因）
        if (hasNoReportReason) {
            console.log(`  -> 判定为: 未报到/待报到 (原因: ${app.no_report_reason})`);
            return { stage: 'hired', status: 'pending' };
        }

        // 2. 录用阶段 - 关键修复：已接受offer或已填写录用信息，应进入录用阶段
        // 检查是否已接受offer（支持多种格式：'yes', '是', true, 1）
        const acceptOfferValue = app.accept_offer;
        const hasAcceptedOffer = acceptOfferValue === 'yes' ||
                                  acceptOfferValue === '是' ||
                                  acceptOfferValue === true ||
                                  acceptOfferValue === 1 ||
                                  acceptOfferValue === '1' ||
                                  (typeof acceptOfferValue === 'string' && acceptOfferValue.toLowerCase() === 'yes');

        console.log(`  accept_offer原始值: "${acceptOfferValue}" (类型: ${typeof acceptOfferValue}), hasAcceptedOffer: ${hasAcceptedOffer}`);

        if (hasAcceptedOffer || app.hire_department || app.hire_position || app.current_stage === 'hired') {
            if (acceptOfferValue === 'no' || acceptOfferValue === '否' ||
                (typeof acceptOfferValue === 'string' && acceptOfferValue.toLowerCase() === 'no')) {
                // 拒绝offer
                console.log(`  -> 判定为: 录用-拒绝offer`);
                return { stage: 'hired', status: 'rejected' };
            } else if (hasAcceptedOffer) {
                // 已接受offer
                console.log(`  -> 判定为: 录用-已接受offer (accept_offer=${acceptOfferValue})`);
                return { stage: 'hired', status: 'pending' };
            } else {
                // 待确认
                console.log(`  -> 判定为: 录用-待确认`);
                return { stage: 'hired', status: 'pending' };
            }
        }

        // 3. 复试阶段
        if (app.second_interview_result) {
            if (app.second_interview_result === 'pass') {
                // 关键修复：复试通过且已接受offer，应进入录用阶段
                if (hasAcceptedOffer || app.hire_department || app.hire_position) {
                    console.log(`  -> 复试通过但已接受offer，判定为: 录用-已接受offer`);
                    return { stage: 'hired', status: 'pending' };
                }
                console.log(`  -> 判定为: 复试-通过`);
                return { stage: 'second_interview', status: 'passed' };
            } else if (app.second_interview_result === 'reject') {
                console.log(`  -> 判定为: 复试-不通过`);
                // 【修复】使用 'reject' 而不是 'rejected'，与按钮显示逻辑保持一致
                return { stage: 'second_interview', status: 'reject' };
            } else {
                console.log(`  -> 判定为: 复试-待定`);
                return { stage: 'second_interview', status: 'pending' };
            }
        }

        if (app.second_interview_time || app.second_interviewer) {
            console.log(`  -> 判定为: 复试-待安排/进行中`);
            return { stage: 'second_interview', status: 'pending' };
        }
        
        // 4. 初试阶段
        if (app.first_interview_result) {
            if (app.first_interview_result === 'pass') {
                console.log(`  -> 判定为: 初试-通过`);
                return { stage: 'first_interview', status: 'passed' };
            } else if (app.first_interview_result === 'reject') {
                console.log(`  -> 判定为: 初试-不通过`);
                // 【修复】使用 'reject' 而不是 'rejected'，与按钮显示逻辑保持一致
                return { stage: 'first_interview', status: 'reject' };
            } else {
                console.log(`  -> 判定为: 初试-待定`);
                return { stage: 'first_interview', status: 'pending' };
            }
        }
        
        if (app.first_interview_time || app.first_interviewer) {
            console.log(`  -> 判定为: 初试-待安排/进行中`);
            return { stage: 'first_interview', status: 'pending' };
        }
        
        // 5. 投递简历阶段（默认）
        console.log(`  -> 判定为: 投递简历`);
        return { stage: 'application', status: 'pending' };
    }

    /**
     * 加载所有数据
     */
    async loadData() {
        try {
            const { data, error } = await this.client
                .from('recruitment_process')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // 过滤掉已取消、已拒绝的记录
            const rawData = data || [];

            // 调试：打印所有记录的source_status
            console.log('========================================');
            console.log('=== 调试：所有记录的source_status ===');
            console.log('========================================');
            console.log(`总记录数: ${rawData.length}`);
            rawData.forEach((item, index) => {
                console.log(`[${index + 1}] 姓名: ${item.name}, ID: ${item.id}, source_status: "${item.source_status}", current_status: "${item.current_status}"`);
            });
            console.log('========================================');

            // 【修复】只过滤已取消、已拒绝的数据，保留已确认已处理的数据
            this.allData = rawData.filter(item => {
                const sourceStatus = item.source_status || '';
                const isCancelled =
                    sourceStatus === '已取消' || sourceStatus === 'cancelled' || sourceStatus === 'canceled' ||
                    sourceStatus === 'cancel' || sourceStatus === '已撤销' || sourceStatus === '撤销';
                const isRejected =
                    sourceStatus === '已拒绝' || sourceStatus === 'rejected' || sourceStatus === 'reject' ||
                    sourceStatus === '拒绝' || sourceStatus === '不通过' || sourceStatus === '未通过';
                
                // 只过滤已取消和已拒绝，保留已确认、已处理等其他状态
                return !(isCancelled || isRejected);
            });
            
            console.log(`loadData - 原始记录数: ${rawData.length}, 有效记录数: ${this.allData.length}, 已过滤记录数: ${rawData.length - this.allData.length}`);
            
            this.filteredData = [...this.allData];
            this.totalCount = this.allData.length;
            
            return {
                success: true,
                data: this.allData,
                count: this.totalCount
            };
        } catch (error) {
            console.error('加载数据失败:', error);
            return {
                success: false,
                error: error.message,
                data: [],
                count: 0
            };
        }
    }

    /**
     * 获取单条记录
     */
    getRecord(id) {
        return this.allData.find(item => item.id === id);
    }

    /**
     * 获取筛选后的数据
     */
    getFilteredData() {
        return this.filteredData;
    }

    /**
     * 获取所有数据
     */
    getAllData() {
        return this.allData;
    }

    /**
     * 获取总数
     */
    getTotalCount() {
        return this.totalCount;
    }

    /**
     * 应用筛选
     */
    applyFilters(filters = {}, reset = false) {
        if (reset) {
            this.filters = {};
            this.filteredData = [...this.allData];
        }
        
        this.filters = { ...this.filters, ...filters };
        
        this.filteredData = this.allData.filter(item => {
            // 岗位筛选
            if (this.filters.position && item.position !== this.filters.position) {
                return false;
            }
            
            // 工种筛选
            if (this.filters.jobType && item.job_type !== this.filters.jobType) {
                return false;
            }
            
            // 环节筛选
            if (this.filters.stage && item.current_stage !== this.filters.stage) {
                return false;
            }
            
            // 状态筛选
            if (this.filters.status && item.current_status !== this.filters.status) {
                return false;
            }

            // 面试日期范围筛选
            if (item.interview_date) {
                const itemDate = item.interview_date.split('T')[0];

                // 起始日期筛选
                if (this.filters.interview_date_start) {
                    if (itemDate < this.filters.interview_date_start) {
                        return false;
                    }
                }

                // 结束日期筛选
                if (this.filters.interview_date_end) {
                    if (itemDate > this.filters.interview_date_end) {
                        return false;
                    }
                }
            }

            // 面试时段筛选
            if (this.filters.interview_time_slot && item.interview_time_slot !== this.filters.interview_time_slot) {
                return false;
            }

            // 搜索筛选
            if (this.filters.search) {
                const searchLower = this.filters.search.toLowerCase();
                const matchName = item.name && item.name.toLowerCase().includes(searchLower);
                const matchPhone = item.phone && item.phone.includes(this.filters.search);
                const matchPosition = item.position && item.position.toLowerCase().includes(searchLower);
                
                if (!matchName && !matchPhone && !matchPosition) {
                    return false;
                }
            }
            
            // 特殊状态筛选（用于统计卡片）
            if (this.filters.special_status) {
                // 定义环节顺序
                const stageOrder = {
                    'application': 1,
                    'first_interview': 2,
                    'second_interview': 3,
                    'hired': 4,
                    'onboarded': 5
                };
                const currentStageLevel = stageOrder[item.current_stage] || 0;

                // 所有已完成初试的人（包括已进入复试、录用等后续环节）
                if (this.filters.special_status === 'first_interview_all') {
                    return currentStageLevel >= 2;
                }
                // 所有已完成复试的人（包括已进入录用等后续环节）
                if (this.filters.special_status === 'second_interview_all') {
                    return currentStageLevel >= 3;
                }
                // 所有已录用的人（包括待确认offer、待报到、未报到、已报到）
                if (this.filters.special_status === 'hire_all') {
                    return currentStageLevel >= 4;
                }
                // 已报到
                if (this.filters.special_status === 'onboarded') {
                    return item.current_stage === 'onboarded';
                }
                // 录用待确认：current_stage='hired' 且 accept_offer 未设置或为null
                if (this.filters.special_status === 'hire_pending') {
                    return item.current_stage === 'hired' && 
                           (item.accept_offer === null || item.accept_offer === undefined || item.accept_offer === '');
                }
                // 待报到：current_stage='hired' 且 accept_offer='yes' 且未报到且无未报到原因
                if (this.filters.special_status === 'awaiting_onboard') {
                    const hasNoReportReason = item.no_report_reason && item.no_report_reason.trim() !== '' && item.no_report_reason !== '无';
                    return item.current_stage === 'hired' && 
                           item.accept_offer === 'yes' && 
                           item.is_reported !== 'yes' && 
                           item.is_reported !== true &&
                           !hasNoReportReason;
                }
                // 未报到：current_stage='hired' 且 accept_offer='yes' 且有未报到原因
                if (this.filters.special_status === 'not_reported') {
                    const hasNoReportReason = item.no_report_reason && item.no_report_reason.trim() !== '' && item.no_report_reason !== '无';
                    return item.current_stage === 'hired' && 
                           item.accept_offer === 'yes' && 
                           (item.is_reported === 'no' || !item.is_reported) &&
                           hasNoReportReason;
                }
            }
            
            return true;
        });
        
        return this.filteredData;
    }

    /**
     * 获取筛选选项
     */
    getFilterOptions() {
        const positions = [...new Set(this.allData.map(item => item.position).filter(Boolean))];
        const jobTypes = [...new Set(this.allData.map(item => item.job_type).filter(Boolean))];
        const stages = [...new Set(this.allData.map(item => item.current_stage).filter(Boolean))];
        const statuses = [...new Set(this.allData.map(item => item.current_status).filter(Boolean))];
        
        return {
            positions,
            jobTypes,
            stages,
            statuses
        };
    }

    /**
     * 获取统计数据
     * 统计逻辑说明：
     * - 各阶段人数包含所有已完成该阶段并进入后续环节的候选人
     * - 初试：包含所有 current_stage >= first_interview 的人（包括已进入复试、录用、待报到、已报到）
     * - 复试：包含所有 current_stage >= second_interview 的人（包括已进入录用、待报到、已报到）
     * - 录用：包含所有 current_stage >= hired 的人（包括待确认offer、待报到、已报到、未报到）
     * - 待报到：已接受offer，等待报到（正常流程中）
     * - 未报到：已接受offer，但最终未报到（有未报到原因）
     * - 已报到：当前环节是 onboarded
     */
    getStatistics() {
        const stats = {
            total: this.allData.length,
            byStage: {},
            byStatus: {}
        };

        // 初始化统计卡片需要的字段
        let firstInterviewPending = 0;
        let secondInterviewPending = 0;
        let hirePending = 0;
        let awaitingOnboard = 0;
        let notReported = 0;  // 未报到人数
        let onboarded = 0;

        // 定义环节顺序（用于判断候选人处于哪个阶段）
        const stageOrder = {
            'application': 1,
            'first_interview': 2,
            'second_interview': 3,
            'hired': 4,
            'onboarded': 5
        };

        this.allData.forEach(item => {
            // 按环节统计
            const stage = item.current_stage || 'unknown';
            stats.byStage[stage] = (stats.byStage[stage] || 0) + 1;

            // 按状态统计
            const status = item.current_status || 'unknown';
            stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

            const currentStageLevel = stageOrder[stage] || 0;

            // 统计各阶段人数（包含已完成该阶段并进入后续环节的候选人）
            // 初试：包含所有 current_stage >= first_interview 的人
            if (currentStageLevel >= 2) {
                firstInterviewPending++;
            }
            // 复试：包含所有 current_stage >= second_interview 的人
            if (currentStageLevel >= 3) {
                secondInterviewPending++;
            }
            // 录用：包含所有 current_stage >= hired 的人（包括待确认offer、待报到、未报到、已报到）
            if (currentStageLevel >= 4) {
                hirePending++;
            }

            // 判断是否已接受offer
            const hasAcceptedOffer = item.accept_offer === 'yes' || item.accept_offer === '是' || item.accept_offer === true;
            // 判断是否有未报到原因
            const hasNoReportReason = item.no_report_reason && item.no_report_reason.trim() !== '' && item.no_report_reason !== '无';
            // 判断是否已报到
            const isReported = item.is_reported === 'yes' || item.is_reported === true || item.is_reported === 'true';

            // 未报到：已接受offer，有未报到原因，且未实际报到
            if (stage === 'hired' && hasAcceptedOffer && hasNoReportReason && !isReported) {
                notReported++;
            }
            // 待报到：已接受offer，没有未报到原因，且未报到
            else if (stage === 'hired' && hasAcceptedOffer && !hasNoReportReason && !isReported) {
                awaitingOnboard++;
            }

            // 已报到：当前环节是 onboarded
            if (stage === 'onboarded') {
                onboarded++;
            }
        });

        // 添加统计卡片需要的字段
        stats.firstInterviewPending = firstInterviewPending;
        stats.secondInterviewPending = secondInterviewPending;
        stats.hirePending = hirePending;
        stats.awaitingOnboard = awaitingOnboard;
        stats.notReported = notReported;  // 未报到人数
        stats.onboarded = onboarded;

        return stats;
    }

    /**
     * 更新记录
     */
    async updateRecord(id, data) {
        try {
            const { error } = await this.client
                .from('recruitment_process')
                .update(data)
                .eq('id', id);

            if (error) throw error;

            // 更新本地数据
            const index = this.allData.findIndex(item => item.id === id);
            if (index !== -1) {
                this.allData[index] = { ...this.allData[index], ...data };
            }

            return { success: true };
        } catch (error) {
            console.error('更新记录失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 处理初试
     * @param {string} id - 记录ID
     * @param {Object} data - 初试数据
     */
    async processFirstInterview(id, data) {
        try {
            console.log('DataManager - processFirstInterview - 接收到的数据:', data);
            
            // 构建更新数据
            const updateData = {
                first_interview: data.first_interview,
                first_interview_time: data.first_interview_time,
                first_interviewer: data.first_interviewer,
                first_interview_result: data.first_interview_result,
                current_stage: data.current_stage,
                current_status: data.current_status,
                updated_at: new Date().toISOString()
            };
            
            // 如果不通过，添加未通过原因
            if (data.first_interview_result === 'reject') {
                updateData.first_reject_reason = data.first_reject_reason;
                updateData.first_reject_detail = data.first_reject_detail;
            }
            
            console.log('DataManager - processFirstInterview - 更新数据:', updateData);
            
            const { error } = await this.client
                .from('recruitment_process')
                .update(updateData)
                .eq('id', id);

            if (error) {
                console.error('处理初试 - 数据库更新失败:', error);
                console.error('错误详情:', JSON.stringify(error, null, 2));
                return { success: false, error: error.message || '数据库更新失败' };
            }

            // 更新本地数据
            const index = this.allData.findIndex(item => item.id === id);
            if (index !== -1) {
                this.allData[index] = { ...this.allData[index], ...updateData };
            }

            console.log('DataManager - processFirstInterview - 更新成功');
            return { success: true };
        } catch (error) {
            console.error('处理初试失败:', error);
            return { success: false, error: error.message || '处理初试时发生未知错误' };
        }
    }

    /**
     * 处理复试
     * @param {string} id - 记录ID
     * @param {Object} data - 复试数据
     */
    async processSecondInterview(id, data) {
        try {
            console.log('DataManager - processSecondInterview - 接收到的数据:', data);

            // 构建更新数据
            const updateData = {
                second_interview: data.second_interview,
                second_interview_time: data.second_interview_time,
                second_interviewer: data.second_interviewer,
                second_interview_result: data.second_interview_result,
                current_stage: data.current_stage,
                current_status: data.current_status,
                updated_at: new Date().toISOString()
            };

            // 如果通过，保存录用信息（用于后续自动填充）
            if (data.second_interview_result === 'pass') {
                // 关键修复：保存录用信息，实现数据自动同步
                if (data.hire_department) updateData.hire_department = data.hire_department;
                if (data.hire_position) updateData.hire_position = data.hire_position;
                if (data.job_title) updateData.job_title = data.job_title;
                if (data.job_level) updateData.job_level = data.job_level;
                if (data.hire_salary) updateData.hire_salary = data.hire_salary;
                if (data.accept_offer) updateData.accept_offer = data.accept_offer;
                if (data.offer_reject_reason) updateData.offer_reject_reason = data.offer_reject_reason;
                if (data.hire_date) updateData.hire_date = data.hire_date;
            }

            // 如果不通过，添加未通过原因
            if (data.second_interview_result === 'reject') {
                updateData.second_reject_reason = data.second_reject_reason;
                updateData.second_reject_detail = data.second_reject_detail;
            }
            
            console.log('DataManager - processSecondInterview - 更新数据:', updateData);
            
            const { error } = await this.client
                .from('recruitment_process')
                .update(updateData)
                .eq('id', id);

            if (error) {
                console.error('处理复试 - 数据库更新失败:', error);
                console.error('错误详情:', JSON.stringify(error, null, 2));
                return { success: false, error: error.message || '数据库更新失败' };
            }

            // 更新本地数据
            const index = this.allData.findIndex(item => item.id === id);
            if (index !== -1) {
                this.allData[index] = { ...this.allData[index], ...updateData };
            }

            console.log('DataManager - processSecondInterview - 更新成功');
            return { success: true };
        } catch (error) {
            console.error('处理复试失败:', error);
            return { success: false, error: error.message || '处理复试时发生未知错误' };
        }
    }

    /**
     * 处理录用
     * @param {string} id - 记录ID
     * @param {Object} data - 录用数据
     */
    async processHiring(id, data) {
        try {
            console.log('DataManager - processHiring - 接收到的数据:', data);

            // 关键修复：处理空日期，空字符串会导致数据库报错
            const hireDate = data.hire_date && data.hire_date.trim() !== '' ? data.hire_date : null;

            // 构建更新数据
            const updateData = {
                hire_info: data.hire_info,
                hire_position: data.hire_position,
                hire_department: data.hire_department,
                // 关键修复：保存职务和职级字段
                job_title: data.job_title,
                job_level: data.job_level,
                hire_salary: data.hire_salary,
                // 关键修复：空日期转为 null
                hire_date: hireDate,
                // 关键修复：保存 accept_offer 字段
                accept_offer: data.accept_offer,
                offer_reject_reason: data.offer_reject_reason,
                current_stage: data.current_stage,
                current_status: data.current_status,
                updated_at: new Date().toISOString()
            };
            
            console.log('DataManager - processHiring - 更新数据:', updateData);
            
            const { error } = await this.client
                .from('recruitment_process')
                .update(updateData)
                .eq('id', id);

            if (error) {
                console.error('处理录用 - 数据库更新失败:', error);
                console.error('错误详情:', JSON.stringify(error, null, 2));
                return { success: false, error: error.message || '数据库更新失败' };
            }

            // 更新本地数据
            const index = this.allData.findIndex(item => item.id === id);
            if (index !== -1) {
                this.allData[index] = { ...this.allData[index], ...updateData };
            }

            console.log('DataManager - processHiring - 更新成功');
            return { success: true };
        } catch (error) {
            console.error('处理录用失败:', error);
            return { success: false, error: error.message || '处理录用时发生未知错误' };
        }
    }

    /**
     * 处理报到
     * @param {string} id - 记录ID
     * @param {Object} data - 报到数据
     */
    async processOnboarding(id, data) {
        try {
            console.log('DataManager - processOnboarding - 接收到的数据:', data);

            // 构建更新数据
            const updateData = {
                is_reported: data.is_reported,
                report_date: data.report_date,
                current_stage: data.current_stage,
                current_status: data.current_status,
                updated_at: new Date().toISOString()
            };

            // 关键修复：未报到时需要保存未报到原因和详情
            if (data.is_reported === 'no') {
                if (data.no_report_reason) {
                    updateData.no_report_reason = data.no_report_reason;
                }
                if (data.no_report_detail) {
                    updateData.no_report_detail = data.no_report_detail;
                }
            }

            console.log('DataManager - processOnboarding - 更新数据:', updateData);

            const { error } = await this.client
                .from('recruitment_process')
                .update(updateData)
                .eq('id', id);

            if (error) {
                console.error('处理报到 - 数据库更新失败:', error);
                console.error('错误详情:', JSON.stringify(error, null, 2));
                return { success: false, error: error.message || '数据库更新失败' };
            }

            // 更新本地数据
            const index = this.allData.findIndex(item => item.id === id);
            if (index !== -1) {
                this.allData[index] = { ...this.allData[index], ...updateData };
            }

            console.log('DataManager - processOnboarding - 更新成功');
            return { success: true };
        } catch (error) {
            console.error('处理报到失败:', error);
            return { success: false, error: error.message || '处理报到时发生未知错误' };
        }
    }

    /**
     * 删除记录
     */
    async deleteRecord(id) {
        try {
            const { error } = await this.client
                .from('recruitment_process')
                .delete()
                .eq('id', id);

            if (error) throw error;

            // 更新本地数据
            this.allData = this.allData.filter(item => item.id !== id);
            this.filteredData = this.filteredData.filter(item => item.id !== id);
            this.totalCount = this.allData.length;

            return { success: true };
        } catch (error) {
            console.error('删除记录失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 批量删除记录
     * @param {Array} ids - 要删除的记录ID数组
     */
    async batchDeleteRecords(ids) {
        try {
            if (!ids || ids.length === 0) {
                return { success: true, deletedCount: 0 };
            }

            console.log(`准备批量删除 ${ids.length} 条记录:`, ids);

            // 使用Supabase的in操作符批量删除
            const { data: deletedRecords, error } = await this.client
                .from('recruitment_process')
                .delete()
                .in('id', ids)
                .select();

            if (error) throw error;

            const deletedCount = deletedRecords ? deletedRecords.length : 0;
            console.log(`成功删除 ${deletedCount} 条记录`);

            // 更新本地数据
            this.allData = this.allData.filter(item => !ids.includes(item.id));
            this.filteredData = this.filteredData.filter(item => !ids.includes(item.id));
            this.totalCount = this.allData.length;

            return { 
                success: true, 
                deletedCount: deletedCount,
                deletedIds: deletedRecords ? deletedRecords.map(r => r.id) : []
            };
        } catch (error) {
            console.error('批量删除记录失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 导出数据到Excel
     */
    exportToExcel(data = null) {
        const exportData = data || this.filteredData;
        
        return exportData.map(item => ({
            '姓名': item.name,
            '电话': item.phone,
            '性别': item.gender,
            '年龄': item.age,
            '身份证号': item.id_card,
            '应聘岗位': item.position,
            '工种': item.job_type,
            '学历': item.education,
            '工作经验': item.experience,
            '技能': item.skills,
            '招聘渠道': item.source_channel,
            '当前环节': item.current_stage,
            '当前状态': item.current_status,
            '创建时间': item.created_at,
            '更新时间': item.updated_at
        }));
    }

    /**
     * 获取分页数据
     * @param {number} page - 页码（从1开始）
     * @returns {Object} 包含当前页数据和分页信息的对象
     */
    getPageData(page = null) {
        if (page !== null) {
            this.currentPage = page;
        }
        
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageData = this.filteredData.slice(start, end);
        
        const totalPages = Math.ceil(this.filteredData.length / this.pageSize);
        
        return {
            data: pageData,
            pagination: {
                currentPage: this.currentPage,
                pageSize: this.pageSize,
                totalCount: this.filteredData.length,
                totalPages: totalPages,
                hasNext: this.currentPage < totalPages,
                hasPrev: this.currentPage > 1
            }
        };
    }

    /**
     * 设置每页显示条数
     * @param {number} size - 每页条数
     */
    setPageSize(size) {
        this.pageSize = size;
        this.currentPage = 1; // 重置到第一页
    }

    /**
     * 获取当前页码
     */
    getCurrentPage() {
        return this.currentPage;
    }

    /**
     * 跳转到指定页
     * @param {number} page - 页码
     */
    goToPage(page) {
        const totalPages = Math.ceil(this.filteredData.length / this.pageSize);
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;
        this.currentPage = page;
    }

    /**
     * 下一页
     */
    nextPage() {
        const totalPages = Math.ceil(this.filteredData.length / this.pageSize);
        if (this.currentPage < totalPages) {
            this.currentPage++;
        }
    }

    /**
     * 上一页
     */
    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
        }
    }

    /**
     * 【优化】获取上次同步时间（使用内存缓存）
     */
    _getLastSyncTime() {
        // 优先使用内存缓存
        if (this._lastSyncTime) {
            return this._lastSyncTime;
        }
        // 尝试从localStorage获取
        try {
            const stored = localStorage.getItem('rp_last_sync_time');
            if (stored) {
                this._lastSyncTime = stored;
                return stored;
            }
        } catch (e) {
            // localStorage不可用
        }
        return null;
    }

    /**
     * 【优化】设置上次同步时间
     */
    _setLastSyncTime(time) {
        this._lastSyncTime = time;
        try {
            localStorage.setItem('rp_last_sync_time', time);
        } catch (e) {
            // localStorage不可用
        }
    }

    /**
     * 【优化】清除同步缓存
     */
    clearSyncCache() {
        this._lastSyncTime = null;
        try {
            localStorage.removeItem('rp_last_sync_time');
        } catch (e) {
            // localStorage不可用
        }
    }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RecruitmentDataManager;
}
