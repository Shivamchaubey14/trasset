/* ==========================================================================
   Trasset — UI kit
   Toasts, modals, confirms, formatting and small DOM helpers (SRS §7.4).
   ========================================================================== */

window.Trasset = window.Trasset || {};

(function (T, $) {
  'use strict';

  /* ------------------------------------------------------------------------
     Icons — inline SVG so nothing loads from the network
     ---------------------------------------------------------------------- */
  var ICONS = {
    dashboard: '<path d="M3 3h7v7H3zM14 3h7v4h-7zM14 10h7v11h-7zM3 13h7v8H3z"/>',
    box: '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 1 5.4-5.4l-2.5 2.5 2.1 2.1 2.5-2.5a4 4 0 0 0-5.1-5.1z"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12h10.6L21 7H6"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
    layers: '<path d="M12 2 2 7l10 5 10-5z"/><path d="M2 12l10 5 10-5M2 17l10 5 10-5"/>',
    users: '<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-3-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4h.1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 3 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 3H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    shield: '<path d="M12 2 4 6v6c0 5 3.4 9.4 8 10 4.6-.6 8-5 8-10V6z"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16.5v.01"/>',
    warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17.5v.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-5M12 7.5v.01"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    edit: '<path d="M11 4H4v16h16v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    mapPin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    building: '<path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 21V9h4a2 2 0 0 1 2 2v10"/><path d="M9 7h2M9 11h2M9 15h2"/>',
    truck: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="18.5" r="2"/>',
    tag: '<path d="M20.6 13.4 12 22l-9-9V3h10z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    money: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5A3 3 0 0 0 12 8h-1a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-1a3 3 0 0 1-3-1.5M12 6v2M12 16v2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.9 4.2A10 10 0 0 1 12 4c7 0 11 8 11 8a19 19 0 0 1-3 4.1M6.6 6.6A19 19 0 0 0 1 12s4 8 11 8a10 10 0 0 0 4.5-1"/><path d="M2 2l20 20"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    filter: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>'
  };

  /**
   * Inline SVG icon.
   * @param {string} name key from ICONS
   * @param {number} [size=20]
   */
  function icon(name, size) {
    var path = ICONS[name];
    if (!path) { return ''; }
    var s = size || 20;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
           'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
           'stroke-linejoin="round" aria-hidden="true" focusable="false">' + path + '</svg>';
  }

  /* ------------------------------------------------------------------------
     Escaping — every value from the API goes through this before it is
     interpolated into HTML.
     ---------------------------------------------------------------------- */
  function esc(value) {
    if (value === null || value === undefined) { return ''; }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ------------------------------------------------------------------------
     Toasts
     ---------------------------------------------------------------------- */
  var TOAST_ICONS = {
    success: 'checkCircle',
    error: 'alert',
    warning: 'warning',
    info: 'info'
  };

  function ensureToastStack() {
    var $stack = $('#toastStack');
    if (!$stack.length) {
      $stack = $('<div id="toastStack" class="toast-stack" role="status" aria-live="polite"></div>');
      $('body').append($stack);
    }
    return $stack;
  }

  function toast(type, title, message, duration) {
    var $stack = ensureToastStack();
    var $toast = $(
      '<div class="toast toast-' + type + '" role="alert">' +
        '<span class="toast-icon">' + icon(TOAST_ICONS[type] || 'info', 19) + '</span>' +
        '<div class="toast-content">' +
          '<div class="toast-title">' + esc(title) + '</div>' +
          (message ? '<div class="toast-message">' + esc(message) + '</div>' : '') +
        '</div>' +
        '<button class="toast-close" aria-label="Dismiss">' + icon('close', 15) + '</button>' +
      '</div>'
    );

    function dismiss() {
      $toast.addClass('is-leaving');
      setTimeout(function () { $toast.remove(); }, 220);
    }

    $toast.find('.toast-close').on('click', dismiss);
    $stack.append($toast);

    var wait = duration === undefined ? (type === 'error' ? 6000 : 4000) : duration;
    if (wait > 0) { setTimeout(dismiss, wait); }

    return $toast;
  }

  /* ------------------------------------------------------------------------
     Modals
     ---------------------------------------------------------------------- */
  var openModals = [];

  //: Everything that can hold focus, in DOM order.
  var FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function focusableWithin($modal) {
    return $modal.find(FOCUSABLE).filter(':visible');
  }

  /**
   * Keep Tab inside the dialog.
   *
   * Without this a keyboard user tabs straight past the last control and into
   * the page behind, which is still there and still interactive — they end up
   * operating a screen they cannot see past the backdrop.
   */
  function trapFocus(event) {
    if (event.key !== 'Tab' || !openModals.length) { return; }

    var $modal = openModals[openModals.length - 1].$modal;
    var $focusable = focusableWithin($modal);
    if (!$focusable.length) { return; }

    var first = $focusable[0];
    var last = $focusable[$focusable.length - 1];
    var active = document.activeElement;

    // Focus escaping the dialog entirely — pull it back.
    if (!$.contains($modal[0], active)) {
      event.preventDefault();
      first.focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  $(document).on('keydown', trapFocus);

  function closeTopModal() {
    var top = openModals.pop();
    if (!top) { return; }
    top.$backdrop.remove();
    if (top.restoreFocus && top.restoreFocus.focus) { top.restoreFocus.focus(); }
    if (!openModals.length) { $('body').css('overflow', ''); }
  }

  /**
   * Open a modal.
   * @param {object} options {title, body, footer, size, onOpen, closable}
   * @returns {object} {close, $modal}
   */
  function modal(options) {
    var opts = $.extend({ size: '', closable: true }, options);
    var previouslyFocused = document.activeElement;

    var $backdrop = $('<div class="modal-backdrop"></div>');
    var $modal = $(
      '<div class="modal ' + (opts.size ? 'modal-' + opts.size : '') + '" role="dialog" ' +
           'aria-modal="true" aria-label="' + esc(opts.title || 'Dialog') + '">' +
        (opts.title
          ? '<div class="modal-header">' +
              '<h3 class="modal-title">' + esc(opts.title) + '</h3>' +
              (opts.closable
                ? '<button class="modal-close" aria-label="Close">' + icon('close', 19) + '</button>'
                : '') +
            '</div>'
          : '') +
        '<div class="modal-body">' + (opts.body || '') + '</div>' +
        (opts.footer ? '<div class="modal-footer">' + opts.footer + '</div>' : '') +
      '</div>'
    );

    $backdrop.append($modal);
    $('body').append($backdrop).css('overflow', 'hidden');

    var entry = { $backdrop: $backdrop, $modal: $modal, restoreFocus: previouslyFocused };
    openModals.push(entry);

    function close() {
      var index = openModals.indexOf(entry);
      if (index === -1) { return; }
      openModals.splice(index, 1);
      $backdrop.remove();
      if (previouslyFocused && previouslyFocused.focus) { previouslyFocused.focus(); }
      if (!openModals.length) { $('body').css('overflow', ''); }
    }

    if (opts.closable) {
      $modal.find('.modal-close').on('click', close);
      $backdrop.on('click', function (event) {
        if (event.target === $backdrop[0]) { close(); }
      });
    }

    // Focus the first meaningful control so keyboard users land inside.
    setTimeout(function () {
      var $first = $modal.find('input:visible, select:visible, textarea:visible, .btn-primary')
                         .not('[disabled]').first();
      if ($first.length) { $first.focus(); } else { $modal.attr('tabindex', '-1').focus(); }
    }, 60);

    if (opts.onOpen) { opts.onOpen($modal, close); }

    return { close: close, $modal: $modal };
  }

  /** Confirmation dialog — required before every destructive action. */
  function confirm(options) {
    var opts = $.extend({
      title: 'Are you sure?',
      message: 'This action cannot be undone.',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      danger: true
    }, options);

    return new Promise(function (resolve) {
      var settled = false;

      var instance = modal({
        size: 'sm',
        body:
          '<div class="flex gap-4 items-start">' +
            '<div class="confirm-icon ' + (opts.danger ? '' : 'is-warning') + '">' +
              icon(opts.danger ? 'trash' : 'warning', 22) +
            '</div>' +
            '<div>' +
              '<h3 style="font-size:18px;margin-bottom:6px">' + esc(opts.title) + '</h3>' +
              '<p class="text-muted text-small" style="margin:0">' + esc(opts.message) + '</p>' +
            '</div>' +
          '</div>',
        footer:
          '<button class="btn btn-secondary" data-act="cancel">' + esc(opts.cancelLabel) + '</button>' +
          '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-act="ok">' +
            esc(opts.confirmLabel) +
          '</button>',
        onOpen: function ($modal, close) {
          $modal.find('[data-act="ok"]').on('click', function () {
            settled = true; close(); resolve(true);
          }).focus();
          $modal.find('[data-act="cancel"]').on('click', function () {
            settled = true; close(); resolve(false);
          });
        }
      });

      // Backdrop click / Escape count as "no".
      var poll = setInterval(function () {
        if (!$.contains(document, instance.$modal[0])) {
          clearInterval(poll);
          if (!settled) { resolve(false); }
        }
      }, 120);
    });
  }

  // Escape closes the top-most modal.
  $(document).on('keydown', function (event) {
    if (event.key === 'Escape' && openModals.length) { closeTopModal(); }
  });

  // Give statically-declared sortable headers their initial aria-sort. Pages
  // that build headers dynamically call syncSortState themselves after render.
  $(function () { syncSortState('.table'); });

  /* ------------------------------------------------------------------------
     Formatting
     ---------------------------------------------------------------------- */
  var fmt = {
    /** Indian-format currency, e.g. ₹78,000. */
    money: function (value, withSymbol) {
      var number = parseFloat(value || 0);
      if (isNaN(number)) { number = 0; }
      var text = number.toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      });
      return (withSymbol === false ? '' : '₹') + text;
    },

    /** Compact form for KPI tiles: ₹1.2L, ₹3.4Cr. */
    moneyShort: function (value) {
      var n = parseFloat(value || 0);
      if (isNaN(n)) { n = 0; }
      if (n >= 10000000) { return '₹' + (n / 10000000).toFixed(2) + ' Cr'; }
      if (n >= 100000)   { return '₹' + (n / 100000).toFixed(2) + ' L'; }
      if (n >= 1000)     { return '₹' + (n / 1000).toFixed(1) + 'K'; }
      return '₹' + n.toFixed(0);
    },

    number: function (value) {
      var n = parseFloat(value || 0);
      return isNaN(n) ? '0' : n.toLocaleString('en-IN');
    },

    date: function (value) {
      if (!value) { return '—'; }
      var d = new Date(value);
      if (isNaN(d.getTime())) { return '—'; }
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    },

    dateTime: function (value) {
      if (!value) { return '—'; }
      var d = new Date(value);
      if (isNaN(d.getTime())) { return '—'; }
      return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    },

    /** "3 days ago" / "in 12 days" */
    relative: function (value) {
      if (!value) { return '—'; }
      var then = new Date(value).getTime();
      if (isNaN(then)) { return '—'; }
      var diff = Date.now() - then;
      var future = diff < 0;
      var seconds = Math.abs(diff) / 1000;

      var units = [
        [31536000, 'year'], [2592000, 'month'], [604800, 'week'],
        [86400, 'day'], [3600, 'hour'], [60, 'minute']
      ];
      for (var i = 0; i < units.length; i++) {
        if (seconds >= units[i][0]) {
          var count = Math.floor(seconds / units[i][0]);
          var label = count + ' ' + units[i][1] + (count > 1 ? 's' : '');
          return future ? 'in ' + label : label + ' ago';
        }
      }
      return 'just now';
    },

    /** snake_case / kebab → Title Case */
    title: function (value) {
      if (!value) { return ''; }
      return String(value)
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    },

    initials: function (name) {
      if (!name) { return '?'; }
      var parts = String(name).trim().split(/\s+/).slice(0, 2);
      return parts.map(function (p) { return p.charAt(0).toUpperCase(); }).join('');
    }
  };

  /* ------------------------------------------------------------------------
     Fragments
     ---------------------------------------------------------------------- */
  function statusPill(status, label) {
    var key = String(status || '').toLowerCase().replace(/\s+/g, '_');
    return '<span class="pill pill-' + esc(key) + '">' +
             esc(label || fmt.title(status)) +
           '</span>';
  }

  function skeletonRows(rowCount, columnCount) {
    var html = '';
    for (var r = 0; r < rowCount; r++) {
      html += '<tr>';
      for (var c = 0; c < columnCount; c++) {
        html += '<td><div class="skeleton skeleton-text ' +
                (c === 0 ? 'w-75' : 'w-60') + '"></div></td>';
      }
      html += '</tr>';
    }
    return html;
  }

  function emptyState(options) {
    var opts = options || {};
    return '<div class="empty-state">' +
             '<div class="empty-state-icon">' + icon(opts.icon || 'inbox', 28) + '</div>' +
             '<h3>' + esc(opts.title || 'Nothing here yet') + '</h3>' +
             '<p>' + esc(opts.message || '') + '</p>' +
             (opts.actionLabel
               ? '<button class="btn btn-primary" data-empty-action>' +
                   icon('plus', 17) + '<span>' + esc(opts.actionLabel) + '</span>' +
                 '</button>'
               : '') +
           '</div>';
  }

  /**
   * Mirror a table's visual sort state into `aria-sort`.
   *
   * The arrow tells a sighted user which column is sorted and which way; a
   * screen-reader user gets nothing without this. Call it after changing the
   * `is-sorted-*` classes, and once after first render.
   *
   * @param {jQuery|string} table the table, or a selector for it
   */
  function syncSortState(table) {
    $(table).find('thead th').each(function () {
      var $th = $(this);
      if (!$th.hasClass('is-sortable')) {
        $th.removeAttr('aria-sort');
        return;
      }
      $th.attr('aria-sort',
        $th.hasClass('is-sorted-asc') ? 'ascending'
          : $th.hasClass('is-sorted-desc') ? 'descending'
            : 'none');
    });
  }

  /** Windowed page numbers: « 1 … 4 5 [6] 7 8 … 20 » */
  function pagination(page, totalPages) {
    if (!totalPages || totalPages < 1) { return ''; }

    var html = '<div class="pagination-controls">';
    html += '<button class="page-btn" data-page="' + (page - 1) + '"' +
            (page <= 1 ? ' disabled' : '') + ' aria-label="Previous page">' +
            icon('chevronLeft', 15) + '</button>';

    var pages = [];
    var from = Math.max(1, page - 2);
    var to = Math.min(totalPages, page + 2);

    if (from > 1) { pages.push(1); if (from > 2) { pages.push('…'); } }
    for (var p = from; p <= to; p++) { pages.push(p); }
    if (to < totalPages) { if (to < totalPages - 1) { pages.push('…'); } pages.push(totalPages); }

    pages.forEach(function (p) {
      html += p === '…'
        ? '<span class="page-ellipsis">…</span>'
        : '<button class="page-btn' + (p === page ? ' is-active' : '') + '" data-page="' + p + '">' +
            p + '</button>';
    });

    html += '<button class="page-btn" data-page="' + (page + 1) + '"' +
            (page >= totalPages ? ' disabled' : '') + ' aria-label="Next page">' +
            icon('chevronRight', 15) + '</button>';
    return html + '</div>';
  }

  /* ------------------------------------------------------------------------
     Form helpers
     ---------------------------------------------------------------------- */
  function clearFieldErrors($form) {
    $form.find('.is-invalid').removeClass('is-invalid');
    $form.find('.field-error').removeClass('is-visible').text('');
  }

  /** Paint an ApiError's field-level messages onto the matching inputs. */
  function applyFieldErrors($form, apiError) {
    clearFieldErrors($form);
    if (!apiError || !apiError.errors) { return false; }

    var painted = false;
    var $firstBad = null;

    Object.keys(apiError.errors).forEach(function (field) {
      var value = apiError.errors[field];
      var message = $.isArray(value) ? value.join(' ') : String(value);
      var $input = $form.find('[name="' + field + '"]');

      if (!$input.length) { return; }
      $input.addClass('is-invalid');
      $input.closest('.field').find('.field-error').addClass('is-visible').text(message);
      if (!$firstBad) { $firstBad = $input; }
      painted = true;
    });

    if ($firstBad) { $firstBad.focus(); }
    return painted;
  }

  /** Serialise a form into a plain object, dropping empty optional values. */
  function formToObject($form) {
    var out = {};
    $form.find('[name]').each(function () {
      var $field = $(this);
      var name = $field.attr('name');
      var type = $field.attr('type');

      if (type === 'checkbox') { out[name] = $field.is(':checked'); return; }
      if (type === 'radio') {
        if ($field.is(':checked')) { out[name] = $field.val(); }
        return;
      }

      var value = $field.val();
      if (value === '' && $field.data('omit-empty') !== false) {
        if ($field.data('null-empty')) { out[name] = null; }
        return;
      }
      out[name] = value;
    });
    return out;
  }

  function setButtonLoading($button, isLoading) {
    if (isLoading) {
      $button.addClass('is-loading').prop('disabled', true);
      if (!$button.find('.spinner').length) {
        $button.prepend('<span class="spinner"></span>');
      }
    } else {
      $button.removeClass('is-loading').prop('disabled', false);
    }
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var context = this;
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(context, args); }, wait || 300);
    };
  }

  /* ------------------------------------------------------------------------
     Export
     ---------------------------------------------------------------------- */
  T.ui = {
    icon: icon,
    icons: ICONS,
    esc: esc,
    toast: toast,
    success: function (title, message) { return toast('success', title, message); },
    error: function (title, message) { return toast('error', title, message); },
    warning: function (title, message) { return toast('warning', title, message); },
    info: function (title, message) { return toast('info', title, message); },
    modal: modal,
    confirm: confirm,
    fmt: fmt,
    statusPill: statusPill,
    skeletonRows: skeletonRows,
    emptyState: emptyState,
    pagination: pagination,
    syncSortState: syncSortState,
    clearFieldErrors: clearFieldErrors,
    applyFieldErrors: applyFieldErrors,
    formToObject: formToObject,
    setButtonLoading: setButtonLoading,
    debounce: debounce,

    /** Toast an ApiError, preferring its field-level detail. */
    apiError: function (error, fallbackTitle) {
      var title = fallbackTitle || 'Something went wrong';
      if (!error) { return toast('error', title); }
      var field = error.firstFieldError && error.firstFieldError();
      var detail = field ? field.message : null;
      return toast('error', error.message || title, detail);
    }
  };

}(window.Trasset, window.jQuery));
