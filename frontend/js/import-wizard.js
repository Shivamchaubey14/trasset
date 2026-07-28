/* ==========================================================================
   Trasset — bulk import wizard (FR-10.1)

   Three steps: choose a file, read the validation report, then commit. The
   dry run is not optional — nobody should discover what an import does by
   running it.
   ========================================================================== */

window.Trasset = window.Trasset || {};

(function (T, $) {
  'use strict';

  var ui = T.ui;

  var state = {
    file: null,
    report: null,
    columns: []
  };

  /* ----------------------------------------------------------------------
     Step 1 — pick a file
     ---------------------------------------------------------------------- */
  function stepChooseHtml() {
    return '' +
      '<p class="text-muted text-small mb-4">' +
        'Upload a CSV or Excel file. Categories, locations, departments and ' +
        'vendors are matched <strong>by name</strong>, so use the names that ' +
        'already exist under Master Data.' +
      '</p>' +

      '<div class="field">' +
        '<label class="label" for="importFile">File<span class="req">*</span></label>' +
        '<input class="input" type="file" id="importFile" accept=".csv,.xlsx,.xlsm">' +
        '<div class="field-hint">Up to 5000 rows per file.</div>' +
        '<div class="field-error" id="fileError"></div>' +
      '</div>' +

      '<div class="flex items-center gap-2 mb-4">' +
        '<button type="button" class="btn btn-link btn-sm" id="downloadTemplateBtn">' +
          ui.icon('download', 15) + '<span>Download template</span>' +
        '</button>' +
        '<span class="text-muted text-small">' +
          '— headers plus a worked example using your own master data' +
        '</span>' +
      '</div>' +

      '<details>' +
        '<summary class="text-small fw-500" style="cursor:pointer">' +
          'What can each column contain?' +
        '</summary>' +
        '<div class="table-wrap mt-3" style="max-height:260px;overflow-y:auto">' +
          '<table class="table"><thead><tr>' +
            '<th>Column</th><th>Required</th><th>Notes</th>' +
          '</tr></thead><tbody id="columnHelp"></tbody></table>' +
        '</div>' +
      '</details>';
  }

  /* ----------------------------------------------------------------------
     Step 2 — the validation report
     ---------------------------------------------------------------------- */
  function reportHtml(report) {
    var good = report.valid_rows;
    var bad = report.invalid_rows;

    var summary =
      '<div class="flex gap-5 flex-wrap mb-4">' +
        '<div>' +
          '<div class="kpi-label">Rows checked</div>' +
          '<div class="kpi-value" style="font-size:24px">' + report.total_rows + '</div>' +
        '</div>' +
        '<div>' +
          '<div class="kpi-label">Ready to import</div>' +
          '<div class="kpi-value" style="font-size:24px;color:var(--color-primary)">' +
            good + '</div>' +
        '</div>' +
        '<div>' +
          '<div class="kpi-label">With problems</div>' +
          '<div class="kpi-value" style="font-size:24px;color:' +
            (bad ? 'var(--color-danger)' : 'var(--color-muted)') + '">' + bad + '</div>' +
        '</div>' +
      '</div>';

    if (!bad) {
      return summary +
        '<div class="auth-alert is-info is-visible" style="margin:0">' +
          ui.icon('checkCircle', 17) +
          '<span>Everything checks out. Import to create ' + good +
            ' asset' + (good === 1 ? '' : 's') + '.</span>' +
        '</div>';
    }

    var problems = report.rows.filter(function (row) { return !row.ok; });

    var rows = problems.slice(0, 50).map(function (row) {
      var messages = Object.keys(row.errors).map(function (column) {
        return '<div><strong>' + ui.esc(column) + ':</strong> ' +
                 ui.esc([].concat(row.errors[column]).join(' ')) + '</div>';
      }).join('');

      return '<tr>' +
        '<td class="cell-num">' + row.row + '</td>' +
        '<td>' + (row.name ? ui.esc(row.name) : '<span class="text-muted">—</span>') + '</td>' +
        '<td class="text-small" style="color:var(--color-danger)">' + messages + '</td>' +
      '</tr>';
    }).join('');

    return summary +
      '<div class="auth-alert is-visible mb-4" style="margin:0 0 16px">' +
        ui.icon('warning', 17) +
        '<span>' + bad + ' row' + (bad === 1 ? '' : 's') + ' cannot be imported. ' +
          'Fix the file and re-check, or import the ' + good + ' good row' +
          (good === 1 ? '' : 's') + ' and deal with the rest later.</span>' +
      '</div>' +
      '<div class="table-wrap" style="max-height:300px;overflow-y:auto">' +
        '<table class="table"><thead><tr>' +
          '<th style="width:70px">Row</th><th>Name</th><th>Problem</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div>' +
      (problems.length > 50
        ? '<p class="text-muted text-small mt-3">Showing the first 50 of ' +
            problems.length + ' problem rows.</p>'
        : '');
  }

  /* ----------------------------------------------------------------------
     Requests
     ---------------------------------------------------------------------- */
  function send(options) {
    var form = new FormData();
    form.append('file', state.file);
    if (options.dryRun) { form.append('dry_run', 'true'); }
    if (options.partial) { form.append('partial', 'true'); }

    return T.api.upload('/assets/import/', form);
  }

  function downloadTemplate() {
    fetch(T.api.config.baseUrl + '/assets/import/template/', {
      headers: { Authorization: 'Bearer ' + T.api.tokens.getAccess() }
    })
      .then(function (response) {
        if (!response.ok) { throw new Error('Could not fetch the template.'); }
        return response.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'trasset-asset-import-template.csv';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      })
      .catch(function (error) {
        ui.error('Download failed', error.message);
      });
  }

  /* ----------------------------------------------------------------------
     The wizard
     ---------------------------------------------------------------------- */
  function open(onImported) {
    state.file = null;
    state.report = null;

    var instance = ui.modal({
      title: 'Import assets',
      size: 'lg',
      body: '<div id="wizardBody">' + stepChooseHtml() + '</div>',
      footer:
        '<button class="btn btn-secondary" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-primary" data-act="check">' +
          '<span class="btn-label">Check file</span></button>',
      onOpen: function ($modal, close) {
        var $footer = $modal.find('.modal-footer');

        // Column guidance, fetched once when the wizard opens.
        T.api.get('/assets/import/columns/')
          .then(function (columns) {
            state.columns = columns;
            $modal.find('#columnHelp').html(columns.map(function (column) {
              return '<tr>' +
                '<td class="cell-primary">' + ui.esc(column.header) + '</td>' +
                '<td>' + (column.required
                  ? '<span class="pill pill-danger">Required</span>'
                  : '<span class="text-muted">Optional</span>') + '</td>' +
                '<td class="cell-muted">' +
                  ui.esc(column.help_text ||
                         (column.example ? 'e.g. ' + column.example : '')) +
                '</td>' +
              '</tr>';
            }).join(''));
          })
          .catch(function () { /* guidance is a nicety, not a blocker */ });

        $modal.on('click', '#downloadTemplateBtn', downloadTemplate);
        $modal.find('[data-act="cancel"]').on('click', close);

        $modal.on('change', '#importFile', function () {
          state.file = this.files && this.files[0] ? this.files[0] : null;
          $('#fileError').removeClass('is-visible').text('');
        });

        // --- Step 1 → 2: dry run -------------------------------------
        $footer.on('click', '[data-act="check"]', function () {
          if (!state.file) {
            $('#fileError').addClass('is-visible')
              .text('Choose a file to check.');
            return;
          }

          var $check = $(this);
          ui.setButtonLoading($check, true);

          send({ dryRun: true })
            .then(function (report) {
              state.report = report;
              $modal.find('#wizardBody').html(reportHtml(report));
              renderStepTwoFooter($footer, report);
            })
            .catch(function (error) {
              ui.setButtonLoading($check, false);
              // A file-level problem (wrong type, no rows, too big) comes back
              // as a message rather than a per-row report.
              if (error.errors && error.errors.file) {
                $('#fileError').addClass('is-visible')
                  .text([].concat(error.errors.file).join(' '));
              } else {
                ui.apiError(error, 'That file could not be read');
              }
            });
        });

        // --- Step 2 → done: commit -----------------------------------
        $footer.on('click', '[data-act="import"]', function () {
          var $import = $(this);
          var partial = $import.data('partial') === true;

          ui.setButtonLoading($import, true);

          send({ partial: partial })
            .then(function (report) {
              close();
              ui.success(
                'Imported ' + report.created + ' asset' +
                (report.created === 1 ? '' : 's'),
                report.invalid_rows
                  ? report.invalid_rows + ' row' +
                    (report.invalid_rows === 1 ? '' : 's') + ' were skipped'
                  : 'All rows imported cleanly'
              );
              if (onImported) { onImported(report); }
            })
            .catch(function (error) {
              ui.setButtonLoading($import, false);
              ui.apiError(error, 'The import failed');
            });
        });

        $footer.on('click', '[data-act="back"]', function () {
          state.report = null;
          $modal.find('#wizardBody').html(stepChooseHtml());
          $footer.html(
            '<button class="btn btn-secondary" data-act="cancel">Cancel</button>' +
            '<button class="btn btn-primary" data-act="check">' +
              '<span class="btn-label">Check file</span></button>'
          );
          $modal.find('[data-act="cancel"]').on('click', close);
        });
      }
    });

    return instance;
  }

  function renderStepTwoFooter($footer, report) {
    var buttons =
      '<button class="btn btn-secondary" data-act="back">' +
        '<span class="btn-label">Choose another file</span></button>';

    if (report.valid_rows === 0) {
      // Nothing to do but go back and fix the file.
      $footer.html(buttons);
      return;
    }

    if (report.invalid_rows) {
      buttons += '<button class="btn btn-accent" data-act="import" data-partial="true">' +
                   '<span class="btn-label">Import ' + report.valid_rows +
                   ' good row' + (report.valid_rows === 1 ? '' : 's') + '</span>' +
                 '</button>';
    } else {
      buttons += '<button class="btn btn-primary" data-act="import">' +
                   '<span class="btn-label">Import ' + report.valid_rows +
                   ' asset' + (report.valid_rows === 1 ? '' : 's') + '</span>' +
                 '</button>';
    }

    $footer.html(buttons);
    // jQuery .data() reads the attribute, but keep the flag explicit.
    $footer.find('[data-act="import"]').data('partial', report.invalid_rows > 0);
  }

  T.importWizard = { open: open };

}(window.Trasset, window.jQuery));
