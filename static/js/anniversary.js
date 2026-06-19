/**
 * Anniversary page JavaScript
 * Handles CRUD operations, rule management, and notifications
 */

(function() {
  'use strict';

  let currentAnnivId = null;
  let currentRuleId = null;
  let deleteTarget = null; // { type: 'anniv'|'rule', id, annivId }

  // ===== Toast =====
  function showToast(msg, type) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast show' + (type === 'error' ? ' toast-error' : ' toast-success');
    setTimeout(() => { toast.className = 'toast'; }, 3000);
  }

  // ===== Modal helpers =====
  function openModal(id) {
    document.getElementById(id).classList.add('active');
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove('active');
  }

  // Close buttons
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  // Click overlay to close
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  });

  // ===== API helpers =====
  async function api(url, method, body) {
    const opts = {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (res.status === 401) {
      showToast('登录已过期，请重新登录', 'error');
      setTimeout(() => { window.location.href = '/admin'; }, 1500);
      return null;
    }
    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error('服务器内部错误，请稍后重试');
    }
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
  }

  // ===== Load Anniversaries =====
  async function loadAnniversaries() {
    try {
      const data = await api('/api/anniversary/list');
      if (!data) return;
      renderAnniversaries(data.anniversaries);
    } catch (e) {
      document.getElementById('annivList').innerHTML =
        '<p style="color:var(--danger);">加载失败: ' + e.message + '</p>';
    }
  }

  function renderAnniversaries(list) {
    const container = document.getElementById('annivList');
    if (!list || list.length === 0) {
      container.innerHTML = '<p class="empty-text">还没有纪念日，点击上方按钮创建第一个吧 💕</p>';
      return;
    }

    container.innerHTML = list.map(anniv => {
      const daysPassed = anniv.days_passed;
      const isFuture = daysPassed < 0;
      const daysLabel = isFuture ? '倒计时' : '已过去';
      const daysNum = Math.abs(daysPassed);

      const rulesHtml = anniv.rules && anniv.rules.length > 0
        ? anniv.rules.map(r => `
            <div class="rule-item ${r.enabled ? '' : 'rule-disabled'}">
              <span class="rule-expr">${escapeHtml(r.expression)}</span>
              <span class="rule-badge ${r.enabled ? 'rule-on' : 'rule-off'}">${r.enabled ? '启用' : '禁用'}</span>
              <button class="btn-icon" onclick="window._anniv.editRule(${r.id}, '${escapeAttr(r.expression)}', ${r.enabled ? 'true' : 'false'})" title="编辑">✏️</button>
              <button class="btn-icon btn-icon-danger" onclick="window._anniv.deleteRule(${anniv.id}, ${r.id})" title="删除">🗑️</button>
            </div>
          `).join('')
        : '<p class="no-rules">暂无提醒规则</p>';

      return `
        <div class="anniv-card">
          <div class="anniv-card-top">
            <span class="anniv-emoji">${anniv.emoji || '💕'}</span>
            <div class="anniv-info">
              <h3 class="anniv-name">${escapeHtml(anniv.name)}</h3>
              <p class="anniv-date">${anniv.date}</p>
              ${anniv.description ? '<p class="anniv-desc">' + escapeHtml(anniv.description) + '</p>' : ''}
            </div>
          </div>
          <div class="anniv-days">
            <span class="days-number">${daysNum}</span>
            <span class="days-label">${daysLabel}</span>
          </div>
          <div class="anniv-actions">
            <button class="btn btn-sm btn-secondary" onclick="window._anniv.edit(${anniv.id}, '${escapeAttr(anniv.name)}', '${anniv.date}', '${escapeAttr(anniv.emoji || '')}', '${escapeAttr(anniv.description || '')}')">编辑</button>
            <button class="btn btn-sm btn-secondary" onclick="window._anniv.manageRules(${anniv.id}, '${escapeAttr(anniv.name)}')">规则</button>
            <button class="btn btn-sm btn-secondary" onclick="window._anniv.notify(${anniv.id}, '${escapeAttr(anniv.name)}')">通知</button>
            <button class="btn btn-sm btn-danger" onclick="window._anniv.deleteAnniv(${anniv.id}, '${escapeAttr(anniv.name)}')">删除</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  // ===== Add Anniversary =====
  document.getElementById('addAnnivBtn').addEventListener('click', () => {
    document.getElementById('annivModalTitle').textContent = '新建纪念日';
    document.getElementById('annivId').value = '';
    document.getElementById('annivName').value = '';
    document.getElementById('annivDate').value = '';
    document.getElementById('annivEmoji').value = '💕';
    document.getElementById('annivDesc').value = '';
    openModal('annivModal');
  });

  // ===== Edit Anniversary =====
  window._anniv = {};
  window._anniv.edit = function(id, name, annivDate, emoji, desc) {
    document.getElementById('annivModalTitle').textContent = '编辑纪念日';
    document.getElementById('annivId').value = id;
    document.getElementById('annivName').value = name;
    document.getElementById('annivDate').value = annivDate;
    document.getElementById('annivEmoji').value = emoji || '💕';
    document.getElementById('annivDesc').value = desc || '';
    openModal('annivModal');
  };

  // ===== Save Anniversary =====
  document.getElementById('annivForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('annivId').value;
    const body = {
      name: document.getElementById('annivName').value.trim(),
      date: document.getElementById('annivDate').value,
      emoji: document.getElementById('annivEmoji').value.trim() || '💕',
      description: document.getElementById('annivDesc').value.trim(),
    };

    try {
      if (id) {
        await api('/api/anniversary/' + id, 'PUT', body);
        showToast('纪念日已更新', 'success');
      } else {
        await api('/api/anniversary', 'POST', body);
        showToast('纪念日已创建', 'success');
      }
      closeModal('annivModal');
      loadAnniversaries();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // ===== Delete Anniversary =====
  window._anniv.deleteAnniv = function(id, name) {
    deleteTarget = { type: 'anniv', id: id };
    document.getElementById('deleteMessage').textContent = '确定要删除纪念日 "' + name + '" 吗？此操作不可撤销，关联的提醒规则也会被删除。';
    openModal('deleteModal');
  };

  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.type === 'anniv') {
        await api('/api/anniversary/' + deleteTarget.id, 'DELETE');
        showToast('纪念日已删除', 'success');
        loadAnniversaries();
      } else if (deleteTarget.type === 'rule') {
        await api('/api/anniversary/' + deleteTarget.annivId + '/rule/' + deleteTarget.id, 'DELETE');
        showToast('规则已删除', 'success');
        loadRules(deleteTarget.annivId);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }

    closeModal('deleteModal');
    deleteTarget = null;
  });

  // ===== Manage Rules =====
  window._anniv.manageRules = function(annivId, name) {
    currentAnnivId = annivId;
    document.getElementById('rulesModalTitle').textContent = '提醒规则 - ' + name;
    loadRules(annivId);
    openModal('rulesModal');
  };

  async function loadRules(annivId) {
    try {
      const data = await api('/api/anniversary/' + annivId + '/rules');
      if (!data) return;
      renderRules(data.rules);
    } catch (e) {
      document.getElementById('rulesList').innerHTML =
        '<p style="color:var(--danger);">加载失败: ' + e.message + '</p>';
    }
  }

  function renderRules(rules) {
    const container = document.getElementById('rulesList');
    if (!rules || rules.length === 0) {
      container.innerHTML = '<p style="color: var(--text-secondary);">暂无提醒规则</p>';
      return;
    }

    container.innerHTML = rules.map(r => `
      <div class="rule-item ${r.enabled ? '' : 'rule-disabled'}">
        <span class="rule-expr">${escapeHtml(r.expression)}</span>
        <span class="rule-type-badge">${ruleTypeLabel(r.rule_type)}</span>
        <span class="rule-badge ${r.enabled ? 'rule-on' : 'rule-off'}">${r.enabled ? '启用' : '禁用'}</span>
        ${r.last_triggered ? '<span class="rule-last">上次触发: ' + r.last_triggered + '</span>' : ''}
        <button class="btn-icon" onclick="window._anniv.editRule(${r.id}, '${escapeAttr(r.expression)}', ${r.enabled ? 'true' : 'false'})" title="编辑">✏️</button>
        <button class="btn-icon btn-icon-danger" onclick="window._anniv.deleteRule(${r.anniversary_id}, ${r.id})" title="删除">🗑️</button>
      </div>
    `).join('');
  }

  function ruleTypeLabel(type) {
    const map = { before: '提前提醒', periodic: '周期提醒', fixed: '固定日期', expression: '表达式' };
    return map[type] || type;
  }

  // ===== Add Rule =====
  document.getElementById('addRuleBtn').addEventListener('click', async () => {
    const expression = document.getElementById('ruleExpression').value.trim();
    if (!expression) {
      showToast('请输入规则表达式', 'error');
      return;
    }

    try {
      await api('/api/anniversary/' + currentAnnivId + '/rule', 'POST', { expression: expression });
      document.getElementById('ruleExpression').value = '';
      showToast('规则已添加', 'success');
      loadRules(currentAnnivId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // ===== Edit Rule =====
  window._anniv.editRule = function(ruleId, expression, enabled) {
    currentRuleId = ruleId;
    document.getElementById('editRuleId').value = ruleId;
    document.getElementById('editRuleExpression').value = expression;
    document.getElementById('editRuleEnabled').checked = enabled;
    openModal('editRuleModal');
  };

  document.getElementById('editRuleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ruleId = document.getElementById('editRuleId').value;
    const body = {
      expression: document.getElementById('editRuleExpression').value.trim(),
      enabled: document.getElementById('editRuleEnabled').checked,
    };

    try {
      await api('/api/anniversary/' + currentAnnivId + '/rule/' + ruleId, 'PUT', body);
      showToast('规则已更新', 'success');
      closeModal('editRuleModal');
      loadRules(currentAnnivId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // ===== Delete Rule =====
  window._anniv.deleteRule = function(annivId, ruleId) {
    deleteTarget = { type: 'rule', id: ruleId, annivId: annivId };
    document.getElementById('deleteMessage').textContent = '确定要删除这条提醒规则吗？';
    openModal('deleteModal');
  };

  // ===== Notify =====
  window._anniv.notify = function(annivId, name) {
    currentAnnivId = annivId;
    document.getElementById('notifyPreview').textContent = '正在准备通知 "' + name + '" ...';
    openModal('notifyModal');
  };

  document.getElementById('confirmNotifyBtn').addEventListener('click', async () => {
    try {
      const data = await api('/api/anniversary/' + currentAnnivId + '/notify', 'POST');
      if (!data) return; // 401 — api() already redirecting
      if (data.success) {
        showToast('通知已发送', 'success');
      } else {
        showToast(data.error || '通知发送失败，请检查飞书 Webhook 配置', 'error');
      }
      closeModal('notifyModal');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // ===== Init =====
  loadAnniversaries();

})();
