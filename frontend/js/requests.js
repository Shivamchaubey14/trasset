/* ==========================================================================
   Trasset — asset requests & approvals (FR-4.4)

   One screen, two readings: an employee sees their own requests and a way to
   raise a new one; an approver sees an inbox of everything they can decide.
   The API scopes visibility server-side, so this only shapes the wording and
   which controls appear.
   ========================================================================== */

(function (T, $) {
  'use strict';

  var ui = T.ui;
  var fmt = ui.fmt;
  var session = T.auth.session;

  var PAGE_SIZE = 20;

  var STAT_CARDS = [
    { key: 'pending', label: 'Pending', icon: 'clock',
      accent: 'var(--color-accent)', soft: 'var(--accent-soft)' },
    { key: 'approved', label: 'Approved', icon: 'checkCircle',
      accent: 'var(--color-primary)', soft: 'var(--primary-soft)' },
    { key: 'rejected', label: 'Rejected', icon: 'close',
      accent: 'var(--color-danger)', soft: 'var(--danger-soft)' },
    { key: 'total', label: 'All requests', icon: 'inbox',
      accent: 'var(--color-ink)', soft: 'var(--ink-soft)' }
  ];

  var state = {
    page: 1,
    search: '',
    status: '',
    ordering: '-created_at'
  };

  /** Can the signed-in user decide requests? */
  function canApprove() {
    return session.is('super_admin', 'asset_manager', 'department_head');
  }

  /** Auditors are read-only everywhere, so they cannot raise one either. */
  function canRequest() {
    return !session.is('auditor');
  }

  function params(extra) {
    return $.extend({
      search: state.search || undefined,
      status: state.status || undefined
    }, extra || {});
  }

  function hasFilters() {
    return Boolean(state.search || state.status);
  }

  /* ----------------------------------------------------------------------
     Rendering
     ---------------------------------------------------------------------- */
  function renderStats(stats) {
    $('#statGrid').html(STAT_CARDS.map(function (card) {
      return '' +
        '<div class="kpi" style="--kpi-accent:' + card.accent + ';--kpi-soft:' + card.soft + '">' +
          '<div class="kpi-top">' +
            '<span class="kpi-label">' + ui.esc(card.label) + '</span>' +
            '<span class="kpi-icon">' + ui.icon(card.icon, 18) + '</span>' +
          '</div>' +
          '<div class="kpi-value">' + fmt.number(stats[card.key]) + '</div>' +
        '</div>';
    }).join(''));
  }

  function statusPill(row) {
    return '<span class="pill pill-plain" style="background:' + ui.esc(row.status_color) +
             '1f;color:' + ui.esc(row.status_color) + '">' +
             ui.esc(row.status_label) +
           '</span>';
  }

  function rowActions(row) {
    var isMine = session.user && row.requester.id === session.user.id;
    var html = '';

    if (row.is_pending && canApprove()) {
      html += '<button class="btn btn-primary btn-sm" data-act="approve" data-id="' +
                row.id + '">' + ui.icon('check', 15) + '<span>Approve</span></button>';
      html += '<button class="btn btn-ghost btn-icon btn-sm" data-act="reject" data-id="' +
                row.id + '" title="Reject" style="color:var(--color-danger)">' +
                ui.icon('close', 16) + '</button>';
    } else if (row.is_pending && isMine) {
      html += '<button class="btn btn-secondary btn-sm" data-act="cancel" data-id="' +
                row.id + '">Cancel</button>';
    }

    var asset = row.fulfilled_asset || row.asset;
    if (asset) {
      html += '<a class="btn btn-ghost btn-icon btn-sm" href="asset-detail.html?id=' +
                asset.id + '" title="View asset">' + ui.icon('eye', 16) + '</a>';
    }

    return html || '<span class="text-muted text-small">—</span>';
  }

  function renderRows(results) {
    if (!results.length) {
      var mine = !canApprove();
      $('#tableBody').html(
        '<tr><td colspan="6">' + ui.emptyState({
          icon: hasFilters() ? 'search' : 'inbox',
          title: hasFilters() ? 'No requests match'
                              : (mine ? 'You have no requests' : 'Nothing waiting'),
          message: hasFilters()
            ? 'Try a different status, or clear the filters.'
            : (mine
                ? 'Need a laptop, a monitor, or anything else? Raise a request and a manager will review it.'
                : 'No requests are waiting on you right now.'),
          actionLabel: (!hasFilters() && canRequest()) ? 'Request an asset' : null
        }) + '</td></tr>'
      );
      return;
    }

    $('#tableBody').html(results.map(function (row) {
      var wanted = row.fulfilled_asset || row.asset;

      return '<tr' + (row.is_pending ? ' class="is-pending"' : '') + '>' +
        '<td class="text-small text-nowrap">' +
          ui.esc(fmt.date(row.created_at)) +
          '<br><span class="cell-muted">' + ui.esc(fmt.relative(row.created_at)) + '</span>' +
        '</td>' +

        '<td>' +
          '<div class="flex items-center gap-2">' +
            '<span class="avatar avatar-sm avatar-ink">' +
              ui.esc(row.requester.initials || fmt.initials(row.requester.full_name)) +
            '</span>' +
            '<span class="text-small">' + ui.esc(row.requester.full_name) + '</span>' +
          '</div>' +
        '</td>' +

        '<td>' +
          '<span class="cell-primary">' + ui.esc(row.target_label) + '</span>' +
          (row.fulfilled_asset && row.asset &&
           row.fulfilled_asset.id !== row.asset.id
            ? '<br><span class="cell-muted">given ' +
                ui.esc(row.fulfilled_asset.asset_tag) + ' instead</span>'
            : '') +
          (row.needed_by
            ? '<br><span class="cell-muted">needed by ' +
                ui.esc(fmt.date(row.needed_by)) + '</span>'
            : '') +
        '</td>' +

        '<td class="reason-cell">' +
          '<div class="reason-text" title="' + ui.esc(row.reason) + '">' +
            ui.esc(row.reason) +
          '</div>' +
          (row.decision_notes
            ? '<div class="decision-note"><strong>' +
                ui.esc(row.decided_by ? row.decided_by.full_name : 'Decision') +
              ':</strong> ' + ui.esc(row.decision_notes) + '</div>'
            : '') +
        '</td>' +

        '<td>' + statusPill(row) +
          (row.decided_at
            ? '<br><span class="cell-muted">' + ui.esc(fmt.relative(row.decided_at)) + '</span>'
            : '') +
        '</td>' +

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
    return T.api.get('/asset-requests/stats/', params())
      .then(renderStats)
      .catch(function () { $('#statGrid').empty(); });
  }

  function loadTable() {
    $('#tableBody').html(ui.skeletonRows(6, 6));

    return T.api.get('/asset-requests/', params({
      page: state.page,
      page_size: PAGE_SIZE,
      ordering: state.ordering
    }))
      .then(function (data) {
        renderRows(data.results || []);
        renderPagination(data);
        $('#resultCount').text(
          fmt.number(data.count) + ' request' + (data.count === 1 ? '' : 's')
        );
        $('#clearFiltersBtn').toggle(hasFilters());
      })
      .catch(function (error) {
        ui.apiError(error, 'Could not load requests');
        $('#tableBody').html(
          '<tr><td colspan="6">' + ui.emptyState({
            icon: 'alert', title: 'Could not load requests',
            message: error.message || 'Please try again.'
          }) + '</td></tr>'
        );
      });
  }

  function reload() {
    return Promise.all([loadTable(), loadStats()]);
  }

  /* ----------------------------------------------------------------------
     Raise a request
     ---------------------------------------------------------------------- */
  function openRequestForm() {
    T.assetForm.loadRefs().then(function (refs) {
      var categoryOptions = refs.categories.map(function (category) {
        return '<option value="' + category.id + '">' + ui.esc(category.name) + '</option>';
      }).join('');

      ui.modal({
        title: 'Request an asset',
        size: 'lg',
        body:
          '<form id="requestForm" novalidate>' +
            '<p class="text-muted text-small mb-4">' +
              'Ask for a specific asset if you know which one you want, or just ' +
              'pick a category and let a manager choose.' +
            '</p>' +

            '<div class="field">' +
              '<label class="label">What do you need?</label>' +
              '<div class="flex gap-4 flex-wrap">' +
                '<label class="radio"><input type="radio" name="mode" value="category" checked>' +
                  '<span>Any asset from a category</span></label>' +
                '<label class="radio"><input type="radio" name="mode" value="asset">' +
                  '<span>A specific asset</span></label>' +
              '</div>' +
            '</div>' +

            '<div class="field" id="categoryField">' +
              '<label class="label" for="f_category">Category<span class="req">*</span></label>' +
              '<select class="select" id="f_category">' + categoryOptions + '</select>' +
              '<div class="field-error"></div>' +
            '</div>' +

            '<div class="field hidden" id="assetField">' +
              '<label class="label" for="f_asset">Asset<span class="req">*</span></label>' +
              '<select class="select" id="f_asset">' +
                '<option value="">Loading available assets…</option>' +
              '</select>' +
              '<div class="field-hint">Only assets currently available are listed.</div>' +
              '<div class="field-error"></div>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_reason">Why do you need it?<span class="req">*</span></label>' +
              '<textarea class="textarea" id="f_reason" name="reason" ' +
                        'placeholder="e.g. My current laptop keeps crashing during builds."></textarea>' +
              '<div class="field-error"></div>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_needed_by">Needed by</label>' +
              '<input class="input" type="date" id="f_needed_by" name="needed_by" ' +
                     'min="' + new Date().toISOString().slice(0, 10) + '">' +
              '<div class="field-error"></div>' +
            '</div>' +
          '</form>',
        footer:
          '<button class="btn btn-secondary" data-act="cancel">Cancel</button>' +
          '<button class="btn btn-primary" data-act="ok">' +
            '<span class="btn-label">Submit request</span></button>',
        onOpen: function ($modal, close) {
          var $form = $modal.find('#requestForm');

          // Available assets are only needed for the "specific asset" path.
          T.api.get('/assets/', {
            status: 'available', page_size: 200, ordering: 'name'
          }).then(function (data) {
            var rows = data.results || [];
            $modal.find('#f_asset').html(
              rows.length
                ? '<option value="">— Select an asset —</option>' + rows.map(function (a) {
                    return '<option value="' + a.id + '">' +
                             ui.esc(a.asset_tag + ' — ' + a.name) + '</option>';
                  }).join('')
                : '<option value="">No assets are currently available</option>'
            );
          }).catch(function () {
            $modal.find('#f_asset').html('<option value="">Could not load assets</option>');
          });

          $modal.find('[name="mode"]').on('change', function () {
            var byAsset = $(this).val() === 'asset';
            $modal.find('#assetField').toggleClass('hidden', !byAsset);
            $modal.find('#categoryField').toggleClass('hidden', byAsset);
          });

          $modal.find('[data-act="cancel"]').on('click', close);
          $form.on('submit', function (event) { event.preventDefault(); submit(); });
          $modal.find('[data-act="ok"]').on('click', submit);

          function submit() {
            var $ok = $modal.find('[data-act="ok"]');
            var byAsset = $modal.find('[name="mode"]:checked').val() === 'asset';

            var payload = {
              reason: $.trim($modal.find('#f_reason').val()),
              needed_by: $modal.find('#f_needed_by').val() || undefined
            };
            if (byAsset) {
              payload.asset_id = Number($modal.find('#f_asset').val()) || null;
            } else {
              payload.category_id = Number($modal.find('#f_category').val()) || null;
            }

            ui.clearFieldErrors($form);
            ui.setButtonLoading($ok, true);

            T.api.post('/asset-requests/', payload)
              .then(function (created) {
                ui.success('Request submitted',
                           created.target_label + ' — a manager will review it.');
                close();
                reload();
              })
              .catch(function (error) {
                ui.setButtonLoading($ok, false);

                // The API names the field asset_id / category_id; map those onto
                // the two selects so the message lands next to the right control.
                var errors = error.errors || {};
                if (errors.asset_id || errors.category_id) {
                  var target = byAsset ? '#assetField' : '#categoryField';
                  $modal.find(target).find('.field-error')
                    .addClass('is-visible')
                    .text([].concat(errors.asset_id || errors.category_id).join(' '));
                }
                if (errors.reason) {
                  $modal.find('#f_reason').addClass('is-invalid')
                    .closest('.field').find('.field-error')
                    .addClass('is-visible').text([].concat(errors.reason).join(' '));
                }
                if (errors.needed_by) {
                  $modal.find('#f_needed_by').addClass('is-invalid')
                    .closest('.field').find('.field-error')
                    .addClass('is-visible').text([].concat(errors.needed_by).join(' '));
                }
                if (!errors.asset_id && !errors.category_id &&
                    !errors.reason && !errors.needed_by) {
                  ui.apiError(error, 'Could not submit the request');
                }
              });
          }
        }
      });
    });
  }

  /* ----------------------------------------------------------------------
     Decisions
     ---------------------------------------------------------------------- */
  function openApproveDialog(row) {
    // A category request has no asset chosen yet, so the approver must pick one.
    var needsChoice = !row.asset;

    T.api.get('/assets/', {
      status: 'available', page_size: 200, ordering: 'name',
      category: row.category ? row.category.id : undefined
    })
      .catch(function () { return { results: [] }; })
      .then(function (data) {
        var available = data.results || [];

        var assetPicker =
          '<div class="field">' +
            '<label class="label" for="f_asset">' +
              (needsChoice ? 'Asset to hand over' : 'Hand over a different asset') +
              (needsChoice ? '<span class="req">*</span>' : '') +
            '</label>' +
            '<select class="select" id="f_asset">' +
              (needsChoice
                ? '<option value="">— Select an asset —</option>'
                : '<option value="">Keep ' + ui.esc(row.asset.asset_tag) + '</option>') +
              available.map(function (a) {
                return '<option value="' + a.id + '">' +
                         ui.esc(a.asset_tag + ' — ' + a.name) + '</option>';
              }).join('') +
            '</select>' +
            (available.length ? '' :
              '<div class="field-hint text-danger">Nothing is available in this category.</div>') +
            '<div class="field-error"></div>' +
          '</div>';

        ui.modal({
          title: 'Approve request',
          body:
            '<form id="approveForm" novalidate>' +
              '<p class="text-muted text-small mb-4">' +
                ui.esc(row.requester.full_name) + ' asked for <strong>' +
                ui.esc(row.target_label) + '</strong>. Approving checks it out to them ' +
                'straight away.' +
              '</p>' +
              assetPicker +
              '<div class="field">' +
                '<label class="label" for="f_notes">Notes</label>' +
                '<textarea class="textarea" id="f_notes" ' +
                          'placeholder="Optional — visible to the requester"></textarea>' +
              '</div>' +
            '</form>',
          footer:
            '<button class="btn btn-secondary" data-act="cancel">Cancel</button>' +
            '<button class="btn btn-primary" data-act="ok">' +
              '<span class="btn-label">Approve &amp; assign</span></button>',
          onOpen: function ($modal, close) {
            $modal.find('[data-act="cancel"]').on('click', close);

            $modal.find('[data-act="ok"]').on('click', function () {
              var $ok = $(this);
              var assetId = Number($modal.find('#f_asset').val()) || null;

              if (needsChoice && !assetId) {
                $modal.find('#f_asset').addClass('is-invalid')
                  .closest('.field').find('.field-error')
                  .addClass('is-visible').text('Choose which asset to hand over.');
                return;
              }

              ui.setButtonLoading($ok, true);

              T.api.post('/asset-requests/' + row.id + '/approve/', {
                asset_id: assetId,
                notes: $.trim($modal.find('#f_notes').val())
              })
                .then(function (updated) {
                  ui.success('Request approved',
                             updated.fulfilled_asset.asset_tag + ' assigned to ' +
                             updated.requester.full_name);
                  close();
                  reload();
                })
                .catch(function (error) {
                  ui.setButtonLoading($ok, false);
                  ui.apiError(error, 'Could not approve');
                  // A 409 means the world moved — refresh so the row is current.
                  if (error.status === 409) { reload(); }
                });
            });
          }
        });
      });
  }

  function openRejectDialog(row) {
    ui.modal({
      title: 'Reject request',
      size: 'sm',
      body:
        '<form id="rejectForm" novalidate>' +
          '<p class="text-muted text-small mb-4">' +
            ui.esc(row.requester.full_name) + ' asked for <strong>' +
            ui.esc(row.target_label) + '</strong>.' +
          '</p>' +
          '<div class="field">' +
            '<label class="label" for="f_notes">Reason<span class="req">*</span></label>' +
            '<textarea class="textarea" id="f_notes" ' +
                      'placeholder="e.g. No spare stock until next quarter."></textarea>' +
            '<div class="field-hint">The requester sees this.</div>' +
            '<div class="field-error"></div>' +
          '</div>' +
        '</form>',
      footer:
        '<button class="btn btn-secondary" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-danger" data-act="ok">' +
          '<span class="btn-label">Reject request</span></button>',
      onOpen: function ($modal, close) {
        $modal.find('[data-act="cancel"]').on('click', close);

        $modal.find('[data-act="ok"]').on('click', function () {
          var $ok = $(this);
          var notes = $.trim($modal.find('#f_notes').val());

          if (notes.length < 5) {
            $modal.find('#f_notes').addClass('is-invalid')
              .closest('.field').find('.field-error')
              .addClass('is-visible').text('Give the requester a reason, however brief.');
            return;
          }

          ui.setButtonLoading($ok, true);

          T.api.post('/asset-requests/' + row.id + '/reject/', { notes: notes })
            .then(function () {
              ui.success('Request rejected');
              close();
              reload();
            })
            .catch(function (error) {
              ui.setButtonLoading($ok, false);
              ui.apiError(error, 'Could not reject');
            });
        });
      }
    });
  }

  function cancelRequest(row) {
    ui.confirm({
      title: 'Withdraw this request?',
      message: 'You asked for ' + row.target_label + '. You can always raise it again later.',
      confirmLabel: 'Withdraw',
      danger: false
    }).then(function (confirmed) {
      if (!confirmed) { return; }

      T.api.post('/asset-requests/' + row.id + '/cancel/', {})
        .then(function () {
          ui.success('Request withdrawn');
          reload();
        })
        .catch(function (error) { ui.apiError(error, 'Could not withdraw'); });
    });
  }

  function withRequest(id, handler) {
    T.api.get('/asset-requests/' + id + '/')
      .then(handler)
      .catch(function (error) { ui.apiError(error, 'Could not open the request'); });
  }

  /* ----------------------------------------------------------------------
     Wire-up
     ---------------------------------------------------------------------- */
  $(function () {
    T.shell.render('requests');
    $('#searchIcon').html(ui.icon('search', 17));
    $('#newRequestBtn').prepend(ui.icon('plus', 17));
    $('#clearFiltersBtn').prepend(ui.icon('close', 15));

    T.auth.requireAuth()
      .then(function () {
        if (canApprove()) {
          $('#pageTitle').text('Approvals');
          $('#pageSubtitle').text(
            'Requests waiting on you. Approving hands the asset over immediately.'
          );
        } else {
          $('#pageTitle').text('My requests');
          $('#pageSubtitle').text('Ask for the kit you need and track where it got to.');
          $('#requesterHeader').text('Raised by');
        }

        if (!canRequest()) { $('#newRequestBtn').remove(); }

        return reload();
      })
      .then(function () { T.shell.ready(); })
      .catch(function () { T.shell.ready(); });

    $('#searchInput').on('input', ui.debounce(function () {
      state.search = $(this).val().trim();
      state.page = 1;
      reload();
    }, 350));

    $('#statusFilter').on('change', function () {
      state.status = $(this).val();
      state.page = 1;
      reload();
    });

    $('#clearFiltersBtn').on('click', function () {
      state.search = '';
      state.status = '';
      state.page = 1;
      $('#searchInput').val('');
      $('#statusFilter').val('');
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

    $('#newRequestBtn').on('click', openRequestForm);
    $('#tableBody').on('click', '[data-empty-action]', openRequestForm);

    $('#tableBody').on('click', '[data-act="approve"]', function () {
      withRequest($(this).data('id'), openApproveDialog);
    });
    $('#tableBody').on('click', '[data-act="reject"]', function () {
      withRequest($(this).data('id'), openRejectDialog);
    });
    $('#tableBody').on('click', '[data-act="cancel"]', function () {
      withRequest($(this).data('id'), cancelRequest);
    });
  });

}(window.Trasset, window.jQuery));
