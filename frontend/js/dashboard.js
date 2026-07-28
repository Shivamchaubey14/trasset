/* ==========================================================================
   Trasset — dashboard page (FR-11.1, FR-11.2)
   ========================================================================== */

(function (T, $) {
  'use strict';

  var ui = T.ui;
  var fmt = ui.fmt;

  /**
   * KPI tiles. `accent` / `soft` drive the left rule and icon chip so each
   * tile reads at a glance without inventing colours outside the palette.
   */
  var KPI_CARDS = [
    {
      key: 'total_assets', label: 'Total assets', icon: 'box',
      accent: 'var(--color-primary)', soft: 'var(--primary-soft)',
      format: 'number',
      meta: function (k) { return k.categories + ' categories'; }
    },
    {
      key: 'total_value', label: 'Book value', icon: 'money',
      accent: 'var(--color-ink)', soft: 'var(--ink-soft)',
      format: 'money',
      meta: function (k) {
        return fmt.moneyShort(k.accumulated_depreciation) + ' depreciated';
      }
    },
    {
      key: 'assigned', label: 'Assigned', icon: 'users',
      accent: 'var(--color-ink)', soft: 'var(--ink-soft)',
      format: 'number',
      meta: function (k) {
        var total = k.assigned + k.available;
        var pct = total ? Math.round((k.assigned / total) * 100) : 0;
        return pct + '% of assignable stock';
      }
    },
    {
      key: 'available', label: 'Available', icon: 'checkCircle',
      accent: 'var(--color-primary)', soft: 'var(--primary-soft)',
      format: 'number',
      meta: function () { return 'Ready to assign'; }
    },
    {
      key: 'under_maintenance', label: 'In maintenance', icon: 'wrench',
      accent: 'var(--color-accent)', soft: 'var(--accent-soft)',
      format: 'number',
      meta: function (k) { return k.retired + ' retired or lost'; }
    },
    {
      key: 'expiring_warranties', label: 'Warranties expiring', icon: 'clock',
      accent: 'var(--color-danger)', soft: 'var(--danger-soft)',
      format: 'number',
      meta: function (k) {
        return k.expired_warranties > 0
          ? k.expired_warranties + ' already expired'
          : 'Next 30 days';
      }
    }
  ];

  function kpiSkeletons() {
    var html = '';
    for (var i = 0; i < KPI_CARDS.length; i++) {
      html +=
        '<div class="kpi">' +
          '<div class="kpi-top">' +
            '<div class="skeleton skeleton-text w-60" style="width:90px"></div>' +
            '<div class="skeleton skeleton-circle" style="width:38px;height:38px"></div>' +
          '</div>' +
          '<div class="skeleton skeleton-title" style="height:28px;width:70%"></div>' +
          '<div class="skeleton skeleton-text mt-3 w-60"></div>' +
        '</div>';
    }
    return html;
  }

  function renderKpis(kpis) {
    var html = KPI_CARDS.map(function (card) {
      var raw = kpis[card.key];
      var value = card.format === 'money' ? fmt.moneyShort(raw) : fmt.number(raw);

      return '' +
        '<div class="kpi" style="--kpi-accent:' + card.accent + ';--kpi-soft:' + card.soft + '">' +
          '<div class="kpi-top">' +
            '<span class="kpi-label">' + ui.esc(card.label) + '</span>' +
            '<span class="kpi-icon">' + ui.icon(card.icon, 19) + '</span>' +
          '</div>' +
          '<div class="kpi-value" title="' + ui.esc(
              card.format === 'money' ? fmt.money(raw) : fmt.number(raw)
            ) + '">' + ui.esc(value) + '</div>' +
          '<div class="kpi-meta">' + ui.esc(card.meta(kpis)) + '</div>' +
        '</div>';
    }).join('');

    $('#kpiGrid').html(html);
  }

  function renderRecent(rows) {
    var $body = $('#recentBody');

    if (!rows.length) {
      $body.html('<tr><td colspan="3">' + ui.emptyState({
        icon: 'box',
        title: 'No assets yet',
        message: 'Assets you add will appear here.'
      }) + '</td></tr>');
      return;
    }

    $body.html(rows.map(function (row) {
      return '<tr>' +
        '<td>' +
          '<div class="flex items-center gap-3">' +
            '<span class="dot" style="background:' +
              ui.esc(row.category_color || '#7B8794') + '"></span>' +
            '<span>' +
              '<span class="cell-primary">' + ui.esc(row.name) + '</span><br>' +
              '<span class="cell-muted mono-tag">' + ui.esc(row.asset_tag) + '</span>' +
            '</span>' +
          '</div>' +
        '</td>' +
        '<td>' + ui.statusPill(row.status, row.status_label) + '</td>' +
        '<td class="cell-num">' + ui.esc(fmt.money(row.current_value)) + '</td>' +
      '</tr>';
    }).join(''));
  }

  function renderWarranties(rows) {
    var $body = $('#warrantyBody');

    if (!rows.length) {
      $body.html('<tr><td colspan="3">' + ui.emptyState({
        icon: 'checkCircle',
        title: 'Nothing expiring',
        message: 'No warranties fall due in the next 30 days.'
      }) + '</td></tr>');
      return;
    }

    $body.html(rows.map(function (row) {
      // Under a week is worth flagging in Coral rather than Cream Yolk.
      var urgent = row.days_remaining <= 7;
      return '<tr>' +
        '<td>' +
          '<span class="cell-primary">' + ui.esc(row.name) + '</span><br>' +
          '<span class="cell-muted mono-tag">' + ui.esc(row.asset_tag) + '</span>' +
        '</td>' +
        '<td class="text-small">' + ui.esc(fmt.date(row.warranty_expiry)) + '</td>' +
        '<td class="text-right">' +
          '<span class="pill ' + (urgent ? 'pill-danger' : 'pill-warning') + '">' +
            row.days_remaining + ' day' + (row.days_remaining === 1 ? '' : 's') +
          '</span>' +
        '</td>' +
      '</tr>';
    }).join(''));
  }

  function renderCharts(data) {
    T.charts.applyDefaults();
    T.charts.valueLine('valueChart', data.value_over_time || []);
    T.charts.statusDoughnut('statusChart', data.by_status || []);
    T.charts.categoryBar('categoryChart', data.by_category || []);
    T.charts.addedBar('addedChart', data.assets_added || []);
  }

  function load(showToast) {
    var $refresh = $('#refreshBtn');
    ui.setButtonLoading($refresh, true);

    return T.api.get('/dashboard/stats/')
      .then(function (data) {
        renderKpis(data.kpis);
        renderCharts(data);
        renderRecent(data.recent_assets || []);
        renderWarranties(data.expiring_soon || []);
        if (showToast) { ui.success('Dashboard updated'); }
      })
      .catch(function (error) {
        ui.apiError(error, 'Could not load the dashboard');
        $('#kpiGrid').html(
          '<div class="card" style="grid-column:1/-1">' +
            ui.emptyState({
              icon: 'alert',
              title: 'Dashboard unavailable',
              message: error.message || 'Please try refreshing.'
            }) +
          '</div>'
        );
      })
      ['finally'](function () {
        ui.setButtonLoading($refresh, false);
      });
  }

  $(function () {
    T.shell.render('dashboard');
    $('#kpiGrid').html(kpiSkeletons());
    $('#recentBody').html(ui.skeletonRows(4, 3));
    $('#warrantyBody').html(ui.skeletonRows(4, 3));
    $('#refreshBtn').prepend(ui.icon('refresh', 17));

    T.auth.requireAuth()
      .then(function (user) {
        var hour = new Date().getHours();
        var greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        var firstName = (user.full_name || '').split(' ')[0];
        $('#welcomeLine').text(
          greeting + (firstName ? ', ' + firstName : '') +
          " — here's how your asset register is doing."
        );
        return load(false);
      })
      .then(function () { T.shell.ready(); })
      .catch(function () { T.shell.ready(); });

    $('#refreshBtn').on('click', function () { load(true); });
  });

}(window.Trasset, window.jQuery));
