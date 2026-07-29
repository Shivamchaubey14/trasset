/* ==========================================================================
   Trasset — maintenance (FR-6.1 – FR-6.3)
   ========================================================================== */

(function (T, $) {
  'use strict';

  var ui = T.ui;
  var fmt = ui.fmt;
  var session = T.auth.session;

  var PAGE_SIZE = 20;

  var TYPES = [
    { value: 'preventive', label: 'Preventive' },
    { value: 'corrective', label: 'Corrective' },
    { value: 'repair', label: 'Repair' },
    { value: 'inspection', label: 'Inspection' },
    { value: 'calibration', label: 'Calibration' },
    { value: 'upgrade', label: 'Upgrade' },
    { value: 'other', label: 'Other' }
  ];

  var STAT_CARDS = [
    { key: 'in_progress', label: 'Out of service', icon: 'wrench',
      accent: 'var(--color-accent)', soft: 'var(--accent-soft)' },
    { key: 'scheduled', label: 'Scheduled', icon: 'clock',
      accent: 'var(--color-muted)', soft: '#EEF1F4' },
    { key: 'overdue', label: 'Overdue', icon: 'warning',
      accent: 'var(--color-danger)', soft: 'var(--danger-soft)' },
    { key: 'completed', label: 'Completed', icon: 'checkCircle',
      accent: 'var(--color-primary)', soft: 'var(--primary-soft)' },
    { key: 'total_actual_cost', label: 'Spent', icon: 'money', money: true,
      accent: 'var(--color-ink)', soft: 'var(--ink-soft)' }
  ];

  var state = {
    page: 1,
    search: '',
    status: '',
    type: '',
    due: '',
    ordering: '-scheduled_date'
  };

  function params(extra) {
    var query = {
      search: state.search || undefined,
      status: state.status || undefined,
      type: state.type || undefined
    };
    if (state.due === 'overdue') { query.overdue = true; }
    if (state.due === 'open') { query.open_only = true; }
    return $.extend(query, extra || {});
  }

  function hasFilters() {
    return Boolean(state.search || state.status || state.type || state.due);
  }

  /* ----------------------------------------------------------------------
     Rendering
     ---------------------------------------------------------------------- */
  function renderStats(stats) {
    $('#statGrid').html(STAT_CARDS.map(function (card) {
      var raw = stats[card.key];
      return '' +
        '<div class="kpi" style="--kpi-accent:' + card.accent + ';--kpi-soft:' + card.soft + '">' +
          '<div class="kpi-top">' +
            '<span class="kpi-label">' + ui.esc(card.label) + '</span>' +
            '<span class="kpi-icon">' + ui.icon(card.icon, 18) + '</span>' +
          '</div>' +
          '<div class="kpi-value"' +
               (card.money ? ' title="' + ui.esc(fmt.money(raw)) + '"' : '') + '>' +
            ui.esc(card.money ? fmt.moneyShort(raw) : fmt.number(raw)) +
          '</div>' +
          (card.key === 'total_actual_cost'
            ? '<div class="kpi-meta">vs ' +
                ui.esc(fmt.moneyShort(stats.total_estimated_cost)) + ' estimated</div>'
            : '') +
        '</div>';
    }).join(''));
  }

  function statusPill(row) {
    return '<span class="pill pill-plain" style="background:' + ui.esc(row.status_color) +
             '1f;color:' + ui.esc(row.status_color) + '">' +
             ui.esc(row.status_label) +
           '</span>';
  }

  function costCell(row) {
    if (row.actual_cost === null || row.actual_cost === undefined) {
      return '<span class="text-muted text-small">est. ' +
               ui.esc(fmt.money(row.cost_estimate)) + '</span>';
    }

    var variance = parseFloat(row.cost_variance || 0);
    var html = ui.esc(fmt.money(row.actual_cost));

    if (variance) {
      var over = variance > 0;
      html += '<br><span class="text-tiny ' + (over ? 'cost-over' : 'cost-under') + '">' +
                (over ? '+' : '−') + ui.esc(fmt.money(Math.abs(variance))) +
                ' vs est.</span>';
    }
    return html;
  }

  function rowActions(row) {
    var html = '<a class="btn btn-ghost btn-icon btn-sm" href="asset-detail.html?id=' +
                 row.asset.id + '" title="View asset">' + ui.icon('eye', 16) + '</a>';

    if (!session.canWrite()) { return html; }

    if (row.status === 'scheduled') {
      html = '<button class="btn btn-primary btn-sm" data-act="start" data-id="' +
               row.id + '">' + ui.icon('wrench', 15) + '<span>Start</span></button>' +
             '<button class="btn btn-ghost btn-icon btn-sm" data-act="cancel" data-id="' +
               row.id + '" title="Cancel" style="color:var(--color-danger)">' +
               ui.icon('close', 16) + '</button>' + html;

    } else if (row.status === 'in_progress') {
      html = '<button class="btn btn-primary btn-sm" data-act="complete" data-id="' +
               row.id + '">' + ui.icon('check', 15) + '<span>Complete</span></button>' +
             '<button class="btn btn-ghost btn-icon btn-sm" data-act="cancel" data-id="' +
               row.id + '" title="Cancel" style="color:var(--color-danger)">' +
               ui.icon('close', 16) + '</button>' + html;
    }

    return html;
  }

  function dueCell(row) {
    var html = '<span class="text-nowrap">' + ui.esc(fmt.date(row.scheduled_date)) + '</span>';

    if (row.is_overdue) {
      html += '<br><span class="pill pill-danger">' +
                Math.abs(row.days_until_due) + ' days late</span>';
    } else if (row.status === 'scheduled' && row.days_until_due !== null) {
      html += '<br><span class="cell-muted">' +
                (row.days_until_due === 0 ? 'today'
                  : 'in ' + row.days_until_due + ' day' +
                    (row.days_until_due === 1 ? '' : 's')) +
              '</span>';
    } else if (row.completed_date) {
      html += '<br><span class="cell-muted">done ' +
                ui.esc(fmt.date(row.completed_date)) + '</span>';
    }
    return html;
  }

  function renderRows(results) {
    if (!results.length) {
      $('#tableBody').html(
        '<tr><td colspan="7">' + ui.emptyState({
          icon: hasFilters() ? 'search' : 'wrench',
          title: hasFilters() ? 'Nothing matches' : 'No maintenance booked',
          message: hasFilters()
            ? 'Try a different status or date filter.'
            : 'Schedule repairs, servicing and inspections here — the asset ' +
              'goes out of service when the work starts and returns to where ' +
              'it was when it finishes.',
          actionLabel: (!hasFilters() && session.canWrite())
            ? 'Schedule maintenance' : null
        }) + '</td></tr>'
      );
      return;
    }

    $('#tableBody').html(results.map(function (row) {
      var rowClass = row.is_overdue ? ' class="is-overdue"'
                   : row.status === 'in_progress' ? ' class="is-active"' : '';

      return '<tr' + rowClass + '>' +
        '<td class="text-small">' + dueCell(row) + '</td>' +

        '<td>' +
          '<a class="cell-primary" href="asset-detail.html?id=' + row.asset.id + '">' +
            ui.esc(row.asset.name) + '</a><br>' +
          '<span class="cell-muted mono-tag">' + ui.esc(row.asset.asset_tag) + '</span>' +
          (row.asset.assigned_to
            ? '<span class="cell-muted"> · held by ' +
                ui.esc(row.asset.assigned_to.full_name) + '</span>'
            : '') +
        '</td>' +

        '<td>' +
          '<span class="pill pill-neutral pill-plain">' + ui.esc(row.type_label) + '</span>' +
          (row.notes
            ? '<div class="notes-text" title="' + ui.esc(row.notes) + '">' +
                ui.esc(row.notes) + '</div>'
            : '') +
        '</td>' +

        '<td class="text-small">' +
          (row.technician ? ui.esc(row.technician) : '') +
          (row.technician && row.vendor ? '<br>' : '') +
          (row.vendor ? '<span class="cell-muted">' + ui.esc(row.vendor.name) + '</span>' : '') +
          (!row.technician && !row.vendor ? '<span class="text-muted">—</span>' : '') +
        '</td>' +

        '<td>' + statusPill(row) + '</td>' +
        '<td class="cell-num">' + costCell(row) + '</td>' +
        '<td><div class="row-actions" style="opacity:1">' + rowActions(row) + '</div></td>' +
      '</tr>';
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
  function loadStats() {
    return T.api.get('/maintenance/stats/', params())
      .then(renderStats)
      .catch(function () { $('#statGrid').empty(); });
  }

  function loadTable() {
    $('#tableBody').html(ui.skeletonRows(6, 7));

    return T.api.get('/maintenance/', params({
      page: state.page,
      page_size: PAGE_SIZE,
      ordering: state.ordering
    }))
      .then(function (data) {
        renderRows(data.results || []);
        renderPagination(data);
        $('#resultCount').text(
          fmt.number(data.count) + ' record' + (data.count === 1 ? '' : 's')
        );
        $('#clearFiltersBtn').toggle(hasFilters());
      })
      .catch(function (error) {
        ui.apiError(error, 'Could not load maintenance');
        $('#tableBody').html(
          '<tr><td colspan="7">' + ui.emptyState({
            icon: 'alert', title: 'Could not load maintenance',
            message: error.message || 'Please try again.'
          }) + '</td></tr>'
        );
      });
  }

  function reload() {
    return Promise.all([loadTable(), loadStats()]);
  }

  function withRecord(id, handler) {
    T.api.get('/maintenance/' + id + '/')
      .then(handler)
      .catch(function (error) { ui.apiError(error, 'Could not open the record'); });
  }

  /* ----------------------------------------------------------------------
     Schedule
     ---------------------------------------------------------------------- */
  function openScheduleForm() {
    Promise.all([
      T.assetForm.loadRefs(),
      // Only assets that can actually go in for work — terminal ones can't.
      T.api.get('/assets/', { active_only: true, page_size: 200, ordering: 'name' })
        .catch(function () { return { results: [] }; })
    ]).then(function (results) {
      var refs = results[0];
      var assets = results[1].results || [];

      var body =
        '<form id="maintForm" novalidate>' +
          '<div class="form-grid">' +
            '<div class="field field-full">' +
              '<label class="label" for="f_asset">Asset<span class="req">*</span></label>' +
              '<select class="select" id="f_asset" name="asset_id" required>' +
                '<option value="">— Select an asset —</option>' +
                assets.map(function (a) {
                  return '<option value="' + a.id + '">' +
                           ui.esc(a.asset_tag + ' — ' + a.name) +
                           ' (' + ui.esc(a.status_label) + ')</option>';
                }).join('') +
              '</select>' +
              '<div class="field-error"></div>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_type">Type of work</label>' +
              '<select class="select" id="f_type" name="type">' +
                TYPES.map(function (t) {
                  return '<option value="' + t.value + '"' +
                         (t.value === 'repair' ? ' selected' : '') + '>' +
                         ui.esc(t.label) + '</option>';
                }).join('') +
              '</select>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_scheduled_date">' +
                'Scheduled for<span class="req">*</span></label>' +
              '<input class="input" type="date" id="f_scheduled_date" ' +
                     'name="scheduled_date" required ' +
                     'value="' + new Date().toISOString().slice(0, 10) + '">' +
              '<div class="field-error"></div>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_technician">Technician</label>' +
              '<input class="input" type="text" id="f_technician" name="technician" ' +
                     'placeholder="Person doing the work">' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_vendor_id">Vendor</label>' +
              '<select class="select" id="f_vendor_id" name="vendor_id" ' +
                      'data-null-empty="true">' +
                '<option value="">— None —</option>' +
                refs.vendors.map(function (v) {
                  return '<option value="' + v.id + '">' + ui.esc(v.name) + '</option>';
                }).join('') +
              '</select>' +
            '</div>' +

            '<div class="field field-full">' +
              '<label class="label" for="f_cost_estimate">Estimated cost (₹)</label>' +
              '<input class="input" type="number" id="f_cost_estimate" ' +
                     'name="cost_estimate" step="0.01" min="0" value="0">' +
              '<div class="field-error"></div>' +
            '</div>' +

            '<div class="field field-full">' +
              '<label class="label" for="f_notes">What needs doing?</label>' +
              '<textarea class="textarea" id="f_notes" name="notes" ' +
                        'placeholder="e.g. Screen flickering intermittently."></textarea>' +
            '</div>' +

            '<div class="field field-full">' +
              '<label class="checkbox">' +
                '<input type="checkbox" id="f_start_now">' +
                '<span>Start now — take the asset out of service immediately</span>' +
              '</label>' +
              '<div class="field-hint">' +
                'Leave unticked to just book it in; the asset stays usable until ' +
                'the work starts.' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</form>';

      ui.modal({
        title: 'Schedule maintenance',
        size: 'lg',
        body: body,
        footer:
          '<button class="btn btn-secondary" data-act="cancel">Cancel</button>' +
          '<button class="btn btn-primary" data-act="ok">' +
            '<span class="btn-label">Schedule</span></button>',
        onOpen: function ($modal, close) {
          var $form = $modal.find('#maintForm');
          $modal.find('[data-act="cancel"]').on('click', close);
          $form.on('submit', function (event) { event.preventDefault(); submit(); });
          $modal.find('[data-act="ok"]').on('click', submit);

          function submit() {
            var $ok = $modal.find('[data-act="ok"]');
            var payload = ui.formToObject($form);

            if (!payload.asset_id) {
              $modal.find('#f_asset').addClass('is-invalid')
                .closest('.field').find('.field-error')
                .addClass('is-visible').text('Choose which asset the work is for.');
              return;
            }

            payload.asset_id = Number(payload.asset_id);
            if (payload.vendor_id) { payload.vendor_id = Number(payload.vendor_id); }
            payload.cost_estimate = Number(payload.cost_estimate || 0);
            payload.start_now = $modal.find('#f_start_now').is(':checked');

            ui.clearFieldErrors($form);
            ui.setButtonLoading($ok, true);

            T.api.post('/maintenance/', payload)
              .then(function (created) {
                ui.success(
                  payload.start_now ? 'Maintenance started' : 'Maintenance scheduled',
                  created.asset.asset_tag + ' — ' + created.type_label
                );
                close();
                reload();
              })
              .catch(function (error) {
                ui.setButtonLoading($ok, false);
                if (!ui.applyFieldErrors($form, error)) {
                  ui.apiError(error, 'Could not schedule');
                }
              });
          }
        }
      });
    });
  }

  /* ----------------------------------------------------------------------
     Lifecycle actions
     ---------------------------------------------------------------------- */
  function startWork(row) {
    var holder = row.asset.assigned_to
      ? ' It is currently held by ' + row.asset.assigned_to.full_name +
        ', and will return to them when the work is done.'
      : '';

    ui.confirm({
      title: 'Start work on ' + row.asset.asset_tag + '?',
      message: 'The asset goes out of service until this record is completed.' + holder,
      confirmLabel: 'Start work',
      danger: false
    }).then(function (confirmed) {
      if (!confirmed) { return; }

      T.api.post('/maintenance/' + row.id + '/start/', {})
        .then(function (updated) {
          ui.success('Work started', updated.asset.asset_tag + ' is out of service');
          reload();
        })
        .catch(function (error) { ui.apiError(error, 'Could not start the work'); });
    });
  }

  function completeWork(row) {
    // Say where the asset will end up — that is the non-obvious bit.
    var returnsTo = row.asset_status_before === 'assigned'
      ? 'It will go back to ' +
        (row.asset.assigned_to ? row.asset.assigned_to.full_name : 'its holder') + '.'
      : 'It will go back into the available pool.';

    ui.modal({
      title: 'Complete maintenance',
      body:
        '<form id="completeForm" novalidate>' +
          '<p class="text-muted text-small mb-4">' +
            ui.esc(row.asset.asset_tag + ' — ' + row.asset.name) + '. ' +
            ui.esc(returnsTo) +
          '</p>' +
          '<div class="form-grid">' +
            '<div class="field">' +
              '<label class="label" for="f_actual_cost">Actual cost (₹)</label>' +
              '<input class="input" type="number" id="f_actual_cost" step="0.01" ' +
                     'min="0" value="' + ui.esc(row.cost_estimate) + '">' +
              '<div class="field-hint">Estimated ' +
                ui.esc(fmt.money(row.cost_estimate)) + '</div>' +
              '<div class="field-error"></div>' +
            '</div>' +
            '<div class="field">' +
              '<label class="label" for="f_completed_date">Completed on</label>' +
              '<input class="input" type="date" id="f_completed_date" ' +
                     'max="' + new Date().toISOString().slice(0, 10) + '" ' +
                     'value="' + new Date().toISOString().slice(0, 10) + '">' +
              '<div class="field-error"></div>' +
            '</div>' +
            '<div class="field field-full">' +
              '<label class="label" for="f_notes">What was done?</label>' +
              '<textarea class="textarea" id="f_notes" ' +
                        'placeholder="e.g. Screen panel replaced under warranty."></textarea>' +
            '</div>' +
          '</div>' +
        '</form>',
      footer:
        '<button class="btn btn-secondary" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-primary" data-act="ok">' +
          '<span class="btn-label">Mark complete</span></button>',
      onOpen: function ($modal, close) {
        var $form = $modal.find('#completeForm');
        $modal.find('[data-act="cancel"]').on('click', close);

        $modal.find('[data-act="ok"]').on('click', function () {
          var $ok = $(this);
          var cost = $modal.find('#f_actual_cost').val();

          ui.clearFieldErrors($form);
          ui.setButtonLoading($ok, true);

          T.api.post('/maintenance/' + row.id + '/complete/', {
            actual_cost: cost === '' ? null : Number(cost),
            completed_date: $modal.find('#f_completed_date').val() || null,
            notes: $.trim($modal.find('#f_notes').val())
          })
            .then(function (updated) {
              ui.success('Maintenance completed',
                         updated.asset.asset_tag + ' is ' +
                         updated.asset.status_label.toLowerCase() + ' again');
              close();
              reload();
            })
            .catch(function (error) {
              ui.setButtonLoading($ok, false);
              if (!ui.applyFieldErrors($form, error)) {
                ui.apiError(error, 'Could not complete the work');
              }
            });
        });
      }
    });
  }

  function cancelWork(row) {
    var wasStarted = row.status === 'in_progress';

    ui.confirm({
      title: 'Cancel this maintenance?',
      message: wasStarted
        ? 'The work will be called off and ' + row.asset.asset_tag +
          ' goes straight back into service.'
        : 'The booking will be called off. The asset is unaffected.',
      confirmLabel: 'Cancel work'
    }).then(function (confirmed) {
      if (!confirmed) { return; }

      T.api.post('/maintenance/' + row.id + '/cancel/', {})
        .then(function () {
          ui.success('Maintenance cancelled');
          reload();
        })
        .catch(function (error) { ui.apiError(error, 'Could not cancel'); });
    });
  }

  /* ----------------------------------------------------------------------
     Wire-up
     ---------------------------------------------------------------------- */
  $(function () {
    T.shell.render('maintenance');
    $('#searchIcon').html(ui.icon('search', 17));
    $('#scheduleBtn').prepend(ui.icon('plus', 17));
    $('#clearFiltersBtn').prepend(ui.icon('close', 15));

    $('#typeFilter').append(TYPES.map(function (t) {
      return '<option value="' + t.value + '">' + ui.esc(t.label) + '</option>';
    }).join(''));

    T.auth.requireAuth()
      .then(function () {
        if (!session.canWrite()) { $('#scheduleBtn').remove(); }
        return reload();
      })
      .then(function () { T.shell.ready(); })
      .catch(function () { T.shell.ready(); });

    $('#searchInput').on('input', ui.debounce(function () {
      state.search = $(this).val().trim();
      state.page = 1;
      reload();
    }, 350));

    $('#statusFilter, #typeFilter, #dueFilter').on('change', function () {
      var map = { statusFilter: 'status', typeFilter: 'type', dueFilter: 'due' };
      state[map[this.id]] = $(this).val();
      state.page = 1;
      reload();
    });

    $('#clearFiltersBtn').on('click', function () {
      state.search = ''; state.status = ''; state.type = ''; state.due = '';
      state.page = 1;
      $('#searchInput').val('');
      $('#statusFilter, #typeFilter, #dueFilter').val('');
      reload();
    });

    $('.table thead').on('click', 'th.is-sortable', function () {
      var key = $(this).data('sort');
      state.ordering = state.ordering === '-' + key ? key : '-' + key;
      state.page = 1;
      $('.table thead th').removeClass('is-sorted-asc is-sorted-desc');
      $(this).addClass(state.ordering.charAt(0) === '-' ? 'is-sorted-desc' : 'is-sorted-asc');
      ui.syncSortState('.table');
      loadTable();
    });

    $('#paginationControls').on('click', '.page-btn', function () {
      var page = parseInt($(this).data('page'), 10);
      if (!page || page === state.page) { return; }
      state.page = page;
      loadTable();
      $('html, body').animate({ scrollTop: 0 }, 200);
    });

    $('#scheduleBtn').on('click', openScheduleForm);
    $('#tableBody').on('click', '[data-empty-action]', openScheduleForm);

    $('#tableBody').on('click', '[data-act="start"]', function () {
      withRecord($(this).data('id'), startWork);
    });
    $('#tableBody').on('click', '[data-act="complete"]', function () {
      withRecord($(this).data('id'), completeWork);
    });
    $('#tableBody').on('click', '[data-act="cancel"]', function () {
      withRecord($(this).data('id'), cancelWork);
    });
  });

}(window.Trasset, window.jQuery));
