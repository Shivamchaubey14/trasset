/* ==========================================================================
   Trasset — asset detail (FR-3.1, FR-4.3, FR-8.3, FR-9.1)
   ========================================================================== */

(function (T, $) {
  'use strict';

  var ui = T.ui;
  var fmt = ui.fmt;
  var session = T.auth.session;

  var assetId = null;
  var asset = null;

  /* ----------------------------------------------------------------------
     Which asset? ?id=42 or ?tag=TRA-2026-000014 (the QR code uses the tag)
     ---------------------------------------------------------------------- */
  function readQuery() {
    var query = {};
    window.location.search.replace(/^\?/, '').split('&').forEach(function (pair) {
      if (!pair) { return; }
      var parts = pair.split('=');
      query[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || '');
    });
    return query;
  }

  function resolveAsset() {
    var query = readQuery();

    if (query.id) {
      assetId = query.id;
      return T.api.get('/assets/' + assetId + '/');
    }

    if (query.tag) {
      // FR-9.2 — a scanned tag resolves to the detail view.
      return T.api.get('/assets/', { search: query.tag, page_size: 1 })
        .then(function (data) {
          var match = (data.results || [])[0];
          if (!match) {
            throw new T.api.ApiError(404, 'No asset found for tag "' + query.tag + '".');
          }
          assetId = match.id;
          return T.api.get('/assets/' + assetId + '/');
        });
    }

    return Promise.reject(new T.api.ApiError(400, 'No asset specified.'));
  }

  /* ----------------------------------------------------------------------
     Header & actions
     ---------------------------------------------------------------------- */
  function renderHeader() {
    document.title = asset.asset_tag + ' · Trasset';
    $('#crumbTag').text(asset.asset_tag);
    $('#assetName').text(asset.name);
    $('#assetTag').text(asset.asset_tag);
    $('#assetStatus').html(' &nbsp;' + ui.statusPill(asset.status, asset.status_label));

    var buttons = '';

    if (session.canWrite()) {
      if (asset.status === 'available') {
        buttons += '<button class="btn btn-primary" data-act="assign">' +
                     ui.icon('users', 17) + '<span class="btn-label">Assign</span></button>';
      } else if (asset.status === 'assigned') {
        buttons += '<button class="btn btn-primary" data-act="checkin">' +
                     ui.icon('check', 17) + '<span class="btn-label">Check in</span></button>';
      }

      buttons += '<button class="btn btn-secondary" data-act="edit">' +
                   ui.icon('edit', 17) + '<span class="btn-label">Edit</span></button>';

      if (!asset.is_terminal) {
        buttons += '<button class="btn btn-secondary" data-act="retire" ' +
                           'style="color:var(--color-danger)">' +
                     ui.icon('warning', 17) + '<span class="btn-label">Retire</span></button>';
      }
    }

    if (session.isAdmin()) {
      buttons += '<button class="btn btn-ghost btn-icon" data-act="delete" title="Delete" ' +
                         'style="color:var(--color-danger)">' + ui.icon('trash', 18) + '</button>';
    }

    $('#assetActions').html(buttons);
  }

  function spec(label, value, isHtml) {
    return '<div>' +
             '<div class="spec-label">' + ui.esc(label) + '</div>' +
             '<div class="spec-value">' + (isHtml ? value : ui.esc(value || '—')) + '</div>' +
           '</div>';
  }

  function renderOverview() {
    var warranty = '—';
    if (asset.warranty_expiry) {
      var pill = asset.warranty_expired ? 'pill-neutral'
               : asset.warranty_expiring_soon ? 'pill-warning' : 'pill-success';
      var suffix = asset.warranty_expired ? 'Expired'
                 : asset.warranty_days_remaining + ' days left';
      warranty = fmt.date(asset.warranty_expiry) +
                 ' <span class="pill ' + pill + '">' + ui.esc(suffix) + '</span>';
    }

    $('#overviewSpecs').html(
      spec('Category', asset.category
        ? '<span class="flex items-center gap-2">' +
            '<span class="dot" style="background:' + ui.esc(asset.category.color) + '"></span>' +
            ui.esc(asset.category.name) + '</span>'
        : '—', true) +
      spec('Serial number', asset.serial_number) +
      spec('Manufacturer', asset.manufacturer) +
      spec('Model', asset.model_number) +
      spec('Location', asset.location ? asset.location.name : '—') +
      spec('Department', asset.department ? asset.department.name : '—') +
      spec('Vendor', asset.vendor ? asset.vendor.name : '—') +
      spec('Purchased', fmt.date(asset.purchase_date)) +
      spec('Warranty', warranty, true) +
      spec('Added by', asset.created_by ? asset.created_by.full_name : '—') +
      spec('Added on', fmt.date(asset.created_at))
    );
  }

  function renderValuation() {
    var cost = parseFloat(asset.purchase_cost || 0);
    var current = parseFloat(asset.current_value || 0);
    var depreciated = parseFloat(asset.accumulated_depreciation || 0);
    var retained = cost > 0 ? Math.round((current / cost) * 100) : 0;

    $('#valuationBox').html(
      '<div class="mb-4">' +
        '<div class="spec-label">Current book value</div>' +
        '<div class="kpi-value" style="font-size:27px">' +
          ui.esc(fmt.money(current)) +
        '</div>' +
      '</div>' +

      '<div class="progress mb-2"><div class="progress-bar" style="width:' +
        Math.max(0, Math.min(100, retained)) + '%"></div></div>' +
      '<div class="flex justify-between text-small text-muted mb-4">' +
        '<span>' + retained + '% of cost retained</span>' +
        '<span>' + ui.esc(fmt.money(depreciated)) + ' written down</span>' +
      '</div>' +

      '<div class="divider mb-4"></div>' +

      '<div class="spec-list">' +
        spec('Purchase cost', fmt.money(asset.purchase_cost)) +
        spec('Salvage value', fmt.money(asset.salvage_value)) +
        spec('Useful life', asset.useful_life_years + ' years') +
        spec('Method', asset.depreciation_method_label) +
      '</div>'
    );
  }

  function renderAssignment() {
    if (asset.assigned_to) {
      $('#assignmentBox').html(
        '<div class="flex items-center gap-3 mb-4">' +
          '<span class="avatar avatar-lg avatar-ink">' +
            ui.esc(asset.assigned_to.initials || fmt.initials(asset.assigned_to.full_name)) +
          '</span>' +
          '<div>' +
            '<div class="fw-600">' + ui.esc(asset.assigned_to.full_name) + '</div>' +
            '<div class="text-small text-muted">' + ui.esc(asset.assigned_to.email) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="spec-label">Held since</div>' +
        '<div class="spec-value">' + ui.esc(fmt.dateTime(asset.assigned_at)) +
          ' <span class="text-muted text-small">(' +
            ui.esc(fmt.relative(asset.assigned_at)) + ')</span></div>'
      );
      return;
    }

    var message = asset.is_terminal
      ? 'This asset is ' + asset.status_label.toLowerCase() + ' and out of circulation.'
      : asset.status === 'under_maintenance'
        ? 'Currently under maintenance, so it cannot be assigned.'
        : 'Nobody is holding this asset right now.';

    $('#assignmentBox').html(
      '<div class="empty-state" style="padding:24px 8px">' +
        '<div class="empty-state-icon">' + ui.icon('user', 24) + '</div>' +
        '<p class="text-small" style="margin:0">' + ui.esc(message) + '</p>' +
      '</div>'
    );
  }

  function renderSpecs() {
    var fields = (asset.category && asset.category.custom_fields) || [];
    var data = asset.custom_data || {};
    var keys = Object.keys(data);

    var html = '';

    if (!keys.length) {
      html += '<p class="text-muted text-small">' +
                'No category-specific details recorded for this asset.' +
              '</p>';
    } else {
      // Prefer the category's labels; fall back to the raw key for stray data.
      var labels = {};
      fields.forEach(function (field) { labels[field.key] = field.label; });

      html += '<div class="spec-list">' + keys.map(function (key) {
        var value = data[key];
        if (typeof value === 'boolean') { value = value ? 'Yes' : 'No'; }
        return spec(labels[key] || fmt.title(key), value);
      }).join('') + '</div>';
    }

    if (asset.description || asset.notes) {
      html += '<div class="divider mt-5 mb-4"></div>';
      if (asset.description) {
        html += '<div class="spec-label">Description</div>' +
                '<p class="mb-4">' + ui.esc(asset.description) + '</p>';
      }
      if (asset.notes) {
        html += '<div class="spec-label">Notes</div>' +
                '<p class="text-small" style="white-space:pre-wrap">' +
                  ui.esc(asset.notes) + '</p>';
      }
    }

    $('#specsContent').html(html);
  }

  function renderQr() {
    // The QR endpoint needs the bearer token, so fetch it and inline the blob
    // rather than pointing <img src> straight at the API.
    $('#qrBox').html('<div class="skeleton" style="width:168px;height:168px;margin:0 auto"></div>');

    fetch(T.api.config.baseUrl + '/assets/' + assetId + '/qr/?size=6', {
      headers: { Authorization: 'Bearer ' + T.api.tokens.getAccess() }
    })
      .then(function (response) {
        if (!response.ok) { throw new Error('QR unavailable'); }
        return response.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        $('#qrBox').html(
          '<img src="' + url + '" alt="QR code for ' + ui.esc(asset.asset_tag) + '">' +
          '<div class="mono-tag text-small mt-3">' + ui.esc(asset.asset_tag) + '</div>' +
          '<button class="btn btn-secondary btn-sm mt-3" id="printLabel">' +
            ui.icon('download', 15) + '<span>Print label</span>' +
          '</button>'
        );
        $('#printLabel').on('click', function () { window.print(); });
      })
      .catch(function () {
        $('#qrBox').html('<p class="text-muted text-small">QR code unavailable.</p>');
      });
  }

  /* ----------------------------------------------------------------------
     Documents (FR-3.7)
     ---------------------------------------------------------------------- */
  var DOC_ICONS = {
    pdf: 'inbox', csv: 'chart', xlsx: 'chart', xls: 'chart',
    doc: 'inbox', docx: 'inbox',
    png: 'eye', jpg: 'eye', jpeg: 'eye', webp: 'eye'
  };

  function docIcon(filename) {
    var extension = (filename || '').split('.').pop().toLowerCase();
    return DOC_ICONS[extension] || 'inbox';
  }

  function renderDocuments() {
    var attachments = asset.attachments || [];
    $('#docCount').text(attachments.length ? '(' + attachments.length + ')' : '');

    var canWrite = session.canWrite();
    $('#documentsToolbar').toggle(canWrite);

    if (!attachments.length) {
      $('#documentsContent').html(
        canWrite
          ? '<div class="dropzone" id="dropzone" role="button" tabindex="0" ' +
                 'aria-label="Upload a document">' +
              ui.icon('download', 26) +
              '<p class="mt-3" style="margin-bottom:0">' +
                'Drop a file here, or click to choose one' +
              '</p>' +
              '<p class="text-tiny" style="margin:6px 0 0">' +
                'PDF, images, Word or Excel — up to 10 MB' +
              '</p>' +
            '</div>'
          : ui.emptyState({
              icon: 'inbox',
              title: 'No documents',
              message: 'Invoices and warranty certificates will appear here.'
            })
      );
      return;
    }

    var rows = attachments.map(function (doc) {
      return '<div class="doc-row">' +
        '<span class="doc-icon">' + ui.icon(docIcon(doc.filename), 18) + '</span>' +
        '<span class="doc-info">' +
          '<span class="doc-name" title="' + ui.esc(doc.filename) + '">' +
            ui.esc(doc.filename) +
          '</span>' +
          '<span class="doc-meta">' +
            ui.esc(doc.size_display) +
            (doc.uploaded_by_name ? ' · ' + ui.esc(doc.uploaded_by_name) : '') +
            ' · ' + ui.esc(fmt.relative(doc.created_at)) +
            (doc.description ? ' · ' + ui.esc(doc.description) : '') +
          '</span>' +
        '</span>' +
        '<a class="btn btn-ghost btn-icon btn-sm" href="' + ui.esc(doc.file) + '" ' +
           'target="_blank" rel="noopener" title="Open ' + ui.esc(doc.filename) + '" ' +
           'aria-label="Open ' + ui.esc(doc.filename) + '">' +
          ui.icon('eye', 16) +
        '</a>' +
        (canWrite
          ? '<button class="btn btn-ghost btn-icon btn-sm" data-doc-delete="' + doc.id + '" ' +
                    'data-doc-name="' + ui.esc(doc.filename) + '" ' +
                    'title="Delete" aria-label="Delete ' + ui.esc(doc.filename) + '" ' +
                    'style="color:var(--color-danger)">' +
              ui.icon('trash', 16) +
            '</button>'
          : '') +
      '</div>';
    }).join('');

    $('#documentsContent').html(
      rows +
      (canWrite
        ? '<div class="dropzone mt-4" id="dropzone" role="button" tabindex="0" ' +
               'aria-label="Upload another document">' +
            '<span class="text-small">Drop another file here, or click to choose</span>' +
          '</div>'
        : '')
    );
  }

  /** Shared by the toolbar button, the dropzone and drag-and-drop. */
  function uploadFiles(files) {
    if (!files || !files.length) { return; }

    var pending = Array.prototype.slice.call(files);
    var uploaded = 0;
    var failed = [];

    function next() {
      if (!pending.length) {
        if (uploaded) {
          ui.success(
            uploaded + ' document' + (uploaded === 1 ? '' : 's') + ' uploaded',
            failed.length ? failed.length + ' could not be uploaded' : ''
          );
        }
        failed.forEach(function (entry) {
          ui.error('Could not upload ' + entry.name, entry.reason);
        });
        // Re-read the asset so the list reflects what the server actually stored.
        refresh().then(function () { renderDocuments(); });
        return;
      }

      var file = pending.shift();
      var form = new FormData();
      form.append('asset', asset.id);
      form.append('file', file);

      T.api.upload('/attachments/', form)
        .then(function () { uploaded += 1; })
        .catch(function (error) {
          var detail = error.errors && error.errors.file
            ? [].concat(error.errors.file).join(' ')
            : error.message;
          failed.push({ name: file.name, reason: detail });
        })
        ['finally'](next);
    }

    ui.info('Uploading…', pending.length + ' file' + (pending.length === 1 ? '' : 's'));
    next();
  }

  function pickFiles() {
    // A detached input avoids leaving a stray control in the layout.
    var input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.xls,.doc,.docx';
    input.addEventListener('change', function () { uploadFiles(this.files); });
    input.click();
  }

  function deleteDocument(id, name) {
    ui.confirm({
      title: 'Delete ' + name + '?',
      message: 'The file is removed from storage as well as from this asset.',
      confirmLabel: 'Delete'
    }).then(function (confirmed) {
      if (!confirmed) { return; }

      T.api.del('/attachments/' + id + '/')
        .then(function () {
          ui.success('Document deleted', name);
          return refresh();
        })
        .then(function () { renderDocuments(); })
        .catch(function (error) { ui.apiError(error, 'Could not delete'); });
    });
  }

  /* ----------------------------------------------------------------------
     History (FR-4.3)
     ---------------------------------------------------------------------- */
  function renderHistory(rows) {
    if (!rows.length) {
      $('#historyContent').html(ui.emptyState({
        icon: 'clock',
        title: 'No movement yet',
        message: 'Check-outs and check-ins will appear here as they happen.'
      }));
      return;
    }

    $('#historyContent').html('<div class="timeline">' + rows.map(function (row) {
      var isOut = row.action === 'checkout';
      return '<div class="timeline-item">' +
        '<span class="timeline-dot ' + (isOut ? 'is-out' : 'is-in') + '">' +
          ui.icon(isOut ? 'arrowUp' : 'check', 11) +
        '</span>' +
        '<div class="timeline-title">' +
          (isOut ? 'Checked out to ' : 'Checked in from ') +
          ui.esc(row.user.full_name) +
        '</div>' +
        '<div class="timeline-meta">' +
          ui.esc(fmt.dateTime(row.created_at)) +
          ' · ' + ui.esc(fmt.relative(row.created_at)) +
          (row.assigned_by ? ' · by ' + ui.esc(row.assigned_by.full_name) : '') +
          (row.days_held !== null && row.days_held !== undefined
            ? ' · held ' + row.days_held + ' day' + (row.days_held === 1 ? '' : 's')
            : '') +
        '</div>' +
        (row.notes ? '<div class="timeline-note">' + ui.esc(row.notes) + '</div>' : '') +
      '</div>';
    }).join('') + '</div>');
  }

  function loadHistory() {
    $('#historyContent').html(
      '<div class="skeleton skeleton-text w-60 mb-3"></div>' +
      '<div class="skeleton skeleton-text w-40 mb-3"></div>' +
      '<div class="skeleton skeleton-text w-75"></div>'
    );

    return T.api.get('/assets/' + assetId + '/history/')
      .then(renderHistory)
      .catch(function () {
        $('#historyContent').html(ui.emptyState({
          icon: 'alert', title: 'Could not load history', message: ''
        }));
      });
  }

  /* ----------------------------------------------------------------------
     Depreciation (FR-8.3)
     ---------------------------------------------------------------------- */
  var depreciationLoaded = false;

  function loadDepreciation() {
    if (depreciationLoaded) { return Promise.resolve(); }

    return T.api.get('/assets/' + assetId + '/depreciation/')
      .then(function (data) {
        depreciationLoaded = true;

        var rows = data.schedule || [];
        if (!rows.length) {
          $('#tabDepreciation').html(ui.emptyState({
            icon: 'money',
            title: 'No schedule available',
            message: 'Set a purchase date and useful life to see how this asset depreciates.'
          }));
          return;
        }

        $('#depBody').html(rows.map(function (row) {
          return '<tr>' +
            '<td class="cell-primary">' + ui.esc(row.year) + '</td>' +
            '<td class="cell-num">' + ui.esc(fmt.money(row.opening_value)) + '</td>' +
            '<td class="cell-num text-muted">−' + ui.esc(fmt.money(row.depreciation)) + '</td>' +
            '<td class="cell-num fw-600">' + ui.esc(fmt.money(row.closing_value)) + '</td>' +
          '</tr>';
        }).join(''));

        T.charts.applyDefaults();
        T.charts.mount('depChart', {
          type: 'line',
          data: {
            labels: rows.map(function (row) { return row.year; }),
            datasets: [
              {
                label: 'Book value',
                data: rows.map(function (row) { return parseFloat(row.closing_value); }),
                borderColor: T.charts.palette.primary,
                backgroundColor: 'rgba(59, 183, 126, .12)',
                borderWidth: 2.5,
                fill: true,
                tension: .3,
                pointRadius: 4,
                pointBackgroundColor: T.charts.palette.primary
              },
              {
                label: 'Salvage floor',
                data: rows.map(function () { return parseFloat(data.salvage_value); }),
                // Brand Slate: a decorative reference line, not text.
                borderColor: T.charts.palette.slate,
                borderDash: [6, 5],
                borderWidth: 1.5,
                pointRadius: 0,
                fill: false
              }
            ]
          },
          options: {
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { position: 'bottom' },
              tooltip: T.charts.tooltip({
                callbacks: {
                  label: function (ctx) {
                    return ' ' + ctx.dataset.label + ': ' + fmt.money(ctx.parsed.y);
                  }
                }
              })
            },
            scales: {
              x: { grid: { display: false, drawBorder: false } },
              y: {
                beginAtZero: true,
                grid: { color: T.charts.palette.border, drawBorder: false },
                ticks: { callback: function (value) { return fmt.moneyShort(value); } }
              }
            }
          }
        });
      })
      .catch(function (error) { ui.apiError(error, 'Could not load the schedule'); });
  }

  /* ----------------------------------------------------------------------
     Paint & refresh
     ---------------------------------------------------------------------- */
  function paint() {
    renderHeader();
    renderOverview();
    renderValuation();
    renderAssignment();
    renderSpecs();
    renderDocuments();
  }

  function refresh(updated) {
    // An action response carries the asset but not its attachments, so a
    // document change always re-reads rather than trusting the payload.
    if (updated) {
      asset = $.extend({}, updated, { attachments: asset.attachments });
      paint();
      loadHistory();
      return Promise.resolve();
    }
    return T.api.get('/assets/' + assetId + '/').then(function (fresh) {
      asset = fresh;
      paint();
      return loadHistory();
    });
  }

  /* ----------------------------------------------------------------------
     Wire-up
     ---------------------------------------------------------------------- */
  $(function () {
    T.shell.render('assets');

    T.auth.requireAuth()
      .then(resolveAsset)
      .then(function (loaded) {
        asset = loaded;
        paint();
        renderQr();
        return loadHistory();
      })
      .then(function () { T.shell.ready(); })
      .catch(function (error) {
        T.shell.ready();
        if (!error || error.status === undefined) { return; }
        $('#main').html(
          '<div class="card"><div class="card-body">' +
            ui.emptyState({
              icon: 'alert',
              title: 'Asset not found',
              message: error.message || 'That asset does not exist or has been deleted.'
            }) +
          '</div></div>'
        );
      });

    $('.tabs').on('click', '.tab', function () {
      var tab = $(this).data('tab');

      $('.tab').removeClass('is-active').attr('aria-selected', 'false');
      $(this).addClass('is-active').attr('aria-selected', 'true');

      $('#tabHistory, #tabSpecs, #tabDocuments, #tabDepreciation').addClass('hidden');
      $('#tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).removeClass('hidden');

      if (tab === 'depreciation') { loadDepreciation(); }
    });

    // Arrow-key navigation between tabs, as a tablist should have.
    $('.tabs').on('keydown', '.tab', function (event) {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') { return; }
      event.preventDefault();

      var $tabs = $('.tab');
      var index = $tabs.index(this);
      var next = event.key === 'ArrowRight'
        ? (index + 1) % $tabs.length
        : (index - 1 + $tabs.length) % $tabs.length;

      $tabs.eq(next).trigger('click').focus();
    });

    /* --- Documents --- */
    $('#uploadDocBtn').on('click', pickFiles);

    $('#documentsContent')
      .on('click', '#dropzone', pickFiles)
      .on('keydown', '#dropzone', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          pickFiles();
        }
      })
      .on('dragover dragenter', '#dropzone', function (event) {
        event.preventDefault();
        event.stopPropagation();
        $(this).addClass('is-over');
      })
      .on('dragleave dragend drop', '#dropzone', function () {
        $(this).removeClass('is-over');
      })
      .on('drop', '#dropzone', function (event) {
        event.preventDefault();
        event.stopPropagation();
        uploadFiles(event.originalEvent.dataTransfer.files);
      })
      .on('click', '[data-doc-delete]', function () {
        deleteDocument($(this).data('doc-delete'), $(this).data('doc-name'));
      });

    // Dropping a file anywhere else must not make the browser navigate to it.
    $(document).on('dragover drop', function (event) { event.preventDefault(); });

    $('#assetActions')
      .on('click', '[data-act="assign"]', function () {
        T.assetForm.assign(asset, refresh);
      })
      .on('click', '[data-act="checkin"]', function () {
        T.assetForm.checkin(asset, refresh);
      })
      .on('click', '[data-act="edit"]', function () {
        T.assetForm.open(asset, refresh);
      })
      .on('click', '[data-act="retire"]', function () {
        T.assetForm.retire(asset, refresh);
      })
      .on('click', '[data-act="delete"]', function () {
        T.assetForm.confirmDelete(asset, function () {
          window.location.href = 'assets.html';
        });
      });
  });

}(window.Trasset, window.jQuery));
