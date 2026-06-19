/**
 * Admin Dashboard JavaScript
 */

class AdminDashboard {
  constructor() {
    this.currentPage = 1;
    this.perPage = 20;
    this.totalPages = 1;
    this.chart = null;
    
    this.init();
  }

  async init() {
    // Bind events
    document.getElementById('filterBtn').addEventListener('click', () => this.loadVisits());
    document.getElementById('clearFilterBtn').addEventListener('click', () => this.clearFilters());
    document.getElementById('prevPage').addEventListener('click', () => this.prevPage());
    document.getElementById('nextPage').addEventListener('click', () => this.nextPage());
    document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
    document.getElementById('notifyToggle').addEventListener('change', (e) => this.toggleNotification(e));
    document.getElementById('saveWebhookBtn').addEventListener('click', () => this.saveWebhookUrl());
    
    // Anniversary check time events
    document.getElementById('saveCheckTimeBtn').addEventListener('click', () => this.saveCheckTime());
    document.getElementById('cancelCheckTimeBtn').addEventListener('click', () => this.cancelCheckTime());

    // VPN settings events
    document.getElementById('saveVpnSettingsBtn').addEventListener('click', () => this.saveVpnSettings());

    // Load data
    await this.loadStats();
    await this.loadVisits();
    await this.loadSettings();
    await this.loadVpnSettings();
    await this.loadAccounts();
    await this.loadAnniversaryCheckTime();

    // Account management events
    document.getElementById('addAccountBtn').addEventListener('click', () => this.addAccount());
  }

  async loadStats() {
    try {
      const response = await fetch('/api/admin/stats');
      const data = await response.json();
      
      document.getElementById('statTotal').textContent = data.total;
      document.getElementById('statUnique').textContent = data.unique;
      document.getElementById('statToday').textContent = data.today;
      
      this.renderChart(data.trend);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  renderChart(trend) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    
    if (this.chart) {
      this.chart.destroy();
    }
    
    const labels = trend.map(t => t.day);
    const values = trend.map(t => t.count);
    
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '访问量',
          data: values,
          borderColor: '#6c63ff',
          backgroundColor: 'rgba(108, 99, 255, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  }

  async loadVisits() {
    const ipFilter = document.getElementById('filterIP').value;
    const pageFilter = document.getElementById('filterPage').value;
    
    try {
      const params = new URLSearchParams({
        page: this.currentPage,
        per_page: this.perPage,
        ip: ipFilter,
        page_filter: pageFilter
      });
      
      const response = await fetch(`/api/admin/visits?${params}`);
      const data = await response.json();
      
      this.totalPages = Math.ceil(data.total / this.perPage);
      this.renderVisits(data.visits);
      this.updatePagination();
    } catch (error) {
      console.error('Failed to load visits:', error);
    }
  }

  renderVisits(visits) {
    const tbody = document.getElementById('visitsBody');
    
    if (visits.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;">暂无数据</td></tr>';
      return;
    }
    
    tbody.innerHTML = visits.map(v => {
      let geo = '未知';
      try {
        const geoData = JSON.parse(v.geo_info);
        geo = `${geoData.city || '未知'}, ${geoData.country || '未知'}`;
      } catch (e) {}
      
      return `
        <tr>
          <td>${v.timestamp}</td>
          <td>${v.ip}</td>
          <td>${geo}</td>
          <td>${v.browser || '-'}</td>
          <td>${v.os || '-'}</td>
          <td>${v.page}</td>
          <td>${v.referrer || '直接访问'}</td>
        </tr>
      `;
    }).join('');
  }

  updatePagination() {
    document.getElementById('pageInfo').textContent = `第 ${this.currentPage} / ${this.totalPages} 页`;
    document.getElementById('prevPage').disabled = this.currentPage === 1;
    document.getElementById('nextPage').disabled = this.currentPage >= this.totalPages;
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadVisits();
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadVisits();
    }
  }

  clearFilters() {
    document.getElementById('filterIP').value = '';
    document.getElementById('filterPage').value = '';
    this.currentPage = 1;
    this.loadVisits();
  }

  async loadSettings() {
    try {
      const response = await fetch('/api/admin/settings');
      const data = await response.json();
      document.getElementById('notifyToggle').checked = data.feishu_notify_enabled;
      document.getElementById('webhookUrl').value = data.feishu_webhook_url || '';
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  async loadVpnSettings() {
    try {
      const response = await fetch('/api/admin/settings');
      const data = await response.json();
      document.getElementById('vpnMaxRecords').value = data.vpn_session_history_max || '5000';
      document.getElementById('vpnPageSize').value = data.vpn_session_history_page_size || '50';
      document.getElementById('vpnActiveWindow').value = data.vpn_active_window_sec || '60';
    } catch (error) {
      console.error('Failed to load VPN settings:', error);
    }
  }

  async saveVpnSettings() {
    const btn = document.getElementById('saveVpnSettingsBtn');
    const msg = document.getElementById('vpnSettingsMsg');
    msg.textContent = '';
    msg.style.color = '';

    // 本地校验：3 个值必须是合法非负整数
    const fields = [
      { id: 'vpnMaxRecords', key: 'vpn_session_history_max', min: 0 },
      { id: 'vpnPageSize', key: 'vpn_session_history_page_size', min: 10 },
      { id: 'vpnActiveWindow', key: 'vpn_active_window_sec', min: 10 },
    ];
    const values = {};
    for (const f of fields) {
      const raw = document.getElementById(f.id).value.trim();
      const n = Number(raw);
      if (!raw || !Number.isInteger(n) || n < f.min) {
        msg.style.color = 'var(--danger, #f87171)';
        msg.textContent = `字段 ${f.id} 必须 ≥ ${f.min} 的整数`;
        return;
      }
      values[f.key] = n;
    }

    // 弹"确认重启"模态框。等待用户点确认或取消。
    const confirmed = await this._askRestartConfirm();
    if (!confirmed) return;

    // 锁住保存按钮、显示"重启中"模态框（自带倒计时）
    btn.disabled = true;
    document.getElementById('vpnRestartingModal').style.display = 'flex';
    const cd = document.getElementById('vpnRestartCountdown');
    cd.textContent = '3';

    try {
      // 三次 POST，每次都带 restart=true：最后一次触发真正的重启。
      // 这样即使中途某次失败（断连）也能让用户立刻知道。
      for (const f of fields) {
        const resp = await fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [f.key]: values[f.key], restart: true }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || `保存 ${f.key} 失败 (${resp.status})`);
        }
      }
      // 倒计时刷新。gunicorn 重启时这个 fetch 已经回来了，刷新发生在重启完成后。
      let n = 3;
      const t = setInterval(() => {
        n -= 1;
        cd.textContent = n;
        if (n <= 0) {
          clearInterval(t);
          location.reload();
        }
      }, 1000);
    } catch (error) {
      // 重启前/中失败：关掉"重启中"模态框，弹 alert 让用户知道
      document.getElementById('vpnRestartingModal').style.display = 'none';
      btn.disabled = false;
      msg.style.color = 'var(--danger, #f87171)';
      msg.textContent = '❌ 保存失败：' + error.message;
      // 重启后设置可能已写入但前端没确认 → 提示用户刷页查看
      alert(
        '保存失败：' + error.message +
        '\n\n设置可能已部分写入，建议刷新页面查看当前值，' +
        '如需重启服务请手动执行：sudo systemctl restart personal-website'
      );
    }
  }

