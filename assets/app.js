/**
 * AI项目管理协作系统 - JavaScript核心
 * 集成金山文档API实现多角色数据协作
 */

// ========== 配置 ==========
const CONFIG = {
    // 金山文档API配置
    API_BASE: 'https://kdocs.cn/api/v1',
    FILE_ID: 'NeCtUjfuk9Mh8DMQ6x6WxxUpRZKXcEivA',
    TOKEN: 'oqwd0hCD3F8M9KQgRYTgHJzlpuTEMg+H04FlWp57o7KizvzfEiKoewmy8Hs7+DoOJc6k+oxOKCn5VJ59ArEkTJ2kO1j7BSLaJ1bZ4HvG/Jh98f0e6X6tNxJf5166gQVvCILpeuOAgL96xkPhDT4+mgfGQlZONmGu01dBM5Aazcr9wdkGtPpX1mLLmn2Xy22aSZUQImci/2c4U/x/GA==',
    
    // 数据表映射
    SHEETS: {
        projects: 2,      // 项目总览
        requirements: 3,  // 需求管理
        tasks: 4,         // 任务跟踪
        issues: 5,        // 问题与风险
        deliverables: 6,  // 交付物管理
        communications: 7  // 沟通记录
    }
};

// ========== 状态管理 ==========
const state = {
    currentRole: null,
    currentUser: null,
    projects: [],
    requirements: [],
    tasks: [],
    issues: [],
    deliverables: [],
    communications: [],
    editingRecord: null
};

// ========== 角色权限配置 ==========
const ROLE_PERMISSIONS = {
    planner: {
        name: '策划/制作人',
        color: '#E65100',
        desc: '需求提出、版本规划、玩法设计、资源协调',
        canCreate: ['projects', 'requirements', 'communications'],
        canEdit: ['projects', 'requirements', 'communications'],
        canViewAll: true
    },
    dev: {
        name: '研发',
        color: '#1565C0',
        desc: '功能开发、BUG修复、性能优化、资源产出',
        canCreate: ['requirements', 'tasks', 'issues', 'deliverables', 'communications'],
        canEdit: ['requirements', 'tasks', 'issues', 'deliverables', 'communications'],
        canViewAll: true
    },
    operation: {
        name: '运营/发行/商业化',
        color: '#2E7D32',
        desc: '活动设计、付费点配置、舆情监控、玩家服务',
        canCreate: ['requirements', 'tasks', 'communications'],
        canEdit: ['requirements', 'tasks', 'communications'],
        canViewAll: true
    },
    customer: {
        name: '客户',
        color: '#C2185B',
        desc: '外部客户',
        canCreate: ['requirements', 'issues', 'communications'],
        canEdit: ['requirements', 'issues'],
        canViewAll: false // 只能查看关联项目
    }
};

// ========== 金山文档API模块 ==========
const KDocsAPI = {
    /**
     * 发起API请求
     */
    async request(service, action, params = {}) {
        try {
            const response = await fetch(`${CONFIG.API_BASE}/${service}/${action}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.TOKEN}`
                },
                body: JSON.stringify(params)
            });
            
            const data = await response.json();
            
            if (data.code !== 0 && data.code !== '0') {
                throw new Error(data.message || 'API请求失败');
            }
            
            return data;
        } catch (error) {
            console.error('API请求错误:', error);
            throw error;
        }
    },

    /**
     * 查询数据表记录
     */
    async queryRecords(sheetId, filter = {}) {
        const result = await this.request('dbsheet', 'query_records', {
            file_id: CONFIG.FILE_ID,
            sheet_id: sheetId,
            filter: filter
        });
        return result?.data?.records || [];
    },

    /**
     * 添加记录
     */
    async addRecord(sheetId, fields) {
        const result = await this.request('dbsheet', 'add_record', {
            file_id: CONFIG.FILE_ID,
            sheet_id: sheetId,
            fields: fields
        });
        return result;
    },

    /**
     * 更新记录
     */
    async updateRecord(sheetId, recordId, fields) {
        const result = await this.request('dbsheet', 'update_record', {
            file_id: CONFIG.FILE_ID,
            sheet_id: sheetId,
            record_id: recordId,
            fields: fields
        });
        return result;
    },

    /**
     * 删除记录
     */
    async deleteRecord(sheetId, recordId) {
        const result = await this.request('dbsheet', 'delete_record', {
            file_id: CONFIG.FILE_ID,
            sheet_id: sheetId,
            record_id: recordId
        });
        return result;
    }
};

