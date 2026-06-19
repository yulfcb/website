/**
 * Main JavaScript - Theme toggle and common interactions
 */

// Theme Management
class ThemeManager {
  constructor() {
    this.theme = localStorage.getItem('theme') || 'dark';
    this.toggleBtn = document.getElementById('themeToggle');
    this.init();
  }

  init() {
    document.documentElement.setAttribute('data-theme', this.theme);
    this.updateIcon();
    
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', () => this.toggle());
    }
  }

  toggle() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', this.theme);
    localStorage.setItem('theme', this.theme);
    this.updateIcon();
  }

  updateIcon() {
    if (this.toggleBtn) {
      const icon = this.toggleBtn.querySelector('.icon');
      icon.textContent = this.theme === 'dark' ? '🌙' : '☀️';
    }
  }
}

// Initialize theme manager
document.addEventListener('DOMContentLoaded', () => {
  new ThemeManager();

  // Fetch and display site stats
  fetch('/api/stats')
    .then(res => res.json())
    .then(data => {
      const totalEl = document.getElementById('totalVisits');
      const todayEl = document.getElementById('todayVisits');
      if (totalEl) totalEl.textContent = data.total ?? 0;
      if (todayEl) todayEl.textContent = data.today ?? 0;
    })
    .catch(() => {});
});