  _askRestartConfirm() {
    return new Promise((resolve) => {
      const modal = document.getElementById('vpnRestartConfirmModal');
      const okBtn = document.getElementById('vpnRestartConfirm');
      const cancelBtn = document.getElementById('vpnRestartCancel');
      modal.style.display = 'flex';
      const cleanup = () => {
        modal.style.display = 'none';
        okBtn.onclick = null;
        cancelBtn.onclick = null;
      };
      okBtn.onclick = () => { cleanup(); resolve(true); };
      cancelBtn.onclick = () => { cleanup(); resolve(false); };
    });
  }

  async toggleNotification(e) {
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feishu_notify_enabled: e.target.checked })
      });
    } catch (error) {
      console.error('Failed to update settings:', error);
      e.target.checked = !e.target.checked;
    }
  }

  async saveWebhookUrl() {
    const url = document.getElementById('webhookUrl').value.trim();
    const btn = document.getElementById('saveWebhookBtn');
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feishu_webhook_url: url })
      });
      if (response.ok) {
        btn.textContent = '已保存!';
        setTimeout(() => { btn.textContent = '保存 Webhook URL'; }, 2000);
      }
    } catch (error) {
      console.error('Failed to save webhook URL:', error);
      btn.textContent = '保存失败';
      setTimeout(() => { btn.textContent = '保存 Webhook URL'; }, 2000);
    }
  }

  // Anniversary Check Time
  async loadAnniversaryCheckTime() {
    const statusEl = document.getElementById('checkTimeStatus');
    try {
      const response = await fetch('/api/admin/anniversary-check-time');
      const data = await response.json();
      const input = document.getElementById('anniversaryCheckTime');

      if (data.check_time) {
        // HH:MM:SS → set on the time input
        input.value = data.check_time;
        statusEl.innerHTML = data.cron_active
          ? '<span style="color:var(--success);">✅ 定时任务已激活（crontab 已配置）</span>'
          : '<span style="color:var(--warning);">⚠️ 已保存时间，但 crontab 中未检测到任务</span>';
      } else {
        input.value = '';
        statusEl.innerHTML = '<span style="color:var(--text-secondary);">未设置自动检测时间</span>';
      }
    } catch (error) {
      console.error('Failed to load anniversary check time:', error);
      statusEl.innerHTML = '<span style="color:var(--danger);">加载失败</span>';
    }
  }

  async saveCheckTime() {
    const input = document.getElementById('anniversaryCheckTime');
    const btn = document.getElementById('saveCheckTimeBtn');
    const statusEl = document.getElementById('checkTimeStatus');
    const checkTime = input.value;

    if (!checkTime) {
      statusEl.innerHTML = '<span style="color:var(--danger);">请选择一个时间</span>';
      return;
    }

    btn.disabled = true;
    btn.textContent = '保存中...';
    try {
      const response = await fetch('/api/admin/anniversary-check-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_time: checkTime })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        statusEl.innerHTML = '<span style="color:var(--success);">✅ 保存成功！检测时间：' + (data.check_time || '') + '</span>';
        // Refresh status
        await this.loadAnniversaryCheckTime();
      } else {
        statusEl.innerHTML = '<span style="color:var(--danger);">保存失败：' + (data.error || '未知错误') + '</span>';
      }
    } catch (error) {
      statusEl.innerHTML = '<span style="color:var(--danger);">网络错误</span>';
    } finally {
      btn.disabled = false;
      btn.textContent = '保存';
    }
  }

  async cancelCheckTime() {
    const btn = document.getElementById('cancelCheckTimeBtn');
    const statusEl = document.getElementById('checkTimeStatus');

    if (!confirm('确定要取消纪念日自动检测定时任务吗？')) return;

    btn.disabled = true;
    btn.textContent = '取消中...';
    try {
      const response = await fetch('/api/admin/anniversary-check-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_time: '' })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        document.getElementById('anniversaryCheckTime').value = '';
        statusEl.innerHTML = '<span style="color:var(--text-secondary);">已取消定时检测</span>';
      } else {
        statusEl.innerHTML = '<span style="color:var(--danger);">取消失败：' + (data.error || '未知错误') + '</span>';
      }
    } catch (error) {
      statusEl.innerHTML = '<span style="color:var(--danger);">网络错误</span>';
    } finally {
      btn.disabled = false;
      btn.textContent = '取消定时';
    }
  }

  async logout() {
    try {
      await fetch('/admin/logout', { method: 'POST' });
      window.location.href = '/admin';
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  }

  async loadAccounts() {
    try {
      const response = await fetch('/api/admin/accounts');
      const data = await response.json();
      const list = document.getElementById('accountList');
      if (data.accounts.length === 0) {
        list.innerHTML = '<p>暂无账户</p>';
        return;
      }
      list.innerHTML = data.accounts.map(a => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--border);">
          <span><strong>${a.username}</strong> <small style="color:var(--text-secondary);">创建: ${a.created_at || '-'}</small></span>
          <button class="btn btn-sm btn-danger" onclick="dashboard.deleteAccount(${a.id}, '${a.username}')">删除</button>
        </div>
      `).join('');
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  }

  async addAccount() {
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    const msgEl = document.getElementById('accountMsg');
    
    if (!username || !password) {
      msgEl.textContent = '用户名和密码不能为空';
      msgEl.style.display = 'block';
      return;
    }
    
    try {
      const response = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (response.ok) {
        document.getElementById('newUsername').value = '';
        document.getElementById('newPassword').value = '';
        msgEl.style.display = 'none';
        this.loadAccounts();
      } else {
        msgEl.textContent = data.error || '添加失败';
        msgEl.style.display = 'block';
      }
    } catch (error) {
      msgEl.textContent = '网络错误';
      msgEl.style.display = 'block';
    }
  }

  async deleteAccount(id, username) {
    if (!confirm(`确定要删除账户 "${username}" 吗？`)) return;
    try {
      const response = await fetch(`/api/admin/accounts/${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (response.ok) {
        this.loadAccounts();
      } else {
        alert(data.error || '删除失败');
      }
    } catch (error) {
      alert('网络错误');
    }
  }
}

// Login form handler
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      console.log('Login form submitted');
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      const errorEl = document.getElementById('loginError');
      
      try {
        const response = await fetch('/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        
        if (response.ok) {
          window.location.href = '/admin/dashboard';
        } else {
          const data = await response.json();
          errorEl.textContent = data.error || '用户名或密码错误';
          errorEl.style.display = 'block';
        }
      } catch (error) {
        errorEl.textContent = '网络错误，请重试';
        errorEl.style.display = 'block';
      }
    });
  }
  
  // Initialize dashboard if logged in
  if (document.querySelector('.admin-dashboard')) {
    window.dashboard = new AdminDashboard();
  }
});
