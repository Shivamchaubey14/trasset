/* ==========================================================================
   Trasset — reports (FR-11.3, FR-11.4, FR-10.2)

   The table is built from the column metadata the API returns, so this screen
   does not know what a report contains. Adding a report on the backend makes it
   appear here with no frontend change.
   ========================================================================== */

(function (T, $) {
  'use strict';

  var ui = T.ui;
  var fmt = ui.fmt;

  var PAGE_SIZE = 50;

  var REPORT_ICONS = {
    'asset-register': 'box',
    'depreciation': 'money',
    'maintenance-cost': 'wrench',
    'assignment': 'users'
  };

  var state = {
    report: 'asset-register',
    page: 1,
    dateFrom: '',
    dateTo: '',
    category: '',
    department: '',
    location: '',
    columns: []
  };

  function params(extra) {
    return $.extend({
      date_from: state.dateFrom || undefined,
      date_to: state.dateTo || undefined,
      category: state.category || undefined,
      department: state.department || undefined,
      location: state.location || undefined
    }, extra || {});
  }

  /* ----------------------------------------------------------------------
     Report picker
     ---------------------------------------------------------------------- */
  function renderPicker(reports) {
    $('#reportPicker').html(reports.map(function (report) {
      return '<button class="report-card' +
                 (report.key === state.report ? ' is-active' : '') + '" ' +
                 'data-report="' + ui.esc(report.key) + '">' +
        '<span class="report-card-title">' +
          ui.icon(REPORT_ICONS[report.key] || 'chart', 17) +
          ui.esc(report.title) +
        '</span>' +
        '<span class="report-card-desc">' + ui.esc(report.description) + '</span>' +
      '</button>';
    }).join(''));
  }

  /* ----------------------------------------------------------------------
     Table — driven entirely by the column metadata
     ---------------------------------------------------------------------- */
  function renderHead(columns) {
    $('#tableHead').html(columns.map(function (column) {
      var alignRight = column.kind === 'money' || column.kind === 'number';
      return '<th' + (alignRight ? ' style="text-align:right"' : '') + '>' +
               ui.esc(column.header) +
             '</th>';
    }).join(''));
  }

  function renderCell(value, kind) {
    if (value === null || value === undefined || value === '') {
      return '<span class="text-muted">—</span>';
    }
    if (kind === 'money') { return ui.esc(fmt.money(value)); }
    if (kind === 'date') { return ui.esc(fmt.date(value)); }
    if (kind === 'number') { return ui.esc(value); }
    return ui.esc(value);
  }

  function renderRows(data) {
    var columns = data.columns;

    if (!data.results.length) {
      $('#tableBody').html(
        '<tr><td colspan="' + columns.length + '">' + ui.emptyState({
          icon: 'chart',
          title: 'Nothing to report',
          message: 'No records match these filters. Try widening the date range.'
        }) + '</td></tr>'
      );
      return;
    }

    $('#tableBody').html(data.results.map(function (row) {
      return '<tr>' + columns.map(function (column) {
        var alignRight = column.kind === 'money' || column.kind === 'number';
        return '<td' + (alignRight ? ' class="cell-num"' : '') + '>' +
                 renderCell(row[column.key], column.kind) +
               '</td>';
      }).join('') + '</tr>';
    }).join(''));
  }

  /**
   * Colour a total by what it means, so the eye can tell a cost from a count
   * without reading the label.
   */
  function totalAccent(key) {
    if (/depreciation|variance|rejected|overdue|expired/i.test(key)) {
      return 'var(--color-danger)';
    }
    if (/current_value|book|actual|approved|completed|checkins/i.test(key)) {
      return 'var(--color-primary)';
    }
    if (/cost|value|estimated/i.test(key)) {
      return 'var(--color-accent)';
    }
    return 'var(--color-ink)';
  }

  function renderTotals(totals) {
    var $strip = $('#totalsStrip');
    var keys = Object.keys(totals || {});

    if (!keys.length) { $strip.hide(); return; }

    $strip.html(keys.map(function (key) {
      var value = totals[key];
      // Anything that reads as a money field gets formatted as one.
      var looksLikeMoney = /cost|value|depreciation|variance/i.test(key);
      var display = value === null || value === undefined ? '—'
                  : looksLikeMoney ? fmt.money(value)
                  : fmt.number(value);

      return '<div class="total-item' + (looksLikeMoney ? ' is-money' : '') + '" ' +
                  'style="--total-accent:' + totalAccent(key) + '">' +
               '<span class="label">' + ui.esc(fmt.title(key)) + '</span>' +
               '<span class="value" title="' + ui.esc(display) + '">' +
                 ui.esc(display) +
               '</span>' +
             '</div>';
    }).join('')).show();
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
  function loadReport() {
    var columnCount = Math.max(1, state.columns.length);
    $('#tableBody').html(ui.skeletonRows(8, columnCount));

    return T.api.get('/reports/' + state.report + '/', params({
      page: state.page,
      page_size: PAGE_SIZE
    }))
      .then(function (data) {
        state.columns = data.columns;

        $('#reportTitle').text(data.title);
        $('#reportDescription').text(data.description);
        $('#resultCount').text(fmt.number(data.count) + ' row' +
                               (data.count === 1 ? '' : 's'));

        renderHead(data.columns);
        renderRows(data);
        renderTotals(data.totals);
        renderPagination(data);
      })
      .catch(function (error) {
        ui.apiError(error, 'Could not run the report');
        $('#totalsStrip').hide();
        $('#tableBody').html(
          '<tr><td colspan="' + columnCount + '">' + ui.emptyState({
            icon: 'alert', title: 'Could not run the report',
            message: error.message || 'Please try again.'
          }) + '</td></tr>'
        );
      });
  }

  /* ----------------------------------------------------------------------
     Export

     The download needs the bearer token, so it can't be a plain link. Fetch
     the file as a blob and hand it to a temporary anchor.
     ---------------------------------------------------------------------- */
  function download(exportFormat) {
    var $button = exportFormat === 'xlsx' ? $('#exportXlsxBtn') : $('#exportCsvBtn');
    ui.setButtonLoading($button, true);

    var query = params({ export: exportFormat });
    var search = Object.keys(query)
      .filter(function (key) { return query[key] !== undefined; })
      .map(function (key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(query[key]);
      })
      .join('&');

    var url = T.api.config.baseUrl + '/reports/' + state.report + '/?' + search;

    fetch(url, { headers: { Authorization: 'Bearer ' + T.api.tokens.getAccess() } })
      .then(function (response) {
        if (!response.ok) {
          if (response.status === 429) {
            throw new Error('Too many exports in a short time. Wait a moment.');
          }
          throw new Error('The export failed (' + response.status + ').');
        }
        return response.blob().then(function (blob) {
          return { blob: blob, disposition: response.headers.get('Content-Disposition') };
        });
      })
      .then(function (result) {
        // Prefer the filename the server chose; fall back to a sensible one.
        var filename = state.report + '.' + exportFormat;
        var match = /filename="([^"]+)"/.exec(result.disposition || '');
        if (match) { filename = match[1]; }

        var objectUrl = URL.createObjectURL(result.blob);
        var anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        // Give the browser a moment to start the download before revoking.
        setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 2000);

        ui.success('Download started', filename);
      })
      .catch(function (error) {
        ui.error('Export failed', error.message);
      })
      ['finally'](function () {
        ui.setButtonLoading($button, false);
      });
  }

  /* ----------------------------------------------------------------------
     Wire-up
     ---------------------------------------------------------------------- */
  $(function () {
    T.shell.render('reports');
    $('#exportCsvBtn').prepend(ui.icon('download', 16));
    $('#exportXlsxBtn').prepend(ui.icon('download', 16));

    T.auth.requireAuth()
      .then(function () {
        return Promise.all([
          T.api.get('/reports/'),
          T.assetForm.loadRefs()
        ]);
      })
      .then(function (results) {
        renderPicker(results[0]);

        var refs = results[1];
        $('#categoryFilter').append(refs.categories.map(function (c) {
          return '<option value="' + c.id + '">' + ui.esc(c.name) + '</option>';
        }).join(''));
        $('#departmentFilter').append(refs.departments.map(function (d) {
          return '<option value="' + d.id + '">' + ui.esc(d.name) + '</option>';
        }).join(''));
        $('#locationFilter').append(refs.locations.map(function (l) {
          return '<option value="' + l.id + '">' + ui.esc(l.name) + '</option>';
        }).join(''));

        return loadReport();
      })
      .then(function () { T.shell.ready(); })
      .catch(function () { T.shell.ready(); });

    $('#reportPicker').on('click', '.report-card', function () {
      state.report = $(this).data('report');
      state.page = 1;
      $('.report-card').removeClass('is-active');
      $(this).addClass('is-active');
      loadReport();
    });

    $('#dateFrom, #dateTo, #categoryFilter, #departmentFilter, #locationFilter')
      .on('change', function () {
        var map = {
          dateFrom: 'dateFrom', dateTo: 'dateTo',
          categoryFilter: 'category', departmentFilter: 'department',
          locationFilter: 'location'
        };
        state[map[this.id]] = $(this).val();
        state.page = 1;
        loadReport();
      });

    $('#clearFiltersBtn').on('click', function () {
      state.dateFrom = ''; state.dateTo = '';
      state.category = ''; state.department = ''; state.location = '';
      state.page = 1;
      $('#dateFrom, #dateTo').val('');
      $('#categoryFilter, #departmentFilter, #locationFilter').val('');
      loadReport();
    });

    $('#paginationControls').on('click', '.page-btn', function () {
      var page = parseInt($(this).data('page'), 10);
      if (!page || page === state.page) { return; }
      state.page = page;
      loadReport();
      $('html, body').animate({ scrollTop: 0 }, 200);
    });

    $('#exportCsvBtn').on('click', function () { download('csv'); });
    $('#exportXlsxBtn').on('click', function () { download('xlsx'); });
  });

}(window.Trasset, window.jQuery));
