/* ==========================================================================
   Trasset — Master Data (FR-5.1 – FR-5.4)

   One table + one modal, driven by a per-entity config. Adding a new master
   means adding an entry to ENTITIES, not writing another screen.
   ========================================================================== */

(function (T, $) {
  'use strict';

  var ui = T.ui;
  var fmt = ui.fmt;
  var session = T.auth.session;

  var PAGE_SIZE = 15;

  /* ----------------------------------------------------------------------
     Entity definitions
     ---------------------------------------------------------------------- */
  var ENTITIES = {
    categories: {
      label: 'Categories',
      singular: 'Category',
      icon: 'layers',
      path: '/categories/',
      searchPlaceholder: 'Search categories…',
      emptyMessage: 'Categories group your assets — laptops, vehicles, furniture.',
      columns: [
        { key: 'name', label: 'Name', sortable: true, render: function (row) {
            return '<div class="flex items-center gap-3">' +
                     '<span class="dot" style="background:' + ui.esc(row.color) + '"></span>' +
                     '<span class="cell-primary">' + ui.esc(row.name) + '</span>' +
                   '</div>';
          } },
        { key: 'description', label: 'Description', render: function (row) {
            return row.description
              ? '<span class="cell-muted">' + ui.esc(row.description) + '</span>'
              : '<span class="text-muted">—</span>';
          } },
        { key: 'custom_fields', label: 'Custom fields', render: function (row) {
            var count = (row.custom_fields || []).length;
            return count
              ? '<span class="pill pill-neutral pill-plain">' + count + ' field' +
                (count === 1 ? '' : 's') + '</span>'
              : '<span class="text-muted">—</span>';
          } },
        { key: 'asset_count', label: 'Assets', sortable: false, align: 'right',
          render: function (row) { return fmt.number(row.asset_count || 0); } },
        { key: 'is_active', label: 'State', render: renderState }
      ],
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true,
          placeholder: 'e.g. Laptops' },
        { name: 'description', label: 'Description', type: 'text',
          placeholder: 'Optional short description' },
        { name: 'color', label: 'Colour', type: 'color', required: true, half: true },
        { name: 'icon', label: 'Icon key', type: 'text', half: true,
          placeholder: 'e.g. laptop', hint: 'Used by the asset UI to pick an icon.' },
        { name: 'is_active', label: 'Active', type: 'checkbox', defaultValue: true }
      ]
    },

    locations: {
      label: 'Locations',
      singular: 'Location',
      icon: 'mapPin',
      path: '/locations/',
      searchPlaceholder: 'Search locations…',
      emptyMessage: 'Locations are the sites and rooms where assets physically live.',
      columns: [
        { key: 'name', label: 'Name', sortable: true, render: function (row) {
            return '<span class="cell-primary">' + ui.esc(row.name) + '</span>';
          } },
        { key: 'full_address', label: 'Address', render: function (row) {
            return row.full_address
              ? '<span class="cell-muted">' + ui.esc(row.full_address) + '</span>'
              : '<span class="text-muted">—</span>';
          } },
        { key: 'city', label: 'City', sortable: true, render: function (row) {
            return ui.esc(row.city || '—');
          } },
        { key: 'asset_count', label: 'Assets', align: 'right',
          render: function (row) { return fmt.number(row.asset_count || 0); } },
        { key: 'is_active', label: 'State', render: renderState }
      ],
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true,
          placeholder: 'e.g. Head Office — Mumbai' },
        { name: 'address', label: 'Street address', type: 'text' },
        { name: 'city', label: 'City', type: 'text', half: true },
        { name: 'state', label: 'State', type: 'text', half: true },
        { name: 'postal_code', label: 'Postal code', type: 'text', half: true },
        { name: 'country', label: 'Country', type: 'text', half: true },
        { name: 'is_active', label: 'Active', type: 'checkbox', defaultValue: true }
      ]
    },

    departments: {
      label: 'Departments',
      singular: 'Department',
      icon: 'building',
      path: '/departments/',
      searchPlaceholder: 'Search departments…',
      emptyMessage: 'Departments let you attribute assets and costs to a team.',
      columns: [
        { key: 'name', label: 'Name', sortable: true, render: function (row) {
            return '<span class="cell-primary">' + ui.esc(row.name) + '</span>' +
                   (row.code ? ' <span class="cell-muted">· ' + ui.esc(row.code) + '</span>' : '');
          } },
        { key: 'head_user_name', label: 'Head', render: function (row) {
            if (!row.head_user_name) { return '<span class="text-muted">Unassigned</span>'; }
            return '<div class="flex items-center gap-2">' +
                     '<span class="avatar avatar-sm avatar-ink">' +
                       ui.esc(fmt.initials(row.head_user_name)) +
                     '</span>' +
                     '<span>' + ui.esc(row.head_user_name) + '</span>' +
                   '</div>';
          } },
        { key: 'member_count', label: 'Members', align: 'right',
          render: function (row) { return fmt.number(row.member_count || 0); } },
        { key: 'asset_count', label: 'Assets', align: 'right',
          render: function (row) { return fmt.number(row.asset_count || 0); } },
        { key: 'is_active', label: 'State', render: renderState }
      ],
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true,
          placeholder: 'e.g. Information Technology' },
        { name: 'code', label: 'Code', type: 'text', half: true, placeholder: 'e.g. IT' },
        { name: 'head_user', label: 'Department head', type: 'user', half: true },
        { name: 'description', label: 'Description', type: 'text' },
        { name: 'is_active', label: 'Active', type: 'checkbox', defaultValue: true }
      ]
    },

    vendors: {
      label: 'Vendors',
      singular: 'Vendor',
      icon: 'truck',
      path: '/vendors/',
      searchPlaceholder: 'Search vendors…',
      emptyMessage: 'Vendors are who you buy from and who services your assets.',
      columns: [
        { key: 'name', label: 'Name', sortable: true, render: function (row) {
            return '<span class="cell-primary">' + ui.esc(row.name) + '</span>';
          } },
        { key: 'contact_person', label: 'Contact', render: function (row) {
            if (!row.contact_person && !row.email) {
              return '<span class="text-muted">—</span>';
            }
            return '<span>' + ui.esc(row.contact_person || '—') + '</span>' +
                   (row.email
                     ? '<br><span class="cell-muted">' + ui.esc(row.email) + '</span>'
                     : '');
          } },
        { key: 'phone', label: 'Phone', render: function (row) {
            return ui.esc(row.phone || '—');
          } },
        { key: 'asset_count', label: 'Assets', align: 'right',
          render: function (row) { return fmt.number(row.asset_count || 0); } },
        { key: 'is_active', label: 'State', render: renderState }
      ],
      fields: [
        { name: 'name', label: 'Company name', type: 'text', required: true,
          placeholder: 'e.g. Dell Technologies India' },
        { name: 'contact_person', label: 'Contact person', type: 'text', half: true },
        { name: 'email', label: 'Email', type: 'email', half: true },
        { name: 'phone', label: 'Phone', type: 'text', half: true },
        { name: 'website', label: 'Website', type: 'url', half: true,
          placeholder: 'https://' },
        { name: 'address', label: 'Address', type: 'text' },
        { name: 'city', label: 'City', type: 'text', half: true },
        { name: 'tax_number', label: 'Tax / GST number', type: 'text', half: true },
        { name: 'notes', label: 'Notes', type: 'textarea' },
        { name: 'is_active', label: 'Active', type: 'checkbox', defaultValue: true }
      ]
    }
  };

  function renderState(row) {
    return row.is_active
      ? '<span class="pill pill-success">Active</span>'
      : '<span class="pill pill-neutral">Inactive</span>';
  }

  /* ----------------------------------------------------------------------
     Page state
     ---------------------------------------------------------------------- */
  var state = {
    entity: 'categories',
    page: 1,
    search: '',
    isActive: '',
    ordering: 'name',
    users: null   // lazily fetched for the department-head picker
  };

  function currentEntity() { return ENTITIES[state.entity]; }

  /* ----------------------------------------------------------------------
     Rendering
     ---------------------------------------------------------------------- */
  function renderTabs() {
    var html = Object.keys(ENTITIES).map(function (key) {
      var entity = ENTITIES[key];
      return '<button class="tab' + (key === state.entity ? ' is-active' : '') + '" ' +
                     'data-entity="' + key + '" role="tab" ' +
                     'aria-selected="' + (key === state.entity) + '">' +
               ui.esc(entity.label) +
             '</button>';
    }).join('');
    $('#mastersTabs').html(html);
  }

  function renderHead() {
    var entity = currentEntity();
    var html = entity.columns.map(function (column) {
      var classes = column.sortable ? 'is-sortable' : '';
      if (state.ordering === column.key) { classes += ' is-sorted-asc'; }
      if (state.ordering === '-' + column.key) { classes += ' is-sorted-desc'; }

      return '<th class="' + classes + '"' +
                 (column.align === 'right' ? ' style="text-align:right"' : '') +
                 (column.sortable ? ' data-sort="' + column.key + '"' : '') + '>' +
               ui.esc(column.label) +
               (column.sortable
                 ? '<span class="sort-icon">' + ui.icon('arrowUp', 13) + '</span>'
                 : '') +
             '</th>';
    }).join('');

    // Actions column, only when the signed-in role may write.
    if (session.canWrite()) {
      html += '<th style="text-align:right;width:110px">Actions</th>';
    }
    $('#tableHead').html(html);
    ui.syncSortState('.table');
  }

  function renderRows(results) {
    var entity = currentEntity();
    var columnCount = entity.columns.length + (session.canWrite() ? 1 : 0);

    if (!results.length) {
      var isFiltered = state.search || state.isActive !== '';
      $('#tableBody').html(
        '<tr><td colspan="' + columnCount + '">' +
          ui.emptyState({
            icon: isFiltered ? 'search' : entity.icon,
            title: isFiltered
              ? 'No matches'
              : 'No ' + entity.label.toLowerCase() + ' yet',
            message: isFiltered
              ? 'Try a different search or clear the filters.'
              : entity.emptyMessage,
            actionLabel: (!isFiltered && session.canWrite())
              ? 'Add ' + entity.singular.toLowerCase()
              : null
          }) +
        '</td></tr>'
      );
      return;
    }

    var html = results.map(function (row) {
      var cells = entity.columns.map(function (column) {
        return '<td' + (column.align === 'right' ? ' class="cell-num"' : '') + '>' +
                 column.render(row) +
               '</td>';
      }).join('');

      if (session.canWrite()) {
        cells +=
          '<td>' +
            '<div class="row-actions">' +
              '<button class="btn btn-ghost btn-icon btn-sm" data-act="edit" ' +
                      'data-id="' + row.id + '" title="Edit" aria-label="Edit ' +
                      ui.esc(row.name) + '">' + ui.icon('edit', 16) + '</button>' +
              (session.isAdmin()
                ? '<button class="btn btn-ghost btn-icon btn-sm" data-act="delete" ' +
                          'data-id="' + row.id + '" title="Delete" aria-label="Delete ' +
                          ui.esc(row.name) + '" style="color:var(--color-danger)">' +
                    ui.icon('trash', 16) + '</button>'
                : '') +
            '</div>' +
          '</td>';
      }

      return '<tr data-id="' + row.id + '">' + cells + '</tr>';
    }).join('');

    $('#tableBody').html(html);
  }

  function renderPagination(data) {
    var $bar = $('#paginationBar');
    if (!data.count) { $bar.hide(); return; }

    var from = (data.page - 1) * data.page_size + 1;
    var to = Math.min(data.page * data.page_size, data.count);

    $('#paginationInfo').text(
      'Showing ' + from + '–' + to + ' of ' + fmt.number(data.count)
    );
    $('#paginationControls').html(ui.pagination(data.page, data.total_pages));
    $bar.toggle(data.total_pages > 1);
  }

  /* ----------------------------------------------------------------------
     Data
     ---------------------------------------------------------------------- */
  function load() {
    var entity = currentEntity();
    var columnCount = entity.columns.length + (session.canWrite() ? 1 : 0);

    $('#tableBody').html(ui.skeletonRows(6, columnCount));
    $('#resultCount').text('');

    return T.api.get(entity.path, {
      page: state.page,
      page_size: PAGE_SIZE,
      search: state.search || undefined,
      is_active: state.isActive || undefined,
      ordering: state.ordering
    })
      .then(function (data) {
        renderRows(data.results || []);
        renderPagination(data);
        $('#resultCount').text(
          fmt.number(data.count) + ' ' +
          (data.count === 1 ? entity.singular.toLowerCase() : entity.label.toLowerCase())
        );
      })
      .catch(function (error) {
        ui.apiError(error, 'Could not load ' + entity.label.toLowerCase());
        $('#tableBody').html(
          '<tr><td colspan="' + columnCount + '">' +
            ui.emptyState({
              icon: 'alert',
              title: 'Could not load',
              message: error.message || 'Please try again.'
            }) +
          '</td></tr>'
        );
      });
  }

  /** Users are only needed by the department form — fetch once, then cache. */
  function ensureUsers() {
    if (state.users) { return Promise.resolve(state.users); }
    if (!session.isAdmin()) { return Promise.resolve([]); }

    return T.api.get('/users/', { page_size: 200, ordering: 'full_name' })
      .then(function (data) {
        state.users = data.results || [];
        return state.users;
      })
      .catch(function () { return []; });
  }

  /* ----------------------------------------------------------------------
     Form
     ---------------------------------------------------------------------- */
  function fieldHtml(field, record, users) {
    var value = record ? record[field.name] : field.defaultValue;
    if (value === undefined || value === null) { value = field.type === 'checkbox' ? false : ''; }

    var wrapClass = 'field' + (field.half ? '' : ' field-full');
    var id = 'f_' + field.name;
    var control;

    if (field.type === 'checkbox') {
      return '<div class="' + wrapClass + '">' +
               '<label class="checkbox">' +
                 '<input type="checkbox" id="' + id + '" name="' + field.name + '"' +
                        (value ? ' checked' : '') + '>' +
                 '<span>' + ui.esc(field.label) + '</span>' +
               '</label>' +
               '<div class="field-error"></div>' +
             '</div>';
    }

    if (field.type === 'textarea') {
      control = '<textarea class="textarea" id="' + id + '" name="' + field.name + '" ' +
                          'placeholder="' + ui.esc(field.placeholder || '') + '">' +
                  ui.esc(value) +
                '</textarea>';

    } else if (field.type === 'color') {
      // Native swatch plus a hex box, kept in sync both ways.
      control =
        '<div class="flex gap-2 items-center">' +
          '<input type="color" id="' + id + '_swatch" value="' + ui.esc(value || '#3BB77E') + '" ' +
                 'style="width:44px;height:40px;padding:3px;border:1px solid var(--border-strong);' +
                 'border-radius:var(--radius-sm);background:#fff;cursor:pointer" ' +
                 'aria-label="Pick colour">' +
          '<input class="input mono-tag" type="text" id="' + id + '" name="' + field.name + '" ' +
                 'value="' + ui.esc(value || '#3BB77E') + '" placeholder="#3BB77E" ' +
                 'maxlength="7" style="flex:1">' +
        '</div>';

    } else if (field.type === 'user') {
      var options = ['<option value="">— None —</option>'].concat(
        (users || []).map(function (user) {
          return '<option value="' + user.id + '"' +
                 (String(value) === String(user.id) ? ' selected' : '') + '>' +
                 ui.esc(user.full_name) + '</option>';
        })
      ).join('');
      control = '<select class="select" id="' + id + '" name="' + field.name + '" ' +
                        'data-null-empty="true">' + options + '</select>';

    } else {
      control = '<input class="input" type="' + (field.type || 'text') + '" id="' + id + '" ' +
                       'name="' + field.name + '" value="' + ui.esc(value) + '" ' +
                       'placeholder="' + ui.esc(field.placeholder || '') + '"' +
                       (field.required ? ' required' : '') + '>';
    }

    return '<div class="' + wrapClass + '">' +
             '<label class="label" for="' + id + '">' + ui.esc(field.label) +
               (field.required ? '<span class="req">*</span>' : '') +
             '</label>' +
             control +
             (field.hint ? '<div class="field-hint">' + ui.esc(field.hint) + '</div>' : '') +
             '<div class="field-error"></div>' +
           '</div>';
  }

  function openForm(record) {
    var entity = currentEntity();
    var isEdit = Boolean(record);

    ensureUsers().then(function (users) {
      var body = '<form id="masterForm" novalidate><div class="form-grid">' +
                   entity.fields.map(function (field) {
                     return fieldHtml(field, record, users);
                   }).join('') +
                 '</div></form>';

      var instance = ui.modal({
        title: (isEdit ? 'Edit ' : 'Add ') + entity.singular.toLowerCase(),
        size: 'lg',
        body: body,
        footer:
          '<button class="btn btn-secondary" data-act="cancel">Cancel</button>' +
          '<button class="btn btn-primary" data-act="save">' +
            '<span class="btn-label">' + (isEdit ? 'Save changes' : 'Create') + '</span>' +
          '</button>',
        onOpen: function ($modal, close) {
          var $form = $modal.find('#masterForm');

          // Colour swatch <-> hex text
          $modal.find('[id$="_swatch"]').on('input', function () {
            $(this).siblings('input[type="text"]').val($(this).val().toUpperCase());
          });
          $modal.find('input[name="color"]').on('input', function () {
            var hex = $(this).val();
            if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
              $(this).siblings('input[type="color"]').val(hex);
            }
          });

          $modal.find('[data-act="cancel"]').on('click', close);
          $form.on('submit', function (event) { event.preventDefault(); submit(); });

          $modal.find('[data-act="save"]').on('click', submit);

          function submit() {
            var $save = $modal.find('[data-act="save"]');
            var payload = ui.formToObject($form);

            ui.clearFieldErrors($form);
            ui.setButtonLoading($save, true);

            var request = isEdit
              ? T.api.patch(entity.path + record.id + '/', payload)
              : T.api.post(entity.path, payload);

            request
              .then(function () {
                ui.success(
                  entity.singular + (isEdit ? ' updated' : ' created'),
                  payload.name || ''
                );
                close();
                load();
              })
              .catch(function (error) {
                ui.setButtonLoading($save, false);
                if (!ui.applyFieldErrors($form, error)) {
                  ui.apiError(error, 'Could not save');
                }
              });
          }
        }
      });

      return instance;
    });
  }

  function remove(id, name) {
    var entity = currentEntity();

    ui.confirm({
      title: 'Delete this ' + entity.singular.toLowerCase() + '?',
      message: '"' + name + '" will be removed. Records still referencing it ' +
               'will block the delete, so nothing is silently orphaned.',
      confirmLabel: 'Delete'
    }).then(function (confirmed) {
      if (!confirmed) { return; }

      T.api.del(entity.path + id + '/')
        .then(function () {
          ui.success(entity.singular + ' deleted', name);
          load();
        })
        .catch(function (error) {
          // A protected FK comes back as 409 — explain rather than just failing.
          if (error.status === 409) {
            ui.error('Still in use',
                     'Reassign or remove the records that reference "' + name +
                     '" before deleting it.');
            return;
          }
          ui.apiError(error, 'Could not delete');
        });
    });
  }

  function switchEntity(key) {
    state.entity = key;
    state.page = 1;
    state.search = '';
    state.isActive = '';
    state.ordering = 'name';

    var entity = currentEntity();
    $('#searchInput').val('').attr('placeholder', entity.searchPlaceholder);
    $('#activeFilter').val('');
    $('#addBtn .btn-label').text('Add ' + entity.singular.toLowerCase());

    renderTabs();
    renderHead();
    load();
  }

  /* ----------------------------------------------------------------------
     Wire-up
     ---------------------------------------------------------------------- */
  $(function () {
    T.shell.render('masters');
    $('#searchIcon').html(ui.icon('search', 17));
    $('#addBtn').prepend(ui.icon('plus', 17));

    T.auth.requireAuth()
      .then(function () {
        // Auditors and employees read; only managers get the write controls.
        if (!session.canWrite()) { $('#addBtn').remove(); }

        renderTabs();
        renderHead();
        $('#searchInput').attr('placeholder', currentEntity().searchPlaceholder);
        $('#addBtn .btn-label').text('Add ' + currentEntity().singular.toLowerCase());

        return load();
      })
      .then(function () { T.shell.ready(); })
      .catch(function () { T.shell.ready(); });

    $('#mastersTabs').on('click', '.tab', function () {
      switchEntity($(this).data('entity'));
    });

    $('#searchInput').on('input', ui.debounce(function () {
      state.search = $(this).val().trim();
      state.page = 1;
      load();
    }, 350));

    $('#activeFilter').on('change', function () {
      state.isActive = $(this).val();
      state.page = 1;
      load();
    });

    $('#tableHead').on('click', 'th.is-sortable', function () {
      var key = $(this).data('sort');
      state.ordering = state.ordering === key ? '-' + key : key;
      state.page = 1;
      renderHead();
      load();
    });

    $('#paginationControls').on('click', '.page-btn', function () {
      var page = parseInt($(this).data('page'), 10);
      if (!page || page === state.page) { return; }
      state.page = page;
      load();
      $('html, body').animate({ scrollTop: 0 }, 200);
    });

    $('#addBtn').on('click', function () { openForm(null); });

    $('#tableBody').on('click', '[data-empty-action]', function () { openForm(null); });

    $('#tableBody').on('click', '[data-act="edit"]', function () {
      var id = $(this).data('id');
      T.api.get(currentEntity().path + id + '/')
        .then(openForm)
        .catch(function (error) { ui.apiError(error, 'Could not open the record'); });
    });

    $('#tableBody').on('click', '[data-act="delete"]', function () {
      var $row = $(this).closest('tr');
      remove($(this).data('id'), $row.find('.cell-primary').first().text());
    });
  });

}(window.Trasset, window.jQuery));
