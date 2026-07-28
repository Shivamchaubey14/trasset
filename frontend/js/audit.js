/* ==========================================================================
   Trasset — audit trail (FR-13.2)
   ========================================================================== */

(function (T, $) {
  'use strict';

  var ui = T.ui;
  var fmt = ui.fmt;
  var session = T.auth.session;

  var PAGE_SIZE = 25;

  var ACTIONS = [
    { value: 'create', label: 'Created' },
    { value: 'update', label: 'Updated' },
    { value: 'delete', label: 'Deleted' },
    { value: 'assign', label: 'Assigned' },
    { value: 'checkin', label: 'Checked in' },
    { value: 'retire', label: 'Retired' },
    { value: 'login', label: 'Signed in' },
    { value: 'login_failed', label: 'Sign-in failed' },
    { value: 'logout', label: 'Signed out' },
    { value: 'password_change', label: 'Password changed' },
    { value: 'password_reset', label: 'Password reset' }
  ];

  /** Fields whose raw names read badly in a diff. */
  var FIELD_LABELS = {
    asset_tag: 'Asset tag',
    serial_number: 'Serial number',
    model_number: 'Model number',
    purchase_cost: 'Purchase cost',
    salvage_value: 'Salvage value',
    useful_life_years: 'Useful life',
    depreciation_method: 'Depreciation method',
    current_value: 'Book value',
    warranty_expiry: 'Warranty expiry',
    assigned_to: 'Assigned to',
    assigned_at: 'Assigned at',
    is_deleted: 'Deleted',
    is_active: 'Active',
    custom_data: 'Custom fields',
    full_name: 'Full name',
    email_notifications: 'Email notifications',
    head_user: 'Department head',
    custom_fields: 'Custom field definitions'
  };

  var state = {
    page: 1,
    search: '',
    action: '',
    entityType: '',
    dateFrom: '',
    dateTo: '',
    ordering: '-created_at'
  };

  function params(extra) {
    return $.extend({
      search: state.search || undefined,
      action: state.action || undefined,
      entity_type: state.entityType || undefined,
      date_from: state.dateFrom || undefined,
      date_to: state.dateTo || undefined
    }, extra || {});
  }

  function hasFilters() {
    return Boolean(state.search || state.action || state.entityType ||
                   state.dateFrom || state.dateTo);
  }

  /* ----------------------------------------------------------------------
     Value formatting
     ---------------------------------------------------------------------- */
  function fieldLabel(key) {
    return FIELD_LABELS[key] || fmt.title(key);
  }

  function displayValue(value) {
    if (value === null || value === undefined || value === '') { return '(empty)'; }
    if (value === true) { return 'Yes'; }
    if (value === false) { return 'No'; }
    if ($.isPlainObject(value) || $.isArray(value)) {
      var text = JSON.stringify(value);
      return text.length > 120 ? text.slice(0, 120) + '…' : text;
    }

    var text = String(value);
    // ISO timestamps read badly raw.
    if (/^\d{4}-\d{2}-\d{2}T/.test(text)) { return fmt.dateTime(text); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) { return fmt.date(text); }
    return text.length > 120 ? text.slice(0, 120) + '…' : text;
  }

  /* ----------------------------------------------------------------------
     Rendering
     ---------------------------------------------------------------------- */
  function renderSummary(summary) {
    var cards = [
      { label: 'Total entries', value: fmt.number(summary.total), icon: 'shield',
        accent: 'var(--color-ink)', soft: 'var(--ink-soft)' },
      { label: 'Today', value: fmt.number(summary.today), icon: 'clock',
        accent: 'var(--color-primary)', soft: 'var(--primary-soft)' },
      { label: 'People involved', value: fmt.number(summary.actors), icon: 'users',
        accent: 'var(--color-accent)', soft: 'var(--accent-soft)' }
    ];

    var top = (summary.by_action || []).slice(0, 3);
    if (top.length) {
      cards.push({
        label: 'Most common',
        value: top[0].label,
        meta: fmt.number(top[0].count) + ' entries',
        icon: 'chart',
        accent: top[0].color,
        soft: 'var(--ink-soft)',
        small: true
      });
    }

    $('#summaryGrid').html(cards.map(function (card) {
      return '' +
        '<div class="kpi" style="--kpi-accent:' + card.accent + ';--kpi-soft:' + card.soft + '">' +
          '<div class="kpi-top">' +
            '<span class="kpi-label">' + ui.esc(card.label) + '</span>' +
            '<span class="kpi-icon">' + ui.icon(card.icon, 18) + '</span>' +
          '</div>' +
          '<div class="kpi-value"' + (card.small ? ' style="font-size:21px"' : '') + '>' +
            ui.esc(card.value) +
          '</div>' +
          (card.meta ? '<div class="kpi-meta">' + ui.esc(card.meta) + '</div>' : '') +
        '</div>';
    }).join(''));
  }

  function changesCell(row) {
    var fields = row.changed_fields || [];
    var hasContext = row.changes && row.changes._context;

    if (!fields.length && !hasContext) {
      return '<span class="text-muted text-small">—</span>';
    }

    var label = fields.length
      ? fields.length + ' field' + (fields.length === 1 ? '' : 's')
      : 'details';

    return '<button class="change-toggle" data-toggle="' + row.id + '">' +
             '<span>' + label + '</span>' + ui.icon('chevronDown', 13) +
           '</button>';
  }

  function detailRow(row) {
    var changes = row.changes || {};
    var html = '<div class="change-inner">';

    (row.changed_fields || []).forEach(function (key) {
      var change = changes[key];
      html += '<div class="change-row">' +
                '<span class="change-field">' + ui.esc(fieldLabel(key)) + '</span>' +
                '<span class="change-from">' + ui.esc(displayValue(change.from)) + '</span>' +
                '<span class="change-arrow">' + ui.icon('chevronRight', 13) + '</span>' +
                '<span class="change-to">' + ui.esc(displayValue(change.to)) + '</span>' +
              '</div>';
    });

    if (changes._context) {
      var entries = Object.keys(changes._context)
        .filter(function (key) {
          var value = changes._context[key];
          return value !== null && value !== '' && value !== undefined;
        })
        .map(function (key) {
          return '<strong>' + ui.esc(fieldLabel(key)) + ':</strong> ' +
                 ui.esc(displayValue(changes._context[key]));
        });

      if (entries.length) {
        html += '<div class="context-box">' + entries.join(' &nbsp;·&nbsp; ') + '</div>';
      }
    }

    html += '</div>';

    return '<tr class="change-detail hidden" data-detail="' + row.id + '">' +
             '<td colspan="6">' + html + '</td>' +
           '</tr>';
  }

  function renderRows(results) {
    if (!results.length) {
      $('#tableBody').html(
        '<tr><td colspan="6">' + ui.emptyState({
          icon: hasFilters() ? 'search' : 'shield',
          title: hasFilters() ? 'No entries match' : 'Nothing recorded yet',
          message: hasFilters()
            ? 'Try a wider date range, or clear the filters.'
            : 'Actions will appear here as people create, edit and assign records.'
        }) + '</td></tr>'
      );
      return;
    }

    $('#tableBody').html(results.map(function (row) {
      var actor = row.user
        ? row.user.full_name
        : (row.user_display || 'System');
      var initials = row.user
        ? (row.user.initials || fmt.initials(row.user.full_name))
        : '?';

      return '<tr data-id="' + row.id + '">' +
        '<td class="text-small text-nowrap" title="' + ui.esc(fmt.dateTime(row.created_at)) + '">' +
          ui.esc(fmt.dateTime(row.created_at)) +
          '<br><span class="cell-muted">' + ui.esc(fmt.relative(row.created_at)) + '</span>' +
        '</td>' +

        '<td>' +
          '<div class="flex items-center gap-2">' +
            '<span class="avatar avatar-sm"' +
                  (row.user ? '' : ' style="background:var(--color-muted)"') + '>' +
              ui.esc(initials) +
            '</span>' +
            '<span class="text-small">' + ui.esc(actor) + '</span>' +
          '</div>' +
        '</td>' +

        '<td>' +
          '<span class="pill pill-plain" style="background:' + ui.esc(row.action_color) +
                '1f;color:' + ui.esc(row.action_color) + '">' +
            ui.esc(row.action_label) +
          '</span>' +
        '</td>' +

        '<td>' +
          '<span class="cell-primary">' +
            ui.esc(row.entity_label || ('#' + row.entity_id)) +
          '</span><br>' +
          '<span class="cell-muted">' + ui.esc(row.entity_type) + '</span>' +
        '</td>' +

        '<td>' + changesCell(row) + '</td>' +

        '<td class="text-small mono-tag">' +
          (row.ip_address ? ui.esc(row.ip_address) : '<span class="text-muted">—</span>') +
        '</td>' +
      '</tr>' + detailRow(row);
    }).join(''));
  }

  function renderPagination(data) {
    var $bar = $('#paginationBar');
    if (!data.count) { $bar.hide(); return; }

    var from = (data.page - 1) * data.page_size + 1;
    var to = Math.min(data.page * data.page_size, data.count);
    $('#paginationInfo').text('Showing ' + from + '–' + to + ' of ' + fmt.number(data.count));
    $('#paginationControls').html(ui.pagination(data.page, data.total_pages));
    $bar.toggle(data.total_pages > 1);
  }

  /* ----------------------------------------------------------------------
     Data
     ---------------------------------------------------------------------- */
  function loadSummary() {
    return T.api.get('/audit-logs/summary/', params())
      .then(renderSummary)
      .catch(function () { $('#summaryGrid').empty(); });
  }

  function loadTable() {
    $('#tableBody').html(ui.skeletonRows(8, 6));

    return T.api.get('/audit-logs/', params({
      page: state.page,
      page_size: PAGE_SIZE,
      ordering: state.ordering
    }))
      .then(function (data) {
        renderRows(data.results || []);
        renderPagination(data);
        $('#resultCount').text(
          fmt.number(data.count) + ' entr' + (data.count === 1 ? 'y' : 'ies')
        );
        $('#clearFiltersBtn').toggle(hasFilters());
      })
      .catch(function (error) {
        ui.apiError(error, 'Could not load the audit trail');
        $('#tableBody').html(
          '<tr><td colspan="6">' + ui.emptyState({
            icon: 'alert',
            title: 'Could not load the trail',
            message: error.message || 'Please try again.'
          }) + '</td></tr>'
        );
      });
  }

  function reload(showToast) {
    return Promise.all([loadTable(), loadSummary()]).then(function () {
      if (showToast) { ui.success('Audit trail updated'); }
    });
  }

  function clearFilters() {
    state.search = '';
    state.action = '';
    state.entityType = '';
    state.dateFrom = '';
    state.dateTo = '';
    state.page = 1;

    $('#searchInput').val('');
    $('#actionFilter, #entityFilter').val('');
    $('#dateFrom, #dateTo').val('');
    reload();
  }

  /* ----------------------------------------------------------------------
     Wire-up
     ---------------------------------------------------------------------- */
  $(function () {
    T.shell.render('audit');
    $('#searchIcon').html(ui.icon('search', 17));
    $('#refreshBtn').prepend(ui.icon('refresh', 17));
    $('#clearFiltersBtn').prepend(ui.icon('close', 15));

    $('#actionFilter').append(ACTIONS.map(function (action) {
      return '<option value="' + action.value + '">' + ui.esc(action.label) + '</option>';
    }).join(''));

    T.auth.requireAuth()
      .then(function () {
        // The API enforces this too; the message is friendlier than a bare 403.
        if (!session.is('super_admin', 'auditor')) {
          $('#main').html(
            '<div class="card"><div class="card-body">' +
              ui.emptyState({
                icon: 'lock',
                title: 'Restricted to Admins and Auditors',
                message: 'The audit trail records who changed what, so only ' +
                         'compliance roles can read it.'
              }) +
            '</div></div>'
          );
          throw new Error('forbidden');
        }
        return reload();
      })
      .then(function () { T.shell.ready(); })
      .catch(function () { T.shell.ready(); });

    $('#searchInput').on('input', ui.debounce(function () {
      state.search = $(this).val().trim();
      state.page = 1;
      reload();
    }, 350));

    $('#actionFilter, #entityFilter, #dateFrom, #dateTo').on('change', function () {
      var map = {
        actionFilter: 'action',
        entityFilter: 'entityType',
        dateFrom: 'dateFrom',
        dateTo: 'dateTo'
      };
      state[map[this.id]] = $(this).val();
      state.page = 1;
      reload();
    });

    $('#clearFiltersBtn').on('click', clearFilters);
    $('#refreshBtn').on('click', function () { reload(true); });

    $('.table thead').on('click', 'th.is-sortable', function () {
      var key = $(this).data('sort');
      state.ordering = state.ordering === '-' + key ? key : '-' + key;
      state.page = 1;
      $('.table thead th').removeClass('is-sorted-asc is-sorted-desc');
      $(this).addClass(state.ordering.charAt(0) === '-' ? 'is-sorted-desc' : 'is-sorted-asc');
      loadTable();
    });

    $('#paginationControls').on('click', '.page-btn', function () {
      var page = parseInt($(this).data('page'), 10);
      if (!page || page === state.page) { return; }
      state.page = page;
      loadTable();
      $('html, body').animate({ scrollTop: 0 }, 200);
    });

    // Expand a row to see the field-by-field diff.
    $('#tableBody').on('click', '[data-toggle]', function () {
      var id = $(this).data('toggle');
      $(this).toggleClass('is-open');
      $('[data-detail="' + id + '"]').toggleClass('hidden');
    });
  });

}(window.Trasset, window.jQuery));
