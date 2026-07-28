/* ==========================================================================
   Trasset — procurement (FR-7.1 – FR-7.3)
   ========================================================================== */

(function (T, $) {
  'use strict';

  var ui = T.ui;
  var fmt = ui.fmt;
  var session = T.auth.session;

  var PAGE_SIZE = 20;

  var STAT_CARDS = [
    { key: 'ordered', label: 'On order', icon: 'cart',
      accent: 'var(--color-ink)', soft: 'var(--ink-soft)' },
    { key: 'partially_received', label: 'Part delivered', icon: 'truck',
      accent: 'var(--color-accent)', soft: 'var(--accent-soft)' },
    { key: 'overdue', label: 'Overdue', icon: 'warning',
      accent: 'var(--color-danger)', soft: 'var(--danger-soft)' },
    { key: 'received', label: 'Received', icon: 'checkCircle',
      accent: 'var(--color-primary)', soft: 'var(--primary-soft)' },
    { key: 'outstanding_value', label: 'Committed spend', icon: 'money', money: true,
      accent: 'var(--color-ink)', soft: 'var(--ink-soft)' }
  ];

  var state = {
    page: 1,
    search: '',
    status: '',
    vendor: '',
    due: '',
    ordering: '-po_date'
  };

  function params(extra) {
    var query = {
      search: state.search || undefined,
      status: state.status || undefined,
      vendor: state.vendor || undefined
    };
    if (state.due === 'overdue') { query.overdue = true; }
    if (state.due === 'open') { query.open_only = true; }
    return $.extend(query, extra || {});
  }

  function hasFilters() {
    return Boolean(state.search || state.status || state.vendor || state.due);
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
          (card.key === 'outstanding_value'
            ? '<div class="kpi-meta">of ' + ui.esc(fmt.moneyShort(stats.total_value)) +
              ' ordered all time</div>'
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

  function progressCell(row) {
    var lines = row.items.length;
    var label = lines + ' line' + (lines === 1 ? '' : 's') +
                ' · ' + row.total_ordered + ' unit' + (row.total_ordered === 1 ? '' : 's');

    var html = '<button class="change-toggle text-small fw-500" data-toggle="' + row.id + '" ' +
                       'style="color:var(--color-primary)">' + ui.esc(label) + '</button>';

    if (row.total_received && row.outstanding_quantity) {
      var pct = Math.round((row.total_received / row.total_ordered) * 100);
      html += '<div class="progress mt-2" style="max-width:120px">' +
                '<div class="progress-bar" style="width:' + pct + '%;' +
                  'background:var(--color-accent)"></div></div>' +
              '<span class="cell-muted text-tiny">' + row.total_received + ' of ' +
                row.total_ordered + ' in</span>';
    }
    return html;
  }

  function expectedCell(row) {
    if (!row.expected_delivery) {
      return '<span class="text-muted text-small">—</span>';
    }
    var html = '<span class="text-small text-nowrap">' +
                 ui.esc(fmt.date(row.expected_delivery)) + '</span>';
    if (row.is_overdue) {
      html += '<br><span class="pill pill-danger">overdue</span>';
    } else if (row.received_date) {
      html += '<br><span class="cell-muted">in ' +
                ui.esc(fmt.date(row.received_date)) + '</span>';
    }
    return html;
  }

  function rowActions(row) {
    if (!session.canWrite()) { return '<span class="text-muted text-small">—</span>'; }

    var html = '';
    if (row.status === 'draft') {
      html += '<button class="btn btn-primary btn-sm" data-act="place" data-id="' +
                row.id + '">Place order</button>';
      html += '<button class="btn btn-ghost btn-icon btn-sm" data-act="edit" data-id="' +
                row.id + '" title="Edit">' + ui.icon('edit', 16) + '</button>';
    } else if (row.is_receivable) {
      html += '<button class="btn btn-primary btn-sm" data-act="receive" data-id="' +
                row.id + '">' + ui.icon('truck', 15) + '<span>Receive</span></button>';
    }

    if (!row.is_receivable && row.status !== 'draft') {
      html += '<span class="text-muted text-small">—</span>';
    } else {
      html += '<button class="btn btn-ghost btn-icon btn-sm" data-act="cancel" data-id="' +
                row.id + '" title="Cancel order" style="color:var(--color-danger)">' +
                ui.icon('close', 16) + '</button>';
    }
    return html;
  }

  function lineDetail(row) {
    var lines = row.items.map(function (item) {
      return '<div class="po-line">' +
        '<span><strong>' + ui.esc(item.description) + '</strong>' +
          (item.manufacturer
            ? '<span class="cell-muted"> · ' + ui.esc(item.manufacturer) + '</span>'
            : '') +
        '</span>' +
        '<span class="cell-muted">' +
          (item.category ? ui.esc(item.category.name)
                         : '<em>consumable — no assets</em>') +
        '</span>' +
        '<span>' + item.quantity + ' ordered' +
          (item.received_quantity
            ? '<br><span class="cell-muted">' + item.received_quantity + ' received</span>'
            : '') +
        '</span>' +
        '<span>' + ui.esc(fmt.money(item.unit_cost)) + ' each</span>' +
        '<span class="text-right fw-600">' + ui.esc(fmt.money(item.line_total)) + '</span>' +
      '</div>';
    }).join('');

    return '<tr class="po-detail hidden" data-detail="' + row.id + '">' +
             '<td colspan="7"><div class="po-lines">' + lines +
               (row.reference
                 ? '<div class="mt-3 text-small text-muted">Reference: ' +
                     ui.esc(row.reference) + '</div>'
                 : '') +
               (row.notes
                 ? '<div class="mt-2 text-small text-muted" style="white-space:pre-wrap">' +
                     ui.esc(row.notes) + '</div>'
                 : '') +
             '</div></td>' +
           '</tr>';
  }

  function renderRows(results) {
    if (!results.length) {
      $('#tableBody').html(
        '<tr><td colspan="7">' + ui.emptyState({
          icon: hasFilters() ? 'search' : 'cart',
          title: hasFilters() ? 'No orders match' : 'No purchase orders yet',
          message: hasFilters()
            ? 'Try a different status or vendor.'
            : 'Raise an order against a vendor. When the goods arrive, ' +
              'receiving it creates the asset records for you — one per unit, ' +
              'each with its own tag.',
          actionLabel: (!hasFilters() && session.canWrite()) ? 'New order' : null
        }) + '</td></tr>'
      );
      return;
    }

    $('#tableBody').html(results.map(function (row) {
      var rowClass = row.is_overdue ? ' class="is-overdue"'
                   : row.status === 'partially_received' ? ' class="is-partial"' : '';

      return '<tr' + rowClass + '>' +
        '<td>' +
          '<span class="mono-tag fw-600">' + ui.esc(row.po_number) + '</span><br>' +
          '<span class="cell-muted">' + ui.esc(fmt.date(row.po_date)) + '</span>' +
        '</td>' +
        '<td><span class="cell-primary">' + ui.esc(row.vendor.name) + '</span></td>' +
        '<td>' + progressCell(row) + '</td>' +
        '<td>' + expectedCell(row) + '</td>' +
        '<td>' + statusPill(row) + '</td>' +
        '<td class="cell-num">' + ui.esc(fmt.money(row.total_amount)) + '</td>' +
        '<td><div class="row-actions" style="opacity:1">' + rowActions(row) + '</div></td>' +
      '</tr>' + lineDetail(row);
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
    return T.api.get('/purchase-orders/stats/', params())
      .then(renderStats)
      .catch(function () { $('#statGrid').empty(); });
  }

  function loadTable() {
    $('#tableBody').html(ui.skeletonRows(6, 7));

    return T.api.get('/purchase-orders/', params({
      page: state.page,
      page_size: PAGE_SIZE,
      ordering: state.ordering
    }))
      .then(function (data) {
        renderRows(data.results || []);
        renderPagination(data);
        $('#resultCount').text(
          fmt.number(data.count) + ' order' + (data.count === 1 ? '' : 's')
        );
        $('#clearFiltersBtn').toggle(hasFilters());
      })
      .catch(function (error) {
        ui.apiError(error, 'Could not load purchase orders');
        $('#tableBody').html(
          '<tr><td colspan="7">' + ui.emptyState({
            icon: 'alert', title: 'Could not load orders',
            message: error.message || 'Please try again.'
          }) + '</td></tr>'
        );
      });
  }

  function reload() {
    return Promise.all([loadTable(), loadStats()]);
  }

  function withOrder(id, handler) {
    T.api.get('/purchase-orders/' + id + '/')
      .then(handler)
      .catch(function (error) { ui.apiError(error, 'Could not open the order'); });
  }

  /* ----------------------------------------------------------------------
     Line-item editor
     ---------------------------------------------------------------------- */
  function lineRowHtml(refs, item) {
    var data = item || {};
    var categoryId = data.category ? data.category.id : '';

    return '<div class="line-row">' +
      '<div>' +
        '<input class="input line-description" type="text" ' +
               'placeholder="e.g. Dell Latitude 5440" ' +
               'value="' + ui.esc(data.description || '') + '">' +
        '<label class="checkbox mt-2 text-small">' +
          '<input type="checkbox" class="line-create-assets"' +
                 (data.create_assets === false ? '' : ' checked') + '>' +
          '<span>Create assets</span>' +
        '</label>' +
      '</div>' +
      '<select class="select line-category">' +
        '<option value="">— Category —</option>' +
        refs.categories.map(function (c) {
          return '<option value="' + c.id + '"' +
                 (String(categoryId) === String(c.id) ? ' selected' : '') + '>' +
                 ui.esc(c.name) + '</option>';
        }).join('') +
      '</select>' +
      '<input class="input line-quantity" type="number" min="1" step="1" ' +
             'value="' + ui.esc(data.quantity || 1) + '" aria-label="Quantity">' +
      '<input class="input line-cost" type="number" min="0" step="0.01" ' +
             'value="' + ui.esc(data.unit_cost || '0') + '" aria-label="Unit cost">' +
      '<span class="line-total">₹0</span>' +
      '<button type="button" class="line-remove" aria-label="Remove line">' +
        ui.icon('trash', 16) +
      '</button>' +
    '</div>';
  }

  function recalcLines($modal) {
    var total = 0;
    $modal.find('.line-row').each(function () {
      var $row = $(this);
      var quantity = Number($row.find('.line-quantity').val()) || 0;
      var cost = Number($row.find('.line-cost').val()) || 0;
      var lineTotal = quantity * cost;
      total += lineTotal;
      $row.find('.line-total').text(fmt.money(lineTotal));
    });
    $modal.find('#orderTotal').text(fmt.money(total));
  }

  function collectLines($modal) {
    var lines = [];
    $modal.find('.line-row').each(function () {
      var $row = $(this);
      var description = $.trim($row.find('.line-description').val());
      if (!description) { return; }

      var categoryId = $row.find('.line-category').val();
      lines.push({
        description: description,
        category_id: categoryId ? Number(categoryId) : null,
        quantity: Number($row.find('.line-quantity').val()) || 1,
        unit_cost: String(Number($row.find('.line-cost').val()) || 0),
        create_assets: $row.find('.line-create-assets').is(':checked')
      });
    });
    return lines;
  }

  function openOrderForm(order) {
    var isEdit = Boolean(order);

    T.assetForm.loadRefs().then(function (refs) {
      var today = new Date().toISOString().slice(0, 10);
      var existing = isEdit && order.items.length ? order.items : [null];

      var body =
        '<form id="poForm" novalidate>' +
          '<div class="form-grid">' +
            '<div class="field">' +
              '<label class="label" for="f_vendor">Vendor<span class="req">*</span></label>' +
              '<select class="select" id="f_vendor" required>' +
                '<option value="">— Select a vendor —</option>' +
                refs.vendors.map(function (v) {
                  return '<option value="' + v.id + '"' +
                         (order && order.vendor.id === v.id ? ' selected' : '') + '>' +
                         ui.esc(v.name) + '</option>';
                }).join('') +
              '</select>' +
              '<div class="field-error"></div>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_reference">Quote reference</label>' +
              '<input class="input" type="text" id="f_reference" ' +
                     'value="' + ui.esc(order ? order.reference : '') + '" ' +
                     'placeholder="Supplier quote number">' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_po_date">Order date</label>' +
              '<input class="input" type="date" id="f_po_date" ' +
                     'value="' + ui.esc(order ? order.po_date : today) + '">' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_expected">Expected delivery</label>' +
              '<input class="input" type="date" id="f_expected" ' +
                     'value="' + ui.esc((order && order.expected_delivery) || '') + '">' +
              '<div class="field-error"></div>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_location">Deliver to</label>' +
              '<select class="select" id="f_location">' +
                '<option value="">— None —</option>' +
                refs.locations.map(function (l) {
                  return '<option value="' + l.id + '"' +
                         (order && order.location && order.location.id === l.id
                           ? ' selected' : '') + '>' + ui.esc(l.name) + '</option>';
                }).join('') +
              '</select>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_warranty">Warranty (months)</label>' +
              '<input class="input" type="number" id="f_warranty" min="0" max="120" ' +
                     'value="' + ui.esc(order ? order.warranty_months : 12) + '">' +
              '<div class="field-hint">Stamped onto assets created on receipt.</div>' +
            '</div>' +
          '</div>' +

          '<hr>' +
          '<div class="flex justify-between items-center mb-3">' +
            '<h4 style="margin:0">Line items</h4>' +
            '<button type="button" class="btn btn-secondary btn-sm" id="addLineBtn">' +
              ui.icon('plus', 15) + '<span>Add line</span></button>' +
          '</div>' +

          '<div class="line-head">' +
            '<span>Description</span><span>Category</span><span>Qty</span>' +
            '<span>Unit cost</span><span class="text-right">Total</span><span></span>' +
          '</div>' +
          '<div id="lineRows">' +
            existing.map(function (item) { return lineRowHtml(refs, item); }).join('') +
          '</div>' +

          '<div class="order-total">' +
            '<span class="text-muted">Order total</span>' +
            '<span class="amount" id="orderTotal">₹0</span>' +
          '</div>' +
          '<div class="field-error" id="itemsError"></div>' +
        '</form>';

      ui.modal({
        title: isEdit ? 'Edit ' + order.po_number : 'New purchase order',
        size: 'lg',
        body: body,
        footer:
          '<button class="btn btn-secondary" data-act="cancel">Cancel</button>' +
          '<button class="btn btn-primary" data-act="ok">' +
            '<span class="btn-label">' +
              (isEdit ? 'Save changes' : 'Create draft') +
            '</span></button>',
        onOpen: function ($modal, close) {
          recalcLines($modal);

          $modal.on('input change', '.line-quantity, .line-cost', function () {
            recalcLines($modal);
          });

          // Untick "create assets" and the category stops being required.
          $modal.on('change', '.line-create-assets', function () {
            var $row = $(this).closest('.line-row');
            $row.find('.line-category').prop('disabled', !$(this).is(':checked'));
          });

          $modal.find('#addLineBtn').on('click', function () {
            $modal.find('#lineRows').append(lineRowHtml(refs, null));
            recalcLines($modal);
          });

          $modal.on('click', '.line-remove', function () {
            if ($modal.find('.line-row').length === 1) {
              ui.warning('An order needs at least one line');
              return;
            }
            $(this).closest('.line-row').remove();
            recalcLines($modal);
          });

          $modal.find('[data-act="cancel"]').on('click', close);

          $modal.find('[data-act="ok"]').on('click', function () {
            var $ok = $(this);
            var $form = $modal.find('#poForm');
            var lines = collectLines($modal);

            ui.clearFieldErrors($form);
            $('#itemsError').removeClass('is-visible').text('');

            if (!$modal.find('#f_vendor').val()) {
              $modal.find('#f_vendor').addClass('is-invalid')
                .closest('.field').find('.field-error')
                .addClass('is-visible').text('Choose which vendor this order is with.');
              return;
            }
            if (!lines.length) {
              $('#itemsError').addClass('is-visible')
                .text('Add at least one line item with a description.');
              return;
            }

            var payload = {
              vendor_id: Number($modal.find('#f_vendor').val()),
              po_date: $modal.find('#f_po_date').val() || undefined,
              expected_delivery: $modal.find('#f_expected').val() || null,
              location_id: Number($modal.find('#f_location').val()) || null,
              warranty_months: Number($modal.find('#f_warranty').val()) || 0,
              reference: $.trim($modal.find('#f_reference').val()),
              items: lines
            };

            ui.setButtonLoading($ok, true);

            var request = isEdit
              ? T.api.patch('/purchase-orders/' + order.id + '/', payload)
              : T.api.post('/purchase-orders/', payload);

            request
              .then(function (saved) {
                ui.success(isEdit ? 'Order updated' : 'Draft order created',
                           saved.po_number + ' · ' + fmt.money(saved.total_amount));
                close();
                reload();
              })
              .catch(function (error) {
                ui.setButtonLoading($ok, false);
                var errors = error.errors || {};
                if (errors.items) {
                  $('#itemsError').addClass('is-visible')
                    .text([].concat(errors.items).join(' '));
                }
                if (errors.expected_delivery) {
                  $modal.find('#f_expected').addClass('is-invalid')
                    .closest('.field').find('.field-error')
                    .addClass('is-visible')
                    .text([].concat(errors.expected_delivery).join(' '));
                }
                if (!errors.items && !errors.expected_delivery) {
                  ui.apiError(error, 'Could not save the order');
                }
              });
          });
        }
      });
    });
  }

  /* ----------------------------------------------------------------------
     Receive
     ---------------------------------------------------------------------- */
  function openReceiveDialog(order) {
    var outstanding = order.items.filter(function (item) { return item.outstanding > 0; });

    if (!outstanding.length) {
      ui.info('Nothing outstanding', 'Every line on this order is already booked in.');
      return;
    }

    var willCreate = outstanding.reduce(function (sum, item) {
      return sum + (item.create_assets && item.category ? item.outstanding : 0);
    }, 0);

    var rows = outstanding.map(function (item) {
      return '<div class="line-row" style="grid-template-columns:2fr 90px 90px">' +
        '<div>' +
          '<strong>' + ui.esc(item.description) + '</strong><br>' +
          '<span class="cell-muted text-small">' +
            (item.create_assets && item.category
              ? 'creates ' + ui.esc(item.category.name) + ' assets'
              : 'no assets created') +
          '</span>' +
        '</div>' +
        '<span class="line-total text-muted">' + item.outstanding + ' due</span>' +
        '<input class="input receive-qty" type="number" min="0" ' +
               'max="' + item.outstanding + '" value="' + item.outstanding + '" ' +
               'data-item="' + item.id + '" aria-label="Quantity received">' +
      '</div>';
    }).join('');

    ui.modal({
      title: 'Receive ' + order.po_number,
      size: 'lg',
      body:
        '<form id="receiveForm" novalidate>' +
          '<p class="text-muted text-small mb-4">' +
            'Adjust the quantities if only part of the order arrived. ' +
            (willCreate
              ? 'Receiving everything will create <strong>' + willCreate +
                ' asset' + (willCreate === 1 ? '' : 's') + '</strong>, each with its own tag.'
              : 'No asset records will be created — these lines are consumables.') +
          '</p>' +

          '<div class="line-head" style="grid-template-columns:2fr 90px 90px">' +
            '<span>Item</span><span>Outstanding</span><span>Receiving</span>' +
          '</div>' +
          rows +

          '<div class="form-grid mt-4">' +
            '<div class="field">' +
              '<label class="label" for="f_received_date">Received on</label>' +
              '<input class="input" type="date" id="f_received_date" ' +
                     'max="' + new Date().toISOString().slice(0, 10) + '" ' +
                     'value="' + new Date().toISOString().slice(0, 10) + '">' +
              '<div class="field-error"></div>' +
            '</div>' +
            '<div class="field">' +
              '<label class="label" for="f_notes">Delivery notes</label>' +
              '<input class="input" type="text" id="f_notes" ' +
                     'placeholder="e.g. One box damaged in transit">' +
            '</div>' +
          '</div>' +
        '</form>',
      footer:
        '<button class="btn btn-secondary" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-primary" data-act="ok">' +
          '<span class="btn-label">Receive goods</span></button>',
      onOpen: function ($modal, close) {
        $modal.find('[data-act="cancel"]').on('click', close);

        $modal.find('[data-act="ok"]').on('click', function () {
          var $ok = $(this);
          var lines = [];

          $modal.find('.receive-qty').each(function () {
            lines.push({
              item_id: Number($(this).data('item')),
              quantity: Number($(this).val()) || 0
            });
          });

          if (!lines.some(function (line) { return line.quantity > 0; })) {
            ui.warning('Nothing to receive', 'Enter a quantity on at least one line.');
            return;
          }

          ui.setButtonLoading($ok, true);

          T.api.post('/purchase-orders/' + order.id + '/receive/', {
            lines: lines,
            received_date: $modal.find('#f_received_date').val() || null,
            notes: $.trim($modal.find('#f_notes').val())
          })
            .then(function (result) {
              close();
              reload();

              if (result.created_count) {
                ui.success(
                  result.created_count + ' asset' +
                  (result.created_count === 1 ? '' : 's') + ' created',
                  result.created_assets.map(function (a) { return a.asset_tag; })
                    .slice(0, 4).join(', ') +
                  (result.created_count > 4 ? ' and more' : '')
                );
              } else {
                ui.success('Goods received', result.purchase_order.po_number);
              }
            })
            .catch(function (error) {
              ui.setButtonLoading($ok, false);
              ui.apiError(error, 'Could not receive the goods');
              if (error.status === 409) { reload(); }
            });
        });
      }
    });
  }

  /* ----------------------------------------------------------------------
     Place / cancel
     ---------------------------------------------------------------------- */
  function placeOrder(order) {
    ui.confirm({
      title: 'Place ' + order.po_number + '?',
      message: 'It will be sent to ' + order.vendor.name + ' for ' +
               fmt.money(order.total_amount) +
               '. Line items can no longer be edited once goods start arriving.',
      confirmLabel: 'Place order',
      danger: false
    }).then(function (confirmed) {
      if (!confirmed) { return; }

      T.api.post('/purchase-orders/' + order.id + '/place/', {})
        .then(function (updated) {
          ui.success('Order placed', updated.po_number + ' · ' + updated.vendor.name);
          reload();
        })
        .catch(function (error) { ui.apiError(error, 'Could not place the order'); });
    });
  }

  function cancelOrder(order) {
    var received = order.total_received
      ? ' The ' + order.total_received + ' unit' +
        (order.total_received === 1 ? '' : 's') + ' already received stay on record.'
      : '';

    ui.confirm({
      title: 'Cancel ' + order.po_number + '?',
      message: 'Nothing further can be received against it.' + received,
      confirmLabel: 'Cancel order'
    }).then(function (confirmed) {
      if (!confirmed) { return; }

      T.api.post('/purchase-orders/' + order.id + '/cancel/', {})
        .then(function () {
          ui.success('Order cancelled', order.po_number);
          reload();
        })
        .catch(function (error) { ui.apiError(error, 'Could not cancel'); });
    });
  }

  /* ----------------------------------------------------------------------
     Wire-up
     ---------------------------------------------------------------------- */
  $(function () {
    T.shell.render('procurement');
    $('#searchIcon').html(ui.icon('search', 17));
    $('#newOrderBtn').prepend(ui.icon('plus', 17));
    $('#clearFiltersBtn').prepend(ui.icon('close', 15));

    T.auth.requireAuth()
      .then(function () {
        if (!session.canWrite()) { $('#newOrderBtn').remove(); }

        return T.assetForm.loadRefs().then(function (refs) {
          $('#vendorFilter').append(refs.vendors.map(function (v) {
            return '<option value="' + v.id + '">' + ui.esc(v.name) + '</option>';
          }).join(''));
        });
      })
      .then(reload)
      .then(function () { T.shell.ready(); })
      .catch(function () { T.shell.ready(); });

    $('#searchInput').on('input', ui.debounce(function () {
      state.search = $(this).val().trim();
      state.page = 1;
      reload();
    }, 350));

    $('#statusFilter, #vendorFilter, #dueFilter').on('change', function () {
      var map = { statusFilter: 'status', vendorFilter: 'vendor', dueFilter: 'due' };
      state[map[this.id]] = $(this).val();
      state.page = 1;
      reload();
    });

    $('#clearFiltersBtn').on('click', function () {
      state.search = ''; state.status = ''; state.vendor = ''; state.due = '';
      state.page = 1;
      $('#searchInput').val('');
      $('#statusFilter, #vendorFilter, #dueFilter').val('');
      reload();
    });

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

    $('#newOrderBtn').on('click', function () { openOrderForm(null); });
    $('#tableBody').on('click', '[data-empty-action]', function () { openOrderForm(null); });

    $('#tableBody').on('click', '[data-toggle]', function () {
      var id = $(this).data('toggle');
      $('[data-detail="' + id + '"]').toggleClass('hidden');
    });

    $('#tableBody').on('click', '[data-act="edit"]', function () {
      withOrder($(this).data('id'), openOrderForm);
    });
    $('#tableBody').on('click', '[data-act="place"]', function () {
      withOrder($(this).data('id'), placeOrder);
    });
    $('#tableBody').on('click', '[data-act="receive"]', function () {
      withOrder($(this).data('id'), openReceiveDialog);
    });
    $('#tableBody').on('click', '[data-act="cancel"]', function () {
      withOrder($(this).data('id'), cancelOrder);
    });
  });

}(window.Trasset, window.jQuery));