// ========== UI模块 ==========
const UI = {
    /**
     * 显示Toast提示
     */
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            toast.className = 'toast';
        }, 3000);
    },

    /**
     * 显示/隐藏模态框
     */
    showModal(title, content, onConfirm) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = content;
        document.getElementById('modal').classList.add('active');
        
        document.getElementById('modalConfirmBtn').onclick = () => {
            if (onConfirm) {
                const formData = this.getFormData();
                onConfirm(formData);
            }
        };
    },

    hideModal() {
        document.getElementById('modal').classList.remove('active');
    },

    /**
     * 获取表单数据
     */
    getFormData() {
        const form = document.getElementById('modalBody').querySelector('form');
        if (!form) return {};
        
        const formData = new FormData(form);
        const data = {};
        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }
        return data;
    },

    /**
     * 渲染空状态
     */
    renderEmptyState(icon, title, message) {
        return `
            <div class="empty-state">
                <div class="icon">${icon}</div>
                <h3>${title}</h3>
                <p>${message}</p>
            </div>
        `;
    },

    /**
     * 渲染项目卡片
     */
    renderProjectCard(project) {
        const phaseClass = this.getPhaseClass(project['当前阶段']);
        const statusClass = this.getStatusClass(project['项目状态']);
        
        return `
            <div class="card" data-id="${project.record_id}">
                <div class="card-header">
                    <div class="card-title">${project['项目名称'] || '未命名项目'}</div>
                    <span class="phase-tag ${phaseClass}">${project['当前阶段'] || '未设置'}</span>
                </div>
                <div class="card-meta">
                    <span>👤 客户：${project['客户名称'] || '-'}</span>
                    <span>📊 状态：<span class="status-tag ${statusClass}">${project['项目状态'] || '正常'}</span></span>
                </div>
                <div class="card-meta">
                    <span>💼 售前：${project['售前负责人'] || '-'}</span>
                    <span>⚙️ 产研：${project['产研负责人'] || '-'}</span>
                </div>
                <div class="card-meta">
                    <span>📦 交付：${project['交付负责人'] || '-'}</span>
                    <span>👤 对接：${project['客户对接人'] || '-'}</span>
                </div>
                <div class="card-footer">
                    <span>💰 预算：${project['项目预算'] ? '¥' + project['项目预算'] : '-'}</span>
                    <div class="card-actions">
                        <button class="btn-secondary btn-small" onclick="App.editProject('${project.record_id}')">编辑</button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 渲染需求卡片
     */
    renderRequirementCard(req) {
        const priorityClass = this.getPriorityClass(req['优先级']);
        const statusClass = this.getReqStatusClass(req['需求状态']);
        
        return `
            <div class="card" data-id="${req.record_id}">
                <div class="card-header">
                    <div class="card-title">${req['需求标题'] || '未命名需求'}</div>
                    <span class="status-tag ${statusClass}">${req['需求状态'] || '待评估'}</span>
                </div>
                <div class="card-meta">
                    <span>📁 项目：${req['关联项目'] || '-'}</span>
                    <span>🏷️ 类型：${req['需求类型'] || '-'}</span>
                </div>
                <div class="card-meta">
                    <span>👤 提出人：${req['提出人'] || '-'}</span>
                    <span>🏷️ 角色：${req['提出人角色'] || '-'}</span>
                </div>
                <div class="card-footer">
                    <span class="priority-tag ${priorityClass}">${req['优先级'] || 'P3'}</span>
                    <div class="card-actions">
                        <button class="btn-secondary btn-small" onclick="App.editRequirement('${req.record_id}')">编辑</button>
                        ${state.currentRole !== 'customer' ? `<button class="btn-primary btn-small" onclick="App.createTaskFromReq('${req.record_id}')">创建任务</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 渲染任务卡片
     */
    renderTaskCard(task) {
        const statusClass = this.getTaskStatusClass(task['任务状态']);
        const priorityClass = this.getTaskPriorityClass(task['优先级']);
        
        return `
            <div class="card" data-id="${task.record_id}">
                <div class="card-header">
                    <div class="card-title">${task['任务标题'] || '未命名任务'}</div>
                    <span class="status-tag ${statusClass}">${task['任务状态'] || '待开始'}</span>
                </div>
                <div class="card-meta">
                    <span>📁 项目：${task['关联项目'] || '-'}</span>
                    <span>🏷️ 类型：${task['任务类型'] || '-'}</span>
                </div>
                <div class="card-meta">
                    <span>👤 负责人：${task['负责人'] || '-'}</span>
                    <span>📅 截止：${task['截止日期'] || '-'}</span>
                </div>
                <div class="card-meta">
                    <span>📊 进度：${task['进度百分比'] || 0}%</span>
                    <span class="priority-tag ${priorityClass}">${task['优先级'] || '中'}</span>
                </div>
                <div class="card-footer">
                    <div></div>
                    <div class="card-actions">
                        <button class="btn-secondary btn-small" onclick="App.editTask('${task.record_id}')">编辑</button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 渲染问题卡片
     */
    renderIssueCard(issue) {
        const severityClass = this.getSeverityClass(issue['严重程度']);
        const statusClass = this.getIssueStatusClass(issue['问题状态']);
        
        return `
            <div class="card" data-id="${issue.record_id}">
                <div class="card-header">
                    <div class="card-title">${issue['问题标题'] || '未命名问题'}</div>
                    <span class="status-tag ${statusClass}">${issue['问题状态'] || '已识别'}</span>
                </div>
                <div class="card-meta">
                    <span>📁 项目：${issue['关联项目'] || '-'}</span>
                    <span>🏷️ 类型：${issue['问题类型'] || '-'}</span>
                </div>
                <div class="card-meta">
                    <span>👤 提出人：${issue['提出人'] || '-'}</span>
                    <span>👤 责任人：${issue['责任人'] || '-'}</span>
                </div>
                <div class="card-footer">
                    <span class="severity-tag ${severityClass}">${issue['严重程度'] || '一般'}</span>
                    <div class="card-actions">
                        <button class="btn-secondary btn-small" onclick="App.editIssue('${issue.record_id}')">编辑</button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 渲染交付物卡片
     */
    renderDeliverableCard(item) {
        const statusClass = this.getDeliverableStatusClass(item['交付状态']);
        
        return `
            <div class="card" data-id="${item.record_id}">
                <div class="card-header">
                    <div class="card-title">${item['交付物名称'] || '未命名交付物'}</div>
                    <span class="status-tag ${statusClass}">${item['交付状态'] || '编写中'}</span>
                </div>
                <div class="card-meta">
                    <span>📁 项目：${item['关联项目'] || '-'}</span>
                    <span>🏷️ 类型：${item['交付物类型'] || '-'}</span>
                </div>
                <div class="card-meta">
                    <span>👤 负责人：${item['负责人'] || '-'}</span>
                    <span>👤 审核人：${item['审核人'] || '-'}</span>
                </div>
                <div class="card-meta">
                    <span>📌 版本：${item['版本号'] || '-'}</span>
                    <span>📅 计划：${item['计划交付日期'] || '-'}</span>
                </div>
                <div class="card-footer">
                    <div></div>
                    <div class="card-actions">
                        <button class="btn-secondary btn-small" onclick="App.editDeliverable('${item.record_id}')">编辑</button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 渲染沟通记录卡片
     */
    renderCommunicationCard(comm) {
        return `
            <div class="card" data-id="${comm.record_id}">
                <div class="card-header">
                    <div class="card-title">${comm['沟通主题'] || '未命名沟通'}</div>
                    <span class="phase-tag">${comm['沟通类型'] || '其他'}</span>
                </div>
                <div class="card-meta">
                    <span>📁 项目：${comm['关联项目'] || '-'}</span>
                    <span>👤 记录人：${comm['记录人'] || '-'}</span>
                </div>
                <div class="card-meta">
                    <span>👥 参与：${comm['参与角色'] || '-'}</span>
                    <span>📅 日期：${comm['沟通日期'] || '-'}</span>
                </div>
                <div class="card-footer">
                    <div></div>
                    <div class="card-actions">
                        <button class="btn-secondary btn-small" onclick="App.editCommunication('${comm.record_id}')">查看详情</button>
                    </div>
                </div>
            </div>
        `;
    },

    // ========== 样式辅助方法 ==========
    getPhaseClass(phase) {
        const map = {
            '售前阶段': 'presales',
            '需求确认': 'requirements',
            '开发中': 'developing',
            '测试验收': 'testing',
            '已交付': 'delivered',
            '已归档': 'archived'
        };
        return map[phase] || '';
    },

    getStatusClass(status) {
        const map = {
            '正常': 'normal',
            '有风险': 'risk',
            '延期': 'delay',
            '暂停': 'pause',
            '已取消': 'pause'
        };
        return map[status] || 'normal';
    },

    getReqStatusClass(status) {
        const map = {
            '待评估': 'pending',
            '已确认': 'confirmed',
            '开发中': 'developing',
            '待测试': 'testing',
            '已验收': 'approved',
            '已拒绝': 'rejected',
            '已挂起': 'suspended'
        };
        return map[status] || 'pending';
    },

    getTaskStatusClass(status) {
        const map = {
            '待开始': 'todo',
            '进行中': 'in-progress',
            '待审核': 'pending-review',
            '已完成': 'done',
            '已取消': 'todo'
        };
        return map[status] || 'todo';
    },

    getIssueStatusClass(status) {
        const map = {
            '已识别': 'pending',
            '处理中': 'in-progress',
            '待确认': 'pending-review',
            '已解决': 'done',
            '已关闭': 'done',
            '已挂起': 'suspended'
        };
        return map[status] || 'pending';
    },

    getDeliverableStatusClass(status) {
        const map = {
            '编写中': 'todo',
            '待审核': 'pending',
            '审核通过': 'confirmed',
            '已交付': 'in-progress',
            '已验收': 'approved',
            '需修改': 'risk'
        };
        return map[status] || 'todo';
    },

    getPriorityClass(priority) {
        const map = {
            'P0-紧急': 'p0',
            'P1-高': 'p1',
            'P2-中': 'p2',
            'P3-低': 'p3',
            '紧急': 'p0',
            '高': 'p1',
            '中': 'p2',
            '低': 'p3'
        };
        return map[priority] || 'p2';
    },

    getSeverityClass(severity) {
        const map = {
            '致命': 'fatal',
            '严重': 'serious',
            '一般': 'normal',
            '轻微': 'light'
        };
        return map[severity] || 'normal';
    },

    getTaskPriorityClass(priority) {
        return this.getPriorityClass(priority);
    }
};

// ========== 表单模板 ==========
const FormTemplates = {
    project(isEdit = false, data = {}) {
        return `
            <form>
                <div class="form-group">
                    <label>项目名称 <span class="required">*</span></label>
                    <input type="text" name="项目名称" value="${data['项目名称'] || ''}" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>客户名称 <span class="required">*</span></label>
                        <input type="text" name="客户名称" value="${data['客户名称'] || ''}" required>
                    </div>
                    <div class="form-group">
                        <label>当前阶段</label>
                        <select name="当前阶段">
                            <option value="售前阶段" ${data['当前阶段'] === '售前阶段' ? 'selected' : ''}>售前阶段</option>
                            <option value="需求确认" ${data['当前阶段'] === '需求确认' ? 'selected' : ''}>需求确认</option>
                            <option value="开发中" ${data['当前阶段'] === '开发中' ? 'selected' : ''}>开发中</option>
                            <option value="测试验收" ${data['当前阶段'] === '测试验收' ? 'selected' : ''}>测试验收</option>
                            <option value="已交付" ${data['当前阶段'] === '已交付' ? 'selected' : ''}>已交付</option>
                            <option value="已归档" ${data['当前阶段'] === '已归档' ? 'selected' : ''}>已归档</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>项目状态</label>
                        <select name="项目状态">
                            <option value="正常" ${data['项目状态'] === '正常' ? 'selected' : ''}>正常</option>
                            <option value="有风险" ${data['项目状态'] === '有风险' ? 'selected' : ''}>有风险</option>
                            <option value="延期" ${data['项目状态'] === '延期' ? 'selected' : ''}>延期</option>
                            <option value="暂停" ${data['项目状态'] === '暂停' ? 'selected' : ''}>暂停</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>项目预算</label>
                        <input type="number" name="项目预算" value="${data['项目预算'] || ''}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>售前负责人</label>
                        <input type="text" name="售前负责人" value="${data['售前负责人'] || ''}">
                    </div>
                    <div class="form-group">
                        <label>交付负责人</label>
                        <input type="text" name="交付负责人" value="${data['交付负责人'] || ''}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>产研负责人</label>
                        <input type="text" name="产研负责人" value="${data['产研负责人'] || ''}">
                    </div>
                    <div class="form-group">
                        <label>客户对接人</label>
                        <input type="text" name="客户对接人" value="${data['客户对接人'] || ''}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>预计开始日期</label>
                        <input type="date" name="预计开始日期" value="${data['预计开始日期'] || ''}">
                    </div>
                    <div class="form-group">
                        <label>预计完成日期</label>
                        <input type="date" name="预计完成日期" value="${data['预计完成日期'] || ''}">
                    </div>
                </div>
            </form>
        `;
    },

    requirement(isEdit = false, data = {}) {
        const roleMap = {
            'planner': '策划/制作人',
            'dev': '研发',
            'operation': '运营/发行/商业化',
            'customer': '客户'
        };
        
        return `
            <form>
                <div class="form-group">
                    <label>需求标题 <span class="required">*</span></label>
                    <input type="text" name="需求标题" value="${data['需求标题'] || ''}" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>关联项目</label>
                        <select name="关联项目">
                            <option value="">请选择项目</option>
                            ${state.projects.map(p => `<option value="${p['项目名称']}" ${data['关联项目'] === p['项目名称'] ? 'selected' : ''}>${p['项目名称']}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>需求类型</label>
                        <select name="需求类型">
                            <option value="功能需求" ${data['需求类型'] === '功能需求' ? 'selected' : ''}>功能需求</option>
                            <option value="技术需求" ${data['需求类型'] === '技术需求' ? 'selected' : ''}>技术需求</option>
                            <option value="优化需求" ${data['需求类型'] === '优化需求' ? 'selected' : ''}>优化需求</option>
                            <option value="Bug修复" ${data['需求类型'] === 'Bug修复' ? 'selected' : ''}>Bug修复</option>
                            <option value="其他" ${data['需求类型'] === '其他' ? 'selected' : ''}>其他</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>需求描述</label>
                    <textarea name="需求描述">${data['需求描述'] || ''}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>提出人角色</label>
                        <select name="提出人角色">
                            <option value="${roleMap[state.currentRole]}" selected>${roleMap[state.currentRole]}</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>提出人</label>
                        <input type="text" name="提出人" value="${data['提出人'] || state.currentUser}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>优先级</label>
                        <select name="优先级">
                            <option value="P0-紧急" ${data['优先级'] === 'P0-紧急' ? 'selected' : ''}>P0-紧急</option>
                            <option value="P1-高" ${data['优先级'] === 'P1-高' ? 'selected' : ''}>P1-高</option>
                            <option value="P2-中" ${data['优先级'] === 'P2-中' ? 'selected' : ''}>P2-中</option>
                            <option value="P3-低" ${data['优先级'] === 'P3-低' ? 'selected' : ''}>P3-低</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>需求状态</label>
                        <select name="需求状态">
                            <option value="待评估" ${data['需求状态'] === '待评估' ? 'selected' : ''}>待评估</option>
                            <option value="已确认" ${data['需求状态'] === '已确认' ? 'selected' : ''}>已确认</option>
                            <option value="开发中" ${data['需求状态'] === '开发中' ? 'selected' : ''}>开发中</option>
                            <option value="待测试" ${data['需求状态'] === '待测试' ? 'selected' : ''}>待测试</option>
                            <option value="已验收" ${data['需求状态'] === '已验收' ? 'selected' : ''}>已验收</option>
                            <option value="已拒绝" ${data['需求状态'] === '已拒绝' ? 'selected' : ''}>已拒绝</option>
                            <option value="已挂起" ${data['需求状态'] === '已挂起' ? 'selected' : ''}>已挂起</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>验收标准</label>
                    <textarea name="验收标准">${data['验收标准'] || ''}</textarea>
                </div>
            </form>
        `;
    },

    task(isEdit = false, data = {}) {
        return `
            <form>
                <div class="form-group">
                    <label>任务标题 <span class="required">*</span></label>
                    <input type="text" name="任务标题" value="${data['任务标题'] || ''}" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>关联项目</label>
                        <select name="关联项目">
                            <option value="">请选择项目</option>
                            ${state.projects.map(p => `<option value="${p['项目名称']}" ${data['关联项目'] === p['项目名称'] ? 'selected' : ''}>${p['项目名称']}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>任务类型</label>
                        <select name="任务类型">
                            <option value="开发" ${data['任务类型'] === '开发' ? 'selected' : ''}>开发</option>
                            <option value="测试" ${data['任务类型'] === '测试' ? 'selected' : ''}>测试</option>
                            <option value="文档" ${data['任务类型'] === '文档' ? 'selected' : ''}>文档</option>
                            <option value="会议" ${data['任务类型'] === '会议' ? 'selected' : ''}>会议</option>
                            <option value="调研" ${data['任务类型'] === '调研' ? 'selected' : ''}>调研</option>
                            <option value="部署" ${data['任务类型'] === '部署' ? 'selected' : ''}>部署</option>
                            <option value="其他" ${data['任务类型'] === '其他' ? 'selected' : ''}>其他</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>负责人</label>
                        <input type="text" name="负责人" value="${data['负责人'] || state.currentUser}">
                    </div>
                    <div class="form-group">
                        <label>优先级</label>
                        <select name="优先级">
                            <option value="紧急" ${data['优先级'] === '紧急' ? 'selected' : ''}>紧急</option>
                            <option value="高" ${data['优先级'] === '高' ? 'selected' : ''}>高</option>
                            <option value="中" ${data['优先级'] === '中' ? 'selected' : ''}>中</option>
                            <option value="低" ${data['优先级'] === '低' ? 'selected' : ''}>低</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>开始日期</label>
                        <input type="date" name="开始日期" value="${data['开始日期'] || ''}">
                    </div>
                    <div class="form-group">
                        <label>截止日期</label>
                        <input type="date" name="截止日期" value="${data['截止日期'] || ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label>进度百分比</label>
                    <input type="number" name="进度百分比" value="${data['进度百分比'] || 0}" min="0" max="100">
                </div>
                <div class="form-group">
                    <label>任务描述</label>
                    <textarea name="任务描述">${data['任务描述'] || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>任务状态</label>
                    <select name="任务状态">
                        <option value="待开始" ${data['任务状态'] === '待开始' ? 'selected' : ''}>待开始</option>
                        <option value="进行中" ${data['任务状态'] === '进行中' ? 'selected' : ''}>进行中</option>
                        <option value="待审核" ${data['任务状态'] === '待审核' ? 'selected' : ''}>待审核</option>
                        <option value="已完成" ${data['任务状态'] === '已完成' ? 'selected' : ''}>已完成</option>
                        <option value="已取消" ${data['任务状态'] === '已取消' ? 'selected' : ''}>已取消</option>
                    </select>
                </div>
            </form>
        `;
    },

    issue(isEdit = false, data = {}) {
        const roleMap = {
            'planner': '策划/制作人',
            'dev': '研发',
            'operation': '运营/发行/商业化',
            'customer': '客户'
        };
        
        return `
            <form>
                <div class="form-group">
                    <label>问题标题 <span class="required">*</span></label>
                    <input type="text" name="问题标题" value="${data['问题标题'] || ''}" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>关联项目</label>
                        <select name="关联项目">
                            <option value="">请选择项目</option>
                            ${state.projects.map(p => `<option value="${p['项目名称']}" ${data['关联项目'] === p['项目名称'] ? 'selected' : ''}>${p['项目名称']}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>问题类型</label>
                        <select name="问题类型">
                            <option value="技术问题" ${data['问题类型'] === '技术问题' ? 'selected' : ''}>技术问题</option>
                            <option value="需求变更" ${data['问题类型'] === '需求变更' ? 'selected' : ''}>需求变更</option>
                            <option value="进度风险" ${data['问题类型'] === '进度风险' ? 'selected' : ''}>进度风险</option>
                            <option value="资源问题" ${data['问题类型'] === '资源问题' ? 'selected' : ''}>资源问题</option>
                            <option value="沟通问题" ${data['问题类型'] === '沟通问题' ? 'selected' : ''}>沟通问题</option>
                            <option value="其他" ${data['问题类型'] === '其他' ? 'selected' : ''}>其他</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>严重程度</label>
                        <select name="严重程度">
                            <option value="致命" ${data['严重程度'] === '致命' ? 'selected' : ''}>致命</option>
                            <option value="严重" ${data['严重程度'] === '严重' ? 'selected' : ''}>严重</option>
                            <option value="一般" ${data['严重程度'] === '一般' ? 'selected' : ''}>一般</option>
                            <option value="轻微" ${data['严重程度'] === '轻微' ? 'selected' : ''}>轻微</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>问题状态</label>
                        <select name="问题状态">
                            <option value="已识别" ${data['问题状态'] === '已识别' ? 'selected' : ''}>已识别</option>
                            <option value="处理中" ${data['问题状态'] === '处理中' ? 'selected' : ''}>处理中</option>
                            <option value="待确认" ${data['问题状态'] === '待确认' ? 'selected' : ''}>待确认</option>
                            <option value="已解决" ${data['问题状态'] === '已解决' ? 'selected' : ''}>已解决</option>
                            <option value="已关闭" ${data['问题状态'] === '已关闭' ? 'selected' : ''}>已关闭</option>
                            <option value="已挂起" ${data['问题状态'] === '已挂起' ? 'selected' : ''}>已挂起</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>提出人角色</label>
                        <select name="提出人角色">
                            <option value="${roleMap[state.currentRole]}" selected>${roleMap[state.currentRole]}</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>提出人</label>
                        <input type="text" name="提出人" value="${data['提出人'] || state.currentUser}">
                    </div>
                </div>
                <div class="form-group">
                    <label>责任人</label>
                    <input type="text" name="责任人" value="${data['责任人'] || ''}">
                </div>
                <div class="form-group">
                    <label>问题描述</label>
                    <textarea name="问题描述">${data['问题描述'] || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>解决方案</label>
                    <textarea name="解决方案">${data['解决方案'] || ''}</textarea>
                </div>
            </form>
        `;
    },

    deliverable(isEdit = false, data = {}) {
        return `
            <form>
                <div class="form-group">
                    <label>交付物名称 <span class="required">*</span></label>
                    <input type="text" name="交付物名称" value="${data['交付物名称'] || ''}" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>关联项目</label>
                        <select name="关联项目">
                            <option value="">请选择项目</option>
                            ${state.projects.map(p => `<option value="${p['项目名称']}" ${data['关联项目'] === p['项目名称'] ? 'selected' : ''}>${p['项目名称']}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>交付物类型</label>
                        <select name="交付物类型">
                            <option value="方案文档" ${data['交付物类型'] === '方案文档' ? 'selected' : ''}>方案文档</option>
                            <option value="设计文档" ${data['交付物类型'] === '设计文档' ? 'selected' : ''}>设计文档</option>
                            <option value="源代码" ${data['交付物类型'] === '源代码' ? 'selected' : ''}>源代码</option>
                            <option value="测试报告" ${data['交付物类型'] === '测试报告' ? 'selected' : ''}>测试报告</option>
                            <option value="用户手册" ${data['交付物类型'] === '用户手册' ? 'selected' : ''}>用户手册</option>
                            <option value="培训材料" ${data['交付物类型'] === '培训材料' ? 'selected' : ''}>培训材料</option>
                            <option value="验收报告" ${data['交付物类型'] === '验收报告' ? 'selected' : ''}>验收报告</option>
                            <option value="其他" ${data['交付物类型'] === '其他' ? 'selected' : ''}>其他</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>负责人</label>
                        <input type="text" name="负责人" value="${data['负责人'] || state.currentUser}">
                    </div>
                    <div class="form-group">
                        <label>审核人</label>
                        <input type="text" name="审核人" value="${data['审核人'] || ''}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>交付状态</label>
                        <select name="交付状态">
                            <option value="编写中" ${data['交付状态'] === '编写中' ? 'selected' : ''}>编写中</option>
                            <option value="待审核" ${data['交付状态'] === '待审核' ? 'selected' : ''}>待审核</option>
                            <option value="审核通过" ${data['交付状态'] === '审核通过' ? 'selected' : ''}>审核通过</option>
                            <option value="已交付" ${data['交付状态'] === '已交付' ? 'selected' : ''}>已交付</option>
                            <option value="已验收" ${data['交付状态'] === '已验收' ? 'selected' : ''}>已验收</option>
                            <option value="需修改" ${data['交付状态'] === '需修改' ? 'selected' : ''}>需修改</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>版本号</label>
                        <input type="text" name="版本号" value="${data['版本号'] || 'v1.0'}">
                    </div>
                </div>
                <div class="form-group">
                    <label>计划交付日期</label>
                    <input type="date" name="计划交付日期" value="${data['计划交付日期'] || ''}">
                </div>
                <div class="form-group">
                    <label>交付说明</label>
                    <textarea name="交付说明">${data['交付说明'] || ''}</textarea>
                </div>
            </form>
        `;
    },

    communication(isEdit = false, data = {}) {
        const roleMap = {
            'planner': '策划/制作人',
            'dev': '研发',
            'operation': '运营/发行/商业化',
            'customer': '客户'
        };
        
        return `
            <form>
                <div class="form-group">
                    <label>沟通主题 <span class="required">*</span></label>
                    <input type="text" name="沟通主题" value="${data['沟通主题'] || ''}" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>关联项目</label>
                        <select name="关联项目">
                            <option value="">请选择项目</option>
                            ${state.projects.map(p => `<option value="${p['项目名称']}" ${data['关联项目'] === p['项目名称'] ? 'selected' : ''}>${p['项目名称']}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>沟通类型</label>
                        <select name="沟通类型">
                            <option value="会议" ${data['沟通类型'] === '会议' ? 'selected' : ''}>会议</option>
                            <option value="邮件" ${data['沟通类型'] === '邮件' ? 'selected' : ''}>邮件</option>
                            <option value="电话" ${data['沟通类型'] === '电话' ? 'selected' : ''}>电话</option>
                            <option value="即时通讯" ${data['沟通类型'] === '即时通讯' ? 'selected' : ''}>即时通讯</option>
                            <option value="现场拜访" ${data['沟通类型'] === '现场拜访' ? 'selected' : ''}>现场拜访</option>
                            <option value="其他" ${data['沟通类型'] === '其他' ? 'selected' : ''}>其他</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>参与角色（多选，用逗号分隔）</label>
                    <input type="text" name="参与角色" value="${data['参与角色'] || roleMap[state.currentRole]}" placeholder="如：售前,产研,客户">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>记录人</label>
                        <input type="text" name="记录人" value="${data['记录人'] || state.currentUser}">
                    </div>
                    <div class="form-group">
                        <label>沟通日期</label>
                        <input type="date" name="沟通日期" value="${data['沟通日期'] || new Date().toISOString().split('T')[0]}">
                    </div>
                </div>
                <div class="form-group">
                    <label>沟通内容</label>
                    <textarea name="沟通内容">${data['沟通内容'] || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>待办事项</label>
                    <textarea name="待办事项">${data['待办事项'] || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>下次跟进日期</label>
                    <input type="date" name="下次跟进" value="${data['下次跟进'] || ''}">
                </div>
            </form>
        `;
    }
};

// ========== 主应用 ==========
const App = {
    /**
     * 初始化应用
     */
    init() {
        this.bindEvents();
        this.checkLogin();
    },

    /**
     * 绑定事件
     */
    bindEvents() {
        // 角色选择
        document.querySelectorAll('.role-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                state.currentRole = card.dataset.role;
                this.checkLoginBtn();
            });
        });

        // 登录按钮
        document.getElementById('loginBtn').addEventListener('click', () => this.login());

        // 退出登录
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());

        // 刷新数据
        document.getElementById('refreshBtn').addEventListener('click', () => this.loadAllData());

        // 标签页切换
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // 新建按钮
        document.getElementById('addProjectBtn').addEventListener('click', () => this.addProject());
        document.getElementById('addRequirementBtn').addEventListener('click', () => this.addRequirement());
        document.getElementById('addTaskBtn').addEventListener('click', () => this.addTask());
        document.getElementById('addIssueBtn').addEventListener('click', () => this.addIssue());
        document.getElementById('addDeliverableBtn').addEventListener('click', () => this.addDeliverable());
        document.getElementById('addCommunicationBtn').addEventListener('click', () => this.addCommunication());

        // 筛选器
        document.getElementById('projectStatusFilter').addEventListener('change', () => this.renderProjects());
        document.getElementById('projectPhaseFilter').addEventListener('change', () => this.renderProjects());
        document.getElementById('reqStatusFilter').addEventListener('change', () => this.renderRequirements());
        document.getElementById('reqTypeFilter').addEventListener('change', () => this.renderRequirements());
        document.getElementById('taskStatusFilter').addEventListener('change', () => this.renderTasks());
        document.getElementById('taskPriorityFilter').addEventListener('change', () => this.renderTasks());
        document.getElementById('issueStatusFilter').addEventListener('change', () => this.renderIssues());
        document.getElementById('issueSeverityFilter').addEventListener('change', () => this.renderIssues());
        document.getElementById('deliverableStatusFilter').addEventListener('change', () => this.renderDeliverables());
        document.getElementById('commTypeFilter').addEventListener('change', () => this.renderCommunications());

        // 模态框关闭
        document.querySelector('.modal-close').addEventListener('click', () => UI.hideModal());
        document.getElementById('modal').addEventListener('click', (e) => {
            if (e.target.id === 'modal') UI.hideModal();
        });
    },

    /**
     * 检查登录按钮状态
     */
    checkLoginBtn() {
        const userName = document.getElementById('userName').value.trim();
        document.getElementById('loginBtn').disabled = !state.currentRole || !userName;
    },

    /**
     * 检查登录状态
     */
    checkLogin() {
        const savedRole = localStorage.getItem('userRole');
        const savedUser = localStorage.getItem('userName');
        
        if (savedRole && savedUser) {
            state.currentRole = savedRole;
            state.currentUser = savedUser;
            this.showMainApp();
            this.loadAllData();
        }
    },

    /**
     * 登录
     */
    login() {
        const userName = document.getElementById('userName').value.trim();
        if (!state.currentRole || !userName) {
            UI.showToast('请选择角色并输入姓名', 'warning');
            return;
        }

        state.currentUser = userName;
        localStorage.setItem('userRole', state.currentRole);
        localStorage.setItem('userName', userName);

        UI.showToast(`欢迎 ${userName}！您以【${ROLE_PERMISSIONS[state.currentRole].name}】角色登录`, 'success');
        this.showMainApp();
        this.loadAllData();
    },

    /**
     * 退出登录
     */
    logout() {
        localStorage.removeItem('userRole');
        localStorage.removeItem('userName');
        state.currentRole = null;
        state.currentUser = null;
        
        document.getElementById('loginPage').classList.add('active');
        document.getElementById('mainApp').classList.remove('active');
        document.getElementById('userName').value = '';
        document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
    },

    /**
     * 显示主应用
     */
    showMainApp() {
        document.getElementById('loginPage').classList.remove('active');
        document.getElementById('mainApp').classList.add('active');
        
        const roleInfo = ROLE_PERMISSIONS[state.currentRole];
        document.getElementById('currentRole').textContent = roleInfo.name;
        document.getElementById('currentRole').dataset.role = state.currentRole;
        document.getElementById('currentUser').textContent = state.currentUser;

        // 根据角色控制按钮显示
        this.updateRolePermissions();
    },

    /**
     * 更新角色权限
     */
    updateRolePermissions() {
        const role = state.currentRole;
        const permissions = ROLE_PERMISSIONS[role];
        
        // 按钮ID与模块名的映射
        const btnToModule = {
            'addProjectBtn': 'projects',
            'addRequirementBtn': 'requirements',
            'addTaskBtn': 'tasks',
            'addIssueBtn': 'issues',
            'addDeliverableBtn': 'deliverables',
            'addCommunicationBtn': 'communications'
        };
        
        // 控制新建按钮
        Object.entries(btnToModule).forEach(([id, module]) => {
            const btn = document.getElementById(id);
            if (btn) {
                if (permissions.canCreate.includes(module)) {
                    btn.style.display = '';
                } else {
                    btn.style.display = 'none';
                }
            }
        });
    },

    /**
     * 切换标签页
     */
    switchTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabId);
        });
    },

    /**
     * 加载所有数据
     */
    async loadAllData() {
        try {
            await Promise.all([
                this.loadProjects(),
                this.loadRequirements(),
                this.loadTasks(),
                this.loadIssues(),
                this.loadDeliverables(),
                this.loadCommunications()
            ]);
            
            this.updateStats();
            this.renderAll();
        } catch (error) {
            console.error('加载数据失败:', error);
            UI.showToast('数据加载失败，请检查网络和Token配置', 'error');
        }
    },

    async loadProjects() {
        try {
            const records = await KDocsAPI.queryRecords(CONFIG.SHEETS.projects);
            state.projects = records;
        } catch (error) {
            console.error('加载项目失败:', error);
            state.projects = [];
        }
    },

    async loadRequirements() {
        try {
            const records = await KDocsAPI.queryRecords(CONFIG.SHEETS.requirements);
            state.requirements = records;
        } catch (error) {
            console.error('加载需求失败:', error);
            state.requirements = [];
        }
    },

    async loadTasks() {
        try {
            const records = await KDocsAPI.queryRecords(CONFIG.SHEETS.tasks);
            state.tasks = records;
        } catch (error) {
            console.error('加载任务失败:', error);
            state.tasks = [];
        }
    },

    async loadIssues() {
        try {
            const records = await KDocsAPI.queryRecords(CONFIG.SHEETS.issues);
            state.issues = records;
        } catch (error) {
            console.error('加载问题失败:', error);
            state.issues = [];
        }
    },

    async loadDeliverables() {
        try {
            const records = await KDocsAPI.queryRecords(CONFIG.SHEETS.deliverables);
            state.deliverables = records;
        } catch (error) {
            console.error('加载交付物失败:', error);
            state.deliverables = [];
        }
    },

    async loadCommunications() {
        try {
            const records = await KDocsAPI.queryRecords(CONFIG.SHEETS.communications);
            state.communications = records;
        } catch (error) {
            console.error('加载沟通记录失败:', error);
            state.communications = [];
        }
    },

    /**
     * 更新统计
     */
    updateStats() {
        document.getElementById('projectCount').textContent = state.projects.length;
        document.getElementById('requirementCount').textContent = state.requirements.length;
        document.getElementById('taskCount').textContent = state.tasks.length;
        document.getElementById('issueCount').textContent = state.issues.length;
    },

    /**
     * 渲染所有列表
     */
    renderAll() {
        this.renderProjects();
        this.renderRequirements();
        this.renderTasks();
        this.renderIssues();
        this.renderDeliverables();
        this.renderCommunications();
    },

    renderProjects() {
        const statusFilter = document.getElementById('projectStatusFilter').value;
        const phaseFilter = document.getElementById('projectPhaseFilter').value;
        
        let filtered = state.projects;
        if (statusFilter) {
            filtered = filtered.filter(p => p['项目状态'] === statusFilter);
        }
        if (phaseFilter) {
            filtered = filtered.filter(p => p['当前阶段'] === phaseFilter);
        }

        const container = document.getElementById('projectList');
        if (filtered.length === 0) {
            container.innerHTML = UI.renderEmptyState('📋', '暂无项目', '点击右上角"新建项目"创建第一个项目');
        } else {
            container.innerHTML = filtered.map(p => UI.renderProjectCard(p)).join('');
        }
    },

    renderRequirements() {
        const statusFilter = document.getElementById('reqStatusFilter').value;
        const typeFilter = document.getElementById('reqTypeFilter').value;
        
        let filtered = state.requirements;
        if (statusFilter) {
            filtered = filtered.filter(r => r['需求状态'] === statusFilter);
        }
        if (typeFilter) {
            filtered = filtered.filter(r => r['需求类型'] === typeFilter);
        }

        const container = document.getElementById('requirementList');
        if (filtered.length === 0) {
            container.innerHTML = UI.renderEmptyState('📝', '暂无需求', '点击右上角"提交需求"创建新需求');
        } else {
            container.innerHTML = filtered.map(r => UI.renderRequirementCard(r)).join('');
        }
    },

    renderTasks() {
        const statusFilter = document.getElementById('taskStatusFilter').value;
        const priorityFilter = document.getElementById('taskPriorityFilter').value;
        
        let filtered = state.tasks;
        if (statusFilter) {
            filtered = filtered.filter(t => t['任务状态'] === statusFilter);
        }
        if (priorityFilter) {
            filtered = filtered.filter(t => t['优先级'] === priorityFilter);
        }

        const container = document.getElementById('taskList');
        if (filtered.length === 0) {
            container.innerHTML = UI.renderEmptyState('✅', '暂无任务', '点击右上角"创建任务"创建新任务');
        } else {
            container.innerHTML = filtered.map(t => UI.renderTaskCard(t)).join('');
        }
    },

    renderIssues() {
        const statusFilter = document.getElementById('issueStatusFilter').value;
        const severityFilter = document.getElementById('issueSeverityFilter').value;
        
        let filtered = state.issues;
        if (statusFilter) {
            filtered = filtered.filter(i => i['问题状态'] === statusFilter);
        }
        if (severityFilter) {
            filtered = filtered.filter(i => i['严重程度'] === severityFilter);
        }

        const container = document.getElementById('issueList');
        if (filtered.length === 0) {
            container.innerHTML = UI.renderEmptyState('⚠️', '暂无问题', '点击右上角"提交问题"反馈问题');
        } else {
            container.innerHTML = filtered.map(i => UI.renderIssueCard(i)).join('');
        }
    },

    renderDeliverables() {
        const statusFilter = document.getElementById('deliverableStatusFilter').value;
        
        let filtered = state.deliverables;
        if (statusFilter) {
            filtered = filtered.filter(d => d['交付状态'] === statusFilter);
        }

        const container = document.getElementById('deliverableList');
        if (filtered.length === 0) {
            container.innerHTML = UI.renderEmptyState('📦', '暂无交付物', '点击右上角"添加交付物"上传文档');
        } else {
            container.innerHTML = filtered.map(d => UI.renderDeliverableCard(d)).join('');
        }
    },

    renderCommunications() {
        const typeFilter = document.getElementById('commTypeFilter').value;
        
        let filtered = state.communications;
        if (typeFilter) {
            filtered = filtered.filter(c => c['沟通类型'] === typeFilter);
        }

        const container = document.getElementById('communicationList');
        if (filtered.length === 0) {
            container.innerHTML = UI.renderEmptyState('💬', '暂无沟通记录', '点击右上角"添加记录"记录沟通');
        } else {
            container.innerHTML = filtered.map(c => UI.renderCommunicationCard(c)).join('');
        }
    },

    // ========== CRUD操作 ==========
    
    // 项目
    addProject() {
        UI.showModal('新建项目', FormTemplates.project(), async (data) => {
            try {
                await KDocsAPI.addRecord(CONFIG.SHEETS.projects, data);
                UI.showToast('项目创建成功', 'success');
                UI.hideModal();
                await this.loadProjects();
                this.updateStats();
                this.renderProjects();
            } catch (error) {
                UI.showToast('创建失败: ' + error.message, 'error');
            }
        });
    },

    async editProject(recordId) {
        const project = state.projects.find(p => p.record_id === recordId);
        if (!project) return;
        
        UI.showModal('编辑项目', FormTemplates.project(true, project), async (data) => {
            try {
                await KDocsAPI.updateRecord(CONFIG.SHEETS.projects, recordId, data);
                UI.showToast('项目更新成功', 'success');
                UI.hideModal();
                await this.loadProjects();
                this.renderProjects();
            } catch (error) {
                UI.showToast('更新失败: ' + error.message, 'error');
            }
        });
    },

    // 需求
    addRequirement() {
        UI.showModal('提交需求', FormTemplates.requirement(), async (data) => {
            try {
                await KDocsAPI.addRecord(CONFIG.SHEETS.requirements, data);
                UI.showToast('需求提交成功', 'success');
                UI.hideModal();
                await this.loadRequirements();
                this.updateStats();
                this.renderRequirements();
            } catch (error) {
                UI.showToast('提交失败: ' + error.message, 'error');
            }
        });
    },

    async editRequirement(recordId) {
        const req = state.requirements.find(r => r.record_id === recordId);
        if (!req) return;
        
        UI.showModal('编辑需求', FormTemplates.requirement(true, req), async (data) => {
            try {
                await KDocsAPI.updateRecord(CONFIG.SHEETS.requirements, recordId, data);
                UI.showToast('需求更新成功', 'success');
                UI.hideModal();
                await this.loadRequirements();
                this.renderRequirements();
            } catch (error) {
                UI.showToast('更新失败: ' + error.message, 'error');
            }
        });
    },

    createTaskFromReq(recordId) {
        const req = state.requirements.find(r => r.record_id === recordId);
        const data = {
            关联项目: req?.['关联项目'] || '',
            任务标题: `【需求关联】${req?.['需求标题'] || ''}`,
            任务描述: req?.['需求描述'] || '',
            优先级: req?.['优先级']?.replace('P', '').replace('-', '') || '中'
        };
        
        UI.showModal('创建任务', FormTemplates.task(false, data), async (formData) => {
            try {
                await KDocsAPI.addRecord(CONFIG.SHEETS.tasks, formData);
                UI.showToast('任务创建成功', 'success');
                UI.hideModal();
                await this.loadTasks();
                this.updateStats();
                this.renderTasks();
            } catch (error) {
                UI.showToast('创建失败: ' + error.message, 'error');
            }
        });
    },

    // 任务
    addTask() {
        UI.showModal('创建任务', FormTemplates.task(), async (data) => {
            try {
                await KDocsAPI.addRecord(CONFIG.SHEETS.tasks, data);
                UI.showToast('任务创建成功', 'success');
                UI.hideModal();
                await this.loadTasks();
                this.updateStats();
                this.renderTasks();
            } catch (error) {
                UI.showToast('创建失败: ' + error.message, 'error');
            }
        });
    },

    async editTask(recordId) {
        const task = state.tasks.find(t => t.record_id === recordId);
        if (!task) return;
        
        UI.showModal('编辑任务', FormTemplates.task(true, task), async (data) => {
            try {
                await KDocsAPI.updateRecord(CONFIG.SHEETS.tasks, recordId, data);
                UI.showToast('任务更新成功', 'success');
                UI.hideModal();
                await this.loadTasks();
                this.renderTasks();
            } catch (error) {
                UI.showToast('更新失败: ' + error.message, 'error');
            }
        });
    },

    // 问题
    addIssue() {
        UI.showModal('提交问题', FormTemplates.issue(), async (data) => {
            try {
                await KDocsAPI.addRecord(CONFIG.SHEETS.issues, data);
                UI.showToast('问题提交成功', 'success');
                UI.hideModal();
                await this.loadIssues();
                this.updateStats();
                this.renderIssues();
            } catch (error) {
                UI.showToast('提交失败: ' + error.message, 'error');
            }
        });
    },

    async editIssue(recordId) {
        const issue = state.issues.find(i => i.record_id === recordId);
        if (!issue) return;
        
        UI.showModal('编辑问题', FormTemplates.issue(true, issue), async (data) => {
            try {
                await KDocsAPI.updateRecord(CONFIG.SHEETS.issues, recordId, data);
                UI.showToast('问题更新成功', 'success');
                UI.hideModal();
                await this.loadIssues();
                this.renderIssues();
            } catch (error) {
                UI.showToast('更新失败: ' + error.message, 'error');
            }
        });
    },

    // 交付物
    addDeliverable() {
        UI.showModal('添加交付物', FormTemplates.deliverable(), async (data) => {
            try {
                await KDocsAPI.addRecord(CONFIG.SHEETS.deliverables, data);
                UI.showToast('交付物添加成功', 'success');
                UI.hideModal();
                await this.loadDeliverables();
                this.renderDeliverables();
            } catch (error) {
                UI.showToast('添加失败: ' + error.message, 'error');
            }
        });
    },

    async editDeliverable(recordId) {
        const item = state.deliverables.find(d => d.record_id === recordId);
        if (!item) return;
        
        UI.showModal('编辑交付物', FormTemplates.deliverable(true, item), async (data) => {
            try {
                await KDocsAPI.updateRecord(CONFIG.SHEETS.deliverables, recordId, data);
                UI.showToast('交付物更新成功', 'success');
                UI.hideModal();
                await this.loadDeliverables();
                this.renderDeliverables();
            } catch (error) {
                UI.showToast('更新失败: ' + error.message, 'error');
            }
        });
    },

    // 沟通记录
    addCommunication() {
        UI.showModal('添加沟通记录', FormTemplates.communication(), async (data) => {
            try {
                await KDocsAPI.addRecord(CONFIG.SHEETS.communications, data);
                UI.showToast('沟通记录添加成功', 'success');
                UI.hideModal();
                await this.loadCommunications();
                this.renderCommunications();
            } catch (error) {
                UI.showToast('添加失败: ' + error.message, 'error');
            }
        });
    },

    async editCommunication(recordId) {
        const comm = state.communications.find(c => c.record_id === recordId);
        if (!comm) return;
        
        UI.showModal('沟通详情', FormTemplates.communication(true, comm), async (data) => {
            try {
                await KDocsAPI.updateRecord(CONFIG.SHEETS.communications, recordId, data);
                UI.showToast('沟通记录更新成功', 'success');
                UI.hideModal();
                await this.loadCommunications();
                this.renderCommunications();
            } catch (error) {
                UI.showToast('更新失败: ' + error.message, 'error');
            }
        });
    }
};

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
    App.init();
    
    // 监听用户名输入
    document.getElementById('userName').addEventListener('input', () => {
        App.checkLoginBtn();
    });

    // 全局关闭模态框函数
    window.closeModal = () => UI.hideModal();
});
