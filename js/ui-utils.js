(function () {
  'use strict';

  var styleInjected = false;
  var toastHost = null;

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    var style = document.createElement('style');
    style.id = 'ui-utils-styles';
    style.textContent = '' +
      '@keyframes ui-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}' +
      '@keyframes ui-toast-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}' +
      '@keyframes ui-toast-out{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(12px)}}' +
      '.ui-state{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:var(--space-10,40px) var(--space-4,16px);color:var(--color-text-muted,#6b7280);gap:var(--space-3,12px)}' +
      '.ui-spinner{width:28px;height:28px;border:3px solid var(--color-border,#d1d5db);border-top-color:var(--color-accent,#3d6b45);border-radius:50%;animation:ui-spin 0.8s linear infinite}' +
      '.ui-state-title{font-weight:600;color:var(--color-text-primary,#111827)}' +
      '.ui-state-sub{font-size:var(--font-size-sm,14px);color:var(--color-text-muted,#6b7280)}' +
      '.ui-retry-btn{margin-top:var(--space-2,8px)}' +
      '.ui-field-error{margin-top:4px;font-size:12px;color:#c0392b}' +
      '.ui-toast-host{position:fixed;right:16px;bottom:16px;display:flex;flex-direction:column;gap:8px;z-index:300}' +
      '.ui-toast{min-width:220px;max-width:360px;background:var(--color-surface,#fff);border:1px solid var(--color-border,#d1d5db);box-shadow:var(--shadow-md,0 6px 18px rgba(0,0,0,0.12));border-radius:10px;padding:12px 14px;font-size:14px;color:var(--color-text-primary,#111827);animation:ui-toast-in 0.18s ease-out}' +
      '.ui-toast.info{border-left:4px solid var(--color-accent,#3d6b45)}' +
      '.ui-toast.success{border-left:4px solid #27ae60}' +
      '.ui-toast.warning{border-left:4px solid #b45309}' +
      '.ui-toast.error{border-left:4px solid #c0392b}' +
      '.ui-toast.is-hiding{animation:ui-toast-out 0.18s ease-in forwards}' +
      '.ui-error-box{align-items:flex-start;text-align:left}' +
      '.ui-error-actions{display:flex;gap:8px;flex-wrap:wrap}' +
      '.btn-loading{pointer-events:none;opacity:0.7}';
    document.head.appendChild(style);
  }

  function getEl(containerId) {
    return typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  }

  function ensureToastHost() {
    injectStyles();
    if (toastHost) return toastHost;
    toastHost = document.createElement('div');
    toastHost.className = 'ui-toast-host';
    document.body.appendChild(toastHost);
    return toastHost;
  }

  function showLoading(containerId, message) {
    injectStyles();
    var el = getEl(containerId);
    if (!el) return;
    el.innerHTML = '<div class="ui-state"><div class="ui-spinner"></div><div class="ui-state-title">' + (message || 'Loading...') + '</div></div>';
  }

  function showError(containerId, message, retryFn) {
    injectStyles();
    var el = getEl(containerId);
    if (!el) return;
    el.innerHTML = '<div class="ui-state ui-error-box"><div class="ui-state-title">Something went wrong</div><div class="ui-state-sub">' + (message || 'Please try again.') + '</div>' + (retryFn ? '<div class="ui-error-actions"><button type="button" class="btn btn-secondary ui-retry-btn">Retry</button></div>' : '') + '</div>';
    if (retryFn) {
      var btn = el.querySelector('.ui-retry-btn');
      if (btn) btn.addEventListener('click', retryFn);
    }
  }

  function showEmpty(containerId, message, subMessage) {
    injectStyles();
    var el = getEl(containerId);
    if (!el) return;
    el.innerHTML = '<div class="ui-state"><div class="ui-state-title">' + (message || 'Nothing here yet') + '</div>' + (subMessage ? '<div class="ui-state-sub">' + subMessage + '</div>' : '') + '</div>';
  }

  function showFieldError(inputId, message) {
    injectStyles();
    var input = getEl(inputId);
    if (!input) return;
    clearFieldError(inputId);
    input.classList.add('field-error');
    input.setAttribute('aria-invalid', 'true');
    var msg = document.createElement('div');
    msg.className = 'ui-field-error';
    msg.setAttribute('data-ui-field-error', 'true');
    msg.textContent = message || 'Please check this field.';
    input.insertAdjacentElement('afterend', msg);
  }

  function clearFieldError(inputId) {
    var input = getEl(inputId);
    if (!input) return;
    input.classList.remove('field-error');
    input.removeAttribute('aria-invalid');
    var next = input.nextElementSibling;
    if (next && next.getAttribute('data-ui-field-error') === 'true') next.remove();
  }

  function toast(message, type, durationMs) {
    injectStyles();
    var host = ensureToastHost();
    var item = document.createElement('div');
    item.className = 'ui-toast ' + (type || 'info');
    item.textContent = message || '';
    host.appendChild(item);
    var duration = durationMs == null ? 2600 : durationMs;
    if (duration > 0) {
      window.setTimeout(function () {
        item.classList.add('is-hiding');
        window.setTimeout(function () { if (item.parentNode) item.parentNode.removeChild(item); }, 180);
      }, duration);
    }
    return item;
  }

  function setButtonLoading(btn, isLoading, loadingText) {
    if (!btn) return;
    if (!btn.dataset.uiOriginalText) btn.dataset.uiOriginalText = btn.textContent;
    if (isLoading) {
      btn.disabled = true;
      btn.classList.add('btn-loading');
      btn.textContent = loadingText || 'Loading...';
    } else {
      btn.disabled = false;
      btn.classList.remove('btn-loading');
      btn.textContent = btn.dataset.uiOriginalText || btn.textContent;
    }
  }

  function safeFirestore(operation, options) {
    options = options || {};
    return Promise.resolve()
      .then(operation)
      .catch(function (error) {
        if (options.toastMessage) toast(options.toastMessage, options.toastType || 'error', options.toastDurationMs);
        if (typeof options.onError === 'function') return options.onError(error);
        throw error;
      });
  }

  window.UIUtils = {
    showLoading: showLoading,
    showError: showError,
    showEmpty: showEmpty,
    showFieldError: showFieldError,
    clearFieldError: clearFieldError,
    toast: toast,
    setButtonLoading: setButtonLoading,
    safeFirestore: safeFirestore
  };
})();
