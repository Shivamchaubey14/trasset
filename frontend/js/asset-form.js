/* ==========================================================================
   Trasset — asset form & lifecycle dialogs
   Shared by the asset list and the detail page so both offer identical
   behaviour (FR-3.1, FR-3.8, FR-4.1, FR-4.2, FR-4.5).
   ========================================================================== */

window.Trasset = window.Trasset || {};

(function (T, $) {
  'use strict';

  var ui = T.ui;

  /* ----------------------------------------------------------------------
     Reference data — fetched once per page load, then reused by every dialog
     ---------------------------------------------------------------------- */
  var refs = {
    categories: null,
    locations: null,
    departments: null,
    vendors: null,
    users: null
  };

  var refsPromise = null;

  function loadRefs() {
    if (refsPromise) { return refsPromise; }

    function list(path) {
      return T.api.get(path, { page_size: 200, ordering: 'name' })
        .then(function (data) { return data.results || []; })
        .catch(function () { return []; });
    }

    refsPromise = Promise.all([
      list('/categories/'),
      list('/locations/'),
      list('/departments/'),
      list('/vendors/'),
      T.api.get('/users/', { page_size: 200, ordering: 'full_name', is_active: true })
        .then(function (data) { return data.results || []; })
        // Only Super Admins may list users; everyone else gets an empty picker.
        .catch(function () { return []; })
    ]).then(function (results) {
      refs.categories = results[0];
      refs.locations = results[1];
      refs.departments = results[2];
      refs.vendors = results[3];
      refs.users = results[4];
      return refs;
    });

    return refsPromise;
  }

  function options(rows, selectedId, placeholder, labelKey) {
    var key = labelKey || 'name';
    var html = placeholder
      ? '<option value="">' + ui.esc(placeholder) + '</option>'
      : '';
    return html + rows.map(function (row) {
      var selected = String(row.id) === String(selectedId) ? ' selected' : '';
      return '<option value="' + row.id + '"' + selected + '>' +
               ui.esc(row[key]) + '</option>';
    }).join('');
  }

  function categoryById(id) {
    return (refs.categories || []).filter(function (c) {
      return String(c.id) === String(id);
    })[0] || null;
  }

  /* ----------------------------------------------------------------------
     Category-driven custom fields (FR-3.8)
     ---------------------------------------------------------------------- */
  function customFieldsHtml(category, values) {
    var fields = (category && category.custom_fields) || [];
    if (!fields.length) {
      return '<p class="text-muted text-small" style="margin:0">' +
               'This category has no extra fields. Add some under Master Data ' +
               'to capture things like RAM or mileage.' +
             '</p>';
    }

    var data = values || {};

    return '<div class="form-grid">' + fields.map(function (field) {
      var id = 'cf_' + field.key;
      var value = data[field.key];
      if (value === undefined || value === null) { value = ''; }
      var control;

      if (field.type === 'select') {
        control = '<select class="select" id="' + id + '" data-cf="' + ui.esc(field.key) + '">' +
                    '<option value="">— Select —</option>' +
                    (field.options || []).map(function (option) {
                      return '<option value="' + ui.esc(option) + '"' +
                             (String(value) === String(option) ? ' selected' : '') + '>' +
                             ui.esc(option) + '</option>';
                    }).join('') +
                  '</select>';

      } else if (field.type === 'boolean') {
        return '<div class="field">' +
                 '<label class="checkbox">' +
                   '<input type="checkbox" id="' + id + '" data-cf="' + ui.esc(field.key) + '"' +
                          (value === true || value === 'true' ? ' checked' : '') + '>' +
                   '<span>' + ui.esc(field.label) + '</span>' +
                 '</label>' +
               '</div>';

      } else {
        var inputType = field.type === 'number' ? 'number'
                      : field.type === 'date' ? 'date' : 'text';
        control = '<input class="input" type="' + inputType + '" id="' + id + '" ' +
                         'data-cf="' + ui.esc(field.key) + '" value="' + ui.esc(value) + '"' +
                         (field.required ? ' required' : '') + '>';
      }

      return '<div class="field">' +
               '<label class="label" for="' + id + '">' + ui.esc(field.label) +
                 (field.required ? '<span class="req">*</span>' : '') +
               '</label>' +
               control +
             '</div>';
    }).join('') + '</div>';
  }

  function readCustomFields($scope) {
    var data = {};
    $scope.find('[data-cf]').each(function () {
      var $field = $(this);
      var key = $field.data('cf');
      if ($field.attr('type') === 'checkbox') {
        data[key] = $field.is(':checked');
        return;
      }
      var value = $field.val();
      if (value === '' || value === null) { return; }
      data[key] = $field.attr('type') === 'number' ? Number(value) : value;
    });
    return data;
  }

  /* ----------------------------------------------------------------------
     Create / edit
     ---------------------------------------------------------------------- */
  function openAssetForm(asset, onSaved) {
    var isEdit = Boolean(asset);

    loadRefs().then(function () {
      var selectedCategoryId = asset && asset.category ? asset.category.id
                             : (refs.categories[0] || {}).id;

      var body =
        '<form id="assetForm" novalidate>' +

          '<div class="form-grid">' +
            '<div class="field field-full">' +
              '<label class="label" for="f_name">Asset name<span class="req">*</span></label>' +
              '<input class="input" id="f_name" name="name" type="text" required ' +
                     'placeholder="e.g. Dell Latitude 5440" ' +
                     'value="' + ui.esc(asset ? asset.name : '') + '">' +
              '<div class="field-error"></div>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_category_id">Category<span class="req">*</span></label>' +
              '<select class="select" id="f_category_id" name="category_id" required>' +
                options(refs.categories, selectedCategoryId) +
              '</select>' +
              '<div class="field-error"></div>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_asset_tag">Asset tag</label>' +
              '<input class="input mono-tag" id="f_asset_tag" name="asset_tag" type="text" ' +
                     'placeholder="Generated automatically" ' +
                     'value="' + ui.esc(asset ? asset.asset_tag : '') + '"' +
                     (isEdit ? '' : '') + '>' +
              '<div class="field-hint">Leave blank for the next TRA number.</div>' +
              '<div class="field-error"></div>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_serial_number">Serial number</label>' +
              '<input class="input" id="f_serial_number" name="serial_number" type="text" ' +
                     'value="' + ui.esc(asset ? asset.serial_number : '') + '">' +
              '<div class="field-error"></div>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_manufacturer">Manufacturer</label>' +
              '<input class="input" id="f_manufacturer" name="manufacturer" type="text" ' +
                     'value="' + ui.esc(asset ? asset.manufacturer : '') + '">' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_location_id">Location</label>' +
              '<select class="select" id="f_location_id" name="location_id" data-null-empty="true">' +
                options(refs.locations, asset && asset.location ? asset.location.id : '', '— None —') +
              '</select>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_department_id">Department</label>' +
              '<select class="select" id="f_department_id" name="department_id" data-null-empty="true">' +
                options(refs.departments, asset && asset.department ? asset.department.id : '', '— None —') +
              '</select>' +
            '</div>' +

            '<div class="field field-full">' +
              '<label class="label" for="f_vendor_id">Vendor</label>' +
              '<select class="select" id="f_vendor_id" name="vendor_id" data-null-empty="true">' +
                options(refs.vendors, asset && asset.vendor ? asset.vendor.id : '', '— None —') +
              '</select>' +
            '</div>' +
          '</div>' +

          '<hr>' +
          '<h4 class="mb-3">Purchase &amp; depreciation</h4>' +

          '<div class="form-grid">' +
            '<div class="field">' +
              '<label class="label" for="f_purchase_date">Purchase date</label>' +
              '<input class="input" id="f_purchase_date" name="purchase_date" type="date" ' +
                     'value="' + ui.esc(asset ? asset.purchase_date : '') + '">' +
              '<div class="field-error"></div>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_purchase_cost">Purchase cost (₹)</label>' +
              '<input class="input" id="f_purchase_cost" name="purchase_cost" type="number" ' +
                     'step="0.01" min="0" ' +
                     'value="' + ui.esc(asset ? asset.purchase_cost : '0') + '">' +
              '<div class="field-error"></div>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_salvage_value">Salvage value (₹)</label>' +
              '<input class="input" id="f_salvage_value" name="salvage_value" type="number" ' +
                     'step="0.01" min="0" ' +
                     'value="' + ui.esc(asset ? asset.salvage_value : '0') + '">' +
              '<div class="field-hint">What it will be worth at end of life.</div>' +
              '<div class="field-error"></div>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_useful_life_years">Useful life (years)</label>' +
              '<input class="input" id="f_useful_life_years" name="useful_life_years" ' +
                     'type="number" min="1" max="100" ' +
                     'value="' + ui.esc(asset ? asset.useful_life_years : 5) + '">' +
              '<div class="field-error"></div>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_depreciation_method">Depreciation method</label>' +
              '<select class="select" id="f_depreciation_method" name="depreciation_method">' +
                '<option value="straight_line"' +
                  (!asset || asset.depreciation_method === 'straight_line' ? ' selected' : '') +
                  '>Straight line</option>' +
                '<option value="declining_balance"' +
                  (asset && asset.depreciation_method === 'declining_balance' ? ' selected' : '') +
                  '>Declining balance</option>' +
              '</select>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f_warranty_expiry">Warranty expiry</label>' +
              '<input class="input" id="f_warranty_expiry" name="warranty_expiry" type="date" ' +
                     'value="' + ui.esc(asset ? asset.warranty_expiry : '') + '">' +
              '<div class="field-error"></div>' +
            '</div>' +
          '</div>' +

          '<hr>' +
          '<h4 class="mb-3">Category details</h4>' +
          '<div id="customFields">' +
            customFieldsHtml(categoryById(selectedCategoryId), asset ? asset.custom_data : null) +
          '</div>' +
          '<div class="field-error" id="customFieldsError"></div>' +

          '<hr>' +
          '<div class="field">' +
            '<label class="label" for="f_notes">Notes</label>' +
            '<textarea class="textarea" id="f_notes" name="notes" ' +
                      'placeholder="Anything worth recording about this asset">' +
              ui.esc(asset ? asset.notes : '') +
            '</textarea>' +
          '</div>' +

        '</form>';

      ui.modal({
        title: isEdit ? 'Edit ' + asset.asset_tag : 'Add asset',
        size: 'lg',
        body: body,
        footer:
          '<button class="btn btn-secondary" data-act="cancel">Cancel</button>' +
          '<button class="btn btn-primary" data-act="save">' +
            '<span class="btn-label">' + (isEdit ? 'Save changes' : 'Create asset') + '</span>' +
          '</button>',
        onOpen: function ($modal, close) {
          var $form = $modal.find('#assetForm');

          // Swapping category swaps the extra fields underneath it.
          $modal.find('#f_category_id').on('change', function () {
            var category = categoryById($(this).val());
            var keep = readCustomFields($modal.find('#customFields'));
            $modal.find('#customFields').html(customFieldsHtml(category, keep));
          });

          $modal.find('[data-act="cancel"]').on('click', close);
          $form.on('submit', function (event) { event.preventDefault(); submit(); });
          $modal.find('[data-act="save"]').on('click', submit);

          function submit() {
            var $save = $modal.find('[data-act="save"]');
            var payload = ui.formToObject($form);
            payload.custom_data = readCustomFields($modal.find('#customFields'));

            // Numeric fields must not go up as strings.
            ['purchase_cost', 'salvage_value', 'useful_life_years'].forEach(function (key) {
              if (payload[key] !== undefined) { payload[key] = Number(payload[key]); }
            });
            if (payload.category_id) { payload.category_id = Number(payload.category_id); }

            ui.clearFieldErrors($form);
            $('#customFieldsError').removeClass('is-visible').text('');
            ui.setButtonLoading($save, true);

            var request = isEdit
              ? T.api.patch('/assets/' + asset.id + '/', payload)
              : T.api.post('/assets/', payload);

            request
              .then(function (saved) {
                ui.success(
                  isEdit ? 'Asset updated' : 'Asset created',
                  saved.asset_tag + ' · ' + saved.name
                );
                close();
                if (onSaved) { onSaved(saved); }
              })
              .catch(function (error) {
                ui.setButtonLoading($save, false);

                // custom_data has no matching input, so surface it separately.
                if (error.errors && error.errors.custom_data) {
                  $('#customFieldsError').addClass('is-visible')
                    .text([].concat(error.errors.custom_data).join(' '));
                }
                if (!ui.applyFieldErrors($form, error)) {
                  ui.apiError(error, 'Could not save the asset');
                }
              });
          }
        }
      });
    });
  }

  /* ----------------------------------------------------------------------
     Assign (FR-4.1)
     ---------------------------------------------------------------------- */
  function openAssignDialog(asset, onDone) {
    loadRefs().then(function () {
      if (!refs.users.length) {
        ui.error('No users available',
                 'Only Super Admins can list users, so the picker is empty.');
        return;
      }

      ui.modal({
        title: 'Assign ' + asset.asset_tag,
        body:
          '<form id="assignForm" novalidate>' +
            '<p class="text-muted text-small">' +
              ui.esc(asset.name) + ' will be checked out and its status set to Assigned.' +
            '</p>' +
            '<div class="field">' +
              '<label class="label" for="f_user_id">Assign to<span class="req">*</span></label>' +
              '<select class="select" id="f_user_id" name="user_id" required>' +
                options(refs.users, '', '— Select a person —', 'full_name') +
              '</select>' +
              '<div class="field-error"></div>' +
            '</div>' +
            '<div class="field">' +
              '<label class="label" for="f_notes">Notes</label>' +
              '<textarea class="textarea" id="f_notes" name="notes" ' +
                        'placeholder="e.g. Issued for onboarding"></textarea>' +
            '</div>' +
          '</form>',
        footer:
          '<button class="btn btn-secondary" data-act="cancel">Cancel</button>' +
          '<button class="btn btn-primary" data-act="ok">' +
            '<span class="btn-label">Assign</span></button>',
        onOpen: function ($modal, close) {
          var $form = $modal.find('#assignForm');
          $modal.find('[data-act="cancel"]').on('click', close);

          $modal.find('[data-act="ok"]').on('click', function () {
            var $ok = $(this);
            var payload = ui.formToObject($form);

            if (!payload.user_id) {
              $('#f_user_id').addClass('is-invalid')
                .closest('.field').find('.field-error')
                .addClass('is-visible').text('Choose who is receiving this asset.');
              return;
            }
            payload.user_id = Number(payload.user_id);

            ui.clearFieldErrors($form);
            ui.setButtonLoading($ok, true);

            T.api.post('/assets/' + asset.id + '/assign/', payload)
              .then(function (updated) {
                ui.success('Assigned',
                           updated.asset_tag + ' → ' + updated.assigned_to.full_name);
                close();
                if (onDone) { onDone(updated); }
              })
              .catch(function (error) {
                ui.setButtonLoading($ok, false);
                if (!ui.applyFieldErrors($form, error)) {
                  ui.apiError(error, 'Could not assign');
                }
              });
          });
        }
      });
    });
  }

  /* ----------------------------------------------------------------------
     Check-in (FR-4.2)
     ---------------------------------------------------------------------- */
  function openCheckinDialog(asset, onDone) {
    loadRefs().then(function () {
      var holder = asset.assigned_to ? asset.assigned_to.full_name : 'the current holder';

      ui.modal({
        title: 'Check in ' + asset.asset_tag,
        body:
          '<form id="checkinForm" novalidate>' +
            '<p class="text-muted text-small">' +
              'Returning from ' + ui.esc(holder) + '. Status goes back to Available.' +
            '</p>' +
            '<div class="field">' +
              '<label class="label" for="f_location_id">Returned to</label>' +
              '<select class="select" id="f_location_id" name="location_id" data-null-empty="true">' +
                options(refs.locations, asset.location ? asset.location.id : '',
                        '— Leave unchanged —') +
              '</select>' +
            '</div>' +
            '<div class="field">' +
              '<label class="label" for="f_notes">Condition notes</label>' +
              '<textarea class="textarea" id="f_notes" name="notes" ' +
                        'placeholder="e.g. Returned in good condition"></textarea>' +
            '</div>' +
          '</form>',
        footer:
          '<button class="btn btn-secondary" data-act="cancel">Cancel</button>' +
          '<button class="btn btn-primary" data-act="ok">' +
            '<span class="btn-label">Check in</span></button>',
        onOpen: function ($modal, close) {
          var $form = $modal.find('#checkinForm');
          $modal.find('[data-act="cancel"]').on('click', close);

          $modal.find('[data-act="ok"]').on('click', function () {
            var $ok = $(this);
            var payload = ui.formToObject($form);
            if (payload.location_id) { payload.location_id = Number(payload.location_id); }

            ui.setButtonLoading($ok, true);

            T.api.post('/assets/' + asset.id + '/checkin/', payload)
              .then(function (updated) {
                ui.success('Checked in', updated.asset_tag + ' is available again');
                close();
                if (onDone) { onDone(updated); }
              })
              .catch(function (error) {
                ui.setButtonLoading($ok, false);
                ui.apiError(error, 'Could not check in');
              });
          });
        }
      });
    });
  }

  /* ----------------------------------------------------------------------
     Retire / lose / dispose (FR-4.5) — terminal, so it confirms explicitly
     ---------------------------------------------------------------------- */
  function openRetireDialog(asset, onDone) {
    ui.modal({
      title: 'Retire ' + asset.asset_tag,
      size: 'sm',
      body:
        '<form id="retireForm" novalidate>' +
          '<div class="flex gap-4 items-start mb-4">' +
            '<div class="confirm-icon is-warning">' + ui.icon('warning', 22) + '</div>' +
            '<p class="text-muted text-small" style="margin:0">' +
              'This is a one-way move. ' + ui.esc(asset.name) + ' will leave active ' +
              'circulation and can no longer be assigned or maintained.' +
            '</p>' +
          '</div>' +
          '<div class="field">' +
            '<label class="label" for="f_status">Outcome<span class="req">*</span></label>' +
            '<select class="select" id="f_status" name="status">' +
              '<option value="retired">Retired — end of useful life</option>' +
              '<option value="disposed">Disposed — sold or scrapped</option>' +
              '<option value="lost">Lost — cannot be located</option>' +
            '</select>' +
          '</div>' +
          '<div class="field">' +
            '<label class="label" for="f_notes">Reason</label>' +
            '<textarea class="textarea" id="f_notes" name="notes" ' +
                      'placeholder="e.g. Collected by e-waste vendor"></textarea>' +
          '</div>' +
        '</form>',
      footer:
        '<button class="btn btn-secondary" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-danger" data-act="ok">' +
          '<span class="btn-label">Retire asset</span></button>',
      onOpen: function ($modal, close) {
        var $form = $modal.find('#retireForm');
        $modal.find('[data-act="cancel"]').on('click', close);

        $modal.find('[data-act="ok"]').on('click', function () {
          var $ok = $(this);
          ui.setButtonLoading($ok, true);

          T.api.post('/assets/' + asset.id + '/retire/', ui.formToObject($form))
            .then(function (updated) {
              ui.success('Asset retired',
                         updated.asset_tag + ' marked ' +
                         updated.status_label.toLowerCase());
              close();
              if (onDone) { onDone(updated); }
            })
            .catch(function (error) {
              ui.setButtonLoading($ok, false);
              ui.apiError(error, 'Could not retire the asset');
            });
        });
      }
    });
  }

  /* ----------------------------------------------------------------------
     Delete (FR-3.4 — soft)
     ---------------------------------------------------------------------- */
  function confirmDelete(asset, onDone) {
    ui.confirm({
      title: 'Delete ' + asset.asset_tag + '?',
      message: 'The record is hidden from the register but kept, so its ' +
               'assignment and maintenance history survives.',
      confirmLabel: 'Delete'
    }).then(function (confirmed) {
      if (!confirmed) { return; }

      T.api.del('/assets/' + asset.id + '/')
        .then(function () {
          ui.success('Asset deleted', asset.asset_tag);
          if (onDone) { onDone(); }
        })
        .catch(function (error) { ui.apiError(error, 'Could not delete'); });
    });
  }

  T.assetForm = {
    loadRefs: loadRefs,
    refs: refs,
    open: openAssetForm,
    assign: openAssignDialog,
    checkin: openCheckinDialog,
    retire: openRetireDialog,
    confirmDelete: confirmDelete
  };

}(window.Trasset, window.jQuery));
