'use strict';
window.StudioUI = {
  theme(value) {
    document.body.dataset.theme = ['aurora', 'sweet', 'pixel'].includes(value) ? value : 'aurora';
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === document.body.dataset.theme));
    });
  },
  toast(message) {
    const element = document.getElementById('toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => element.classList.remove('show'), 2600);
  },
  closeWithEscape(close) {
    document.getElementById('closeBtn').addEventListener('click', close);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  },
};
