/* ==========================================================================
   Trasset — asset list (FR-3.5, FR-3.6)
   ========================================================================== */

(function (T, $) {
  'use strict';

  var ui = T.ui;
  var fmt = ui.fmt;
  var session = T.auth.session;

  var PAGE_SIZE = 25;

  var STATUSES = [
    { value: 'available', label: 'Available' },
    { value: 'assigned', label: 'Assigned' },
    { value: 'under_maintenance', label: 'Under Maintenance' },
    { value: 'retired', label: 'Retired' },
    { value: 'lost', label: 'Lost' },
    { value: 'disposed', label: 'Disposed' }
  ];

  var STAT_CARDS = [
    { key: 'total', label: 'Total assets', icon: 'box',
      accent: 'var(--color-primary)', soft: 'var(--primary-soft)' },
    { key: 'total_value', label: 'Book value', icon: 'money', money: true,
      accent: 'var(--color-ink)', soft: 'var(--ink-soft)' },
    { key: 'available', label: 'Available', icon: 'checkCircle',
      accent: 'var(--color-primary)', soft: 'var(--primary-soft)' },
    { key: 'assigned', label: 'Assigned', icon: 'users',
      accent: 'var(--color-ink)', soft: 'var(--ink-soft)' },
    { key: 'under_maintenance', label: 'In maintenance', icon: 'wrench',
      accent: 'var(--color-accent)', soft: 'var(--accent-soft)' },
    { key: 'retired', label: 'Retired / lost', icon: 'clock',
      accent: 'var(--color-muted)', soft: '#EEF1F4' }
  ];

  var state = {
    page: 1,
    search: '',
    status: '',
    category: '',
    location: '',
    warranty: '',
    ordering: '-created_at'
  };

  /* ----------------------------------------------------------------------
     Query building
     ---------------------------------------------------------------------- */
  function params(extra) {
    return $.extend({
      search: state.search || undefined,
      status: state.status || undefined,
      category: state.category || undefined,
      location: state.location || undefined,
      warranty: state.warranty || undefined
    }, extra || {});
  }

  function hasFilters() {
    return Boolean(state.search || state.status || state.category ||
                   state.location || state.warranty);
  }

  /* ----------------------------------------------------------------------
     Rendering
     ---------------------------------------------------------------------- */
  function renderStats(stats) {
    $('#statGrid').html(STAT_CARDS.map(function (card) {
      var raw = stats[card.key];
      var value = card.money ? fmt.moneyShort(raw) : fmt.number(raw);
      return '' +
        '<div class="kpi" style="--kpi-accent:' + card.accent + ';--kpi-soft:' + card.soft + '">' +
          '<div class="kpi-top">' +
            '<span class="kpi-label">' + ui.esc(card.label) + '</span>' +
            '<span class="kpi-icon">' + ui.icon(card.icon, 18) + '</span>' +
          '</div>' +
          '<div class="kpi-value"' +
               (card.money ? ' title="' + ui.esc(fmt.money(raw)) + '"' : '') + '>' +
            ui.esc(value) +
          '</div>' +
        '</div>';
    }).join(''));
  }

  function warrantyCell(asset) {
    if (!asset.warranty_expiry) {
      return '<span class="text-muted text-small">—</span>';
    }
    if (asset.warranty_expired) {
      return '<span class="pill pill-neutral">Expired</span>';
    }
    if (asset.warranty_expiring_soon) {
      return '<span class="pill pill-warning">' + ui.esc(fmt.date(asset.warranty_expiry)) +
             '</span>';
    }
    return '<span class="text-small">' + ui.esc(fmt.date(asset.warranty_expiry)) + '</span>';
  }

  function rowActions(asset) {
    if (!session.canWrite()) {
      return '<a class="btn btn-ghost btn-icon btn-sm" href="asset-detail.html?id=' +
               asset.id + '" title="View" aria-label="View ' + ui.esc(asset.name) + '">' +
               ui.icon('eye', 16) + '</a>';
    }

    var html = '<a class="btn btn-ghost btn-icon btn-sm" href="asset-detail.html?id=' +
                 asset.id + '" title="View">' + ui.icon('eye', 16) + '</a>';

    if (asset.status === 'available') {
      html += '<button class="btn btn-ghost btn-icon btn-sm" data-act="assign" ' +
                      'data-id="' + asset.id + '" title="Assign" ' +
                      'style="color:var(--color-primary)">' + ui.icon('users', 16) + '</button>';
    } else if (asset.status === 'assigned') {
      html += '<button class="btn btn-ghost btn-icon btn-sm" data-act="checkin" ' +
                      'data-id="' + asset.id + '" title="Check in" ' +
                      'style="color:var(--color-primary)">' + ui.icon('check', 16) + '</button>';
    }

    html += '<button class="btn btn-ghost btn-icon btn-sm" data-act="edit" ' +
                    'data-id="' + asset.id + '" title="Edit">' + ui.icon('edit', 16) + '</button>';

    return html;
  }

  function renderRows(results) {
    if (!results.length) {
      $('#tableBody').html(
        '<tr><td colspan="8">' + ui.emptyState({
          icon: hasFilters() ? 'search' : 'box',
          title: hasFilters() ? 'No assets match' : 'The register is empty',
          message: hasFilters()
            ? 'Try a broader search, or clear the filters to see everything.'
            : 'Add your first asset and Trasset will tag it automatically.',
          actionLabel: (!hasFilters() && session.canWrite()) ? 'Add asset' : null
        }) + '</td></tr>'
      );
      return;
    }

    $('#tableBody').html(results.map(function (asset) {
      return '<tr data-id="' + asset.id + '">' +
        '<td><a class="mono-tag" href="asset-detail.html?id=' + asset.id + '">' +
          ui.esc(asset.asset_tag) + '</a></td>' +

        '<td>' +
          '<div class="flex items-center gap-3">' +
            '<span class="dot" style="background:' +
              ui.esc(asset.category ? asset.category.color : '#7B8794') + '"></span>' +
            '<span>' +
              '<span class="cell-primary">' + ui.esc(asset.name) + '</span><br>' +
              '<span class="cell-muted">' +
                ui.esc(asset.category ? asset.category.name : '—') +
                (asset.serial_number ? ' · ' + ui.esc(asset.serial_number) : '') +
              '</span>' +
            '</span>' +
          '</div>' +
        '</td>' +

        '<td>' + ui.statusPill(asset.status, asset.status_label) + '</td>' +

        '<td>' + (asset.assigned_to
          ? '<div class="flex items-center gap-2">' +
              '<span class="avatar avatar-sm avatar-ink">' +
                ui.esc(asset.assigned_to.initials || fmt.initials(asset.assigned_to.full_name)) +
              '</span>' +
              '<span class="text-small">' + ui.esc(asset.assigned_to.full_name) + '</span>' +
            '</div>'
          : '<span class="text-muted text-small">Unassigned</span>') + '</td>' +

        '<td class="text-small">' +
          (asset.location ? ui.esc(asset.location.name) : '<span class="text-muted">—</span>') +
        '</td>' +

        '<td class="cell-num" title="Purchased at ' + ui.esc(fmt.money(asset.purchase_cost)) + '">' +
          ui.esc(fmt.money(asset.current_value)) +
        '</td>' +

        '<td>' + warrantyCell(asset) + '</td>' +

        '<td><div class="row-actions">' + rowActions(asset) + '</div></td>' +
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
    return T.api.get('/assets/stats/', params())
      .then(renderStats)
      .catch(function () { $('#statGrid').empty(); });
  }

  function loadTable() {
    $('#tableBody').html(ui.skeletonRows(8, 8));

    return T.api.get('/assets/', params({
      page: state.page,
      page_size: PAGE_SIZE,
      ordering: state.ordering
    }))
      .then(function (data) {
        renderRows(data.results || []);
        renderPagination(data);
        $('#resultCount').text(
          fmt.number(data.count) + ' asset' + (data.count === 1 ? '' : 's')
        );
        $('#clearFiltersBtn').toggle(hasFilters());
      })
      .catch(function (error) {
        ui.apiError(error, 'Could not load assets');
        $('#tableBody').html(
          '<tr><td colspan="8">' + ui.emptyState({
            icon: 'alert',
            title: 'Could not load the register',
            message: error.message || 'Please try again.'
          }) + '</td></tr>'
        );
      });
  }

  function reload() {
    return Promise.all([loadTable(), loadStats()]);
  }

  /** Fetch one asset, then hand it to a dialog. */
  function withAsset(id, handler) {
    T.api.get('/assets/' + id + '/')
      .then(handler)
      .catch(function (error) { ui.apiError(error, 'Could not open the asset'); });
  }

  /* ----------------------------------------------------------------------
     Filters
     ---------------------------------------------------------------------- */
  function populateFilters() {
    $('#statusFilter').append(STATUSES.map(function (status) {
      return '<option value="' + status.value + '">' + ui.esc(status.label) + '</option>';
    }).join(''));

    return T.assetForm.loadRefs().then(function (refs) {
      $('#categoryFilter').append(refs.categories.map(function (category) {
        return '<option value="' + category.id + '">' + ui.esc(category.name) + '</option>';
      }).join(''));

      $('#locationFilter').append(refs.locations.map(function (location) {
        return '<option value="' + location.id + '">' + ui.esc(location.name) + '</option>';
      }).join(''));
    });
  }

  function clearFilters() {
    state.search = '';
    state.status = '';
    state.category = '';
    state.location = '';
    state.warranty = '';
    state.page = 1;

    $('#searchInput').val('');
    $('#statusFilter, #categoryFilter, #locationFilter, #warrantyFilter').val('');
    reload();
  }

  /* ----------------------------------------------------------------------
     Wire-up
     ---------------------------------------------------------------------- */
  /** Seed the search box from ?q= so the top-bar search lands here. */
  function readQuerySearch() {
    var match = window.location.search.match(/[?&]q=([^&]*)/);
    if (!match) { return; }
    state.search = decodeURIComponent(match[1].replace(/\+/g, ' ')).trim();
    $('#searchInput').val(state.search);
  }

  $(function () {
    T.shell.render('assets');
    readQuerySearch();
    $('#searchIcon').html(ui.icon('search', 17));
    $('#addBtn').prepend(ui.icon('plus', 17));
    $('#clearFiltersBtn').prepend(ui.icon('close', 15));

    T.auth.requireAuth()
      .then(function () {
        if (!session.canWrite()) { $('#addBtn').remove(); }
        return populateFilters();
      })
      .then(reload)
      .then(function () { T.shell.ready(); })
      .catch(function () { T.shell.ready(); });

    $('#searchInput').on('input', ui.debounce(function () {
      state.search = $(this).val().trim();
      state.page = 1;
      reload();
    }, 350));

    $('#statusFilter, #categoryFilter, #locationFilter, #warrantyFilter').on('change', function () {
      var map = {
        statusFilter: 'status',
        categoryFilter: 'category',
        locationFilter: 'location',
        warrantyFilter: 'warranty'
      };
      state[map[this.id]] = $(this).val();
      state.page = 1;
      reload();
    });

    $('#clearFiltersBtn').on('click', clearFilters);

    $('.table thead').on('click', 'th.is-sortable', function () {
      var key = $(this).data('sort');
      state.ordering = state.ordering === key ? '-' + key : key;
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

    $('#addBtn').on('click', function () { T.assetForm.open(null, reload); });
    $('#tableBody').on('click', '[data-empty-action]', function () {
      T.assetForm.open(null, reload);
    });

    $('#tableBody').on('click', '[data-act="edit"]', function () {
      withAsset($(this).data('id'), function (asset) {
        T.assetForm.open(asset, reload);
      });
    });

    $('#tableBody').on('click', '[data-act="assign"]', function () {
      withAsset($(this).data('id'), function (asset) {
        T.assetForm.assign(asset, reload);
      });
    });

    $('#tableBody').on('click', '[data-act="checkin"]', function () {
      withAsset($(this).data('id'), function (asset) {
        T.assetForm.checkin(asset, reload);
      });
    });
  });

}(window.Trasset, window.jQuery));
