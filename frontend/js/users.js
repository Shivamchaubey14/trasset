/* ==========================================================================
   Trasset — User administration (FR-2.1 – FR-2.3)
   Super Admin only; the API enforces that independently (SEC-3).
   ========================================================================== */

(function (T, $) {
  'use strict';

  var ui = T.ui;
  var fmt = ui.fmt;
  var session = T.auth.session;

  var PAGE_SIZE = 15;

  var ROLE_STYLE = {
    super_admin:     { color: 'var(--color-danger)', soft: 'var(--danger-soft)', icon: 'shield' },
    asset_manager:   { color: 'var(--color-primary)', soft: 'var(--primary-soft)', icon: 'box' },
    department_head: { color: 'var(--color-ink)', soft: 'var(--ink-soft)', icon: 'building' },
    employee:        { color: 'var(--color-muted)', soft: '#EEF1F4', icon: 'user' },
    auditor:         { color: '#9a6c00', soft: 'var(--accent-soft)', icon: 'eye' }
  };

  var state = {
    page: 1,
    search: '',
    role: '',
    isActive: '',
    ordering: 'full_name',
    roles: [],
    departments: []
  };

  /* ----------------------------------------------------------------------
     Reference data
     ---------------------------------------------------------------------- */
  function loadReferenceData() {
    return Promise.all([
      T.api.get('/roles/'),
      T.api.get('/departments/', { page_size: 200, ordering: 'name' })
        .catch(function () { return { results: [] }; })
    ]).then(function (results) {
      // /roles/ has pagination disabled, so it comes back as a plain array.
      state.roles = $.isArray(results[0]) ? results[0] : (results[0].results || []);
      state.departments = results[1].results || [];

      $('#roleFilter').append(state.roles.map(function (role) {
        return '<option value="' + role.id + '">' + ui.esc(role.label) + '</option>';
      }).join(''));
    });
  }

  /* ----------------------------------------------------------------------
     Role summary tiles
     ---------------------------------------------------------------------- */
  function renderRoleTiles(counts) {
    var html = state.roles.map(function (role) {
      var style = ROLE_STYLE[role.name] || ROLE_STYLE.employee;
      return '' +
        '<div class="kpi" style="--kpi-accent:' + style.color + ';--kpi-soft:' + style.soft + '">' +
          '<div class="kpi-top">' +
            '<span class="kpi-label">' + ui.esc(role.label) + '</span>' +
            '<span class="kpi-icon">' + ui.icon(style.icon, 18) + '</span>' +
          '</div>' +
          '<div class="kpi-value">' + fmt.number(counts[role.id] || 0) + '</div>' +
          '<div class="kpi-meta">' + ui.esc(role.description || '') + '</div>' +
        '</div>';
    }).join('');
    $('#roleGrid').html(html);
  }

  /**
   * Count users per role. The list endpoint is paginated, so ask for a single
   * page per role and read `count` — cheaper than pulling every record.
   */
  function loadRoleCounts() {
    return Promise.all(state.roles.map(function (role) {
      return T.api.get('/users/', { role: role.id, page_size: 1 })
        .then(function (data) { return { id: role.id, count: data.count }; })
        .catch(function () { return { id: role.id, count: 0 }; });
    })).then(function (rows) {
      var counts = {};
      rows.forEach(function (row) { counts[row.id] = row.count; });
      renderRoleTiles(counts);
    });
  }

  /* ----------------------------------------------------------------------
     Table
     ---------------------------------------------------------------------- */
  function renderRows(results) {
    if (!results.length) {
      var isFiltered = state.search || state.role || state.isActive !== '';
      $('#tableBody').html(
        '<tr><td colspan="6">' + ui.emptyState({
          icon: isFiltered ? 'search' : 'users',
          title: isFiltered ? 'No matches' : 'No users yet',
          message: isFiltered
            ? 'Try a different search or clear the filters.'
            : 'Add your colleagues so they can sign in to Trasset.',
          actionLabel: isFiltered ? null : 'Add user'
        }) + '</td></tr>'
      );
      return;
    }

    var currentUserId = session.user ? session.user.id : null;

    $('#tableBody').html(results.map(function (user) {
      var style = ROLE_STYLE[user.role_name] || ROLE_STYLE.employee;
      var isSelf = user.id === currentUserId;

      return '<tr data-id="' + user.id + '">' +
        '<td>' +
          '<div class="flex items-center gap-3">' +
            '<span class="avatar" style="background:' + style.color + '">' +
              ui.esc(user.initials || fmt.initials(user.full_name)) +
            '</span>' +
            '<span>' +
              '<span class="cell-primary">' + ui.esc(user.full_name) + '</span>' +
              (isSelf ? ' <span class="pill pill-neutral pill-plain text-tiny">You</span>' : '') +
              '<br><span class="cell-muted">' + ui.esc(user.email) + '</span>' +
            '</span>' +
          '</div>' +
        '</td>' +
        '<td>' +
          '<span class="pill pill-plain" style="background:' + style.soft +
                ';color:' + style.color + '">' +
            ui.esc(user.role ? user.role.label : '—') +
          '</span>' +
        '</td>' +
        '<td>' + (user.department_name
                    ? ui.esc(user.department_name)
                    : '<span class="text-muted">—</span>') + '</td>' +
        '<td class="text-small">' +
          (user.last_login
            ? '<span title="' + ui.esc(fmt.dateTime(user.last_login)) + '">' +
                ui.esc(fmt.relative(user.last_login)) + '</span>'
            : '<span class="text-muted">Never</span>') +
        '</td>' +
        '<td>' + (user.is_active
                    ? '<span class="pill pill-success">Active</span>'
                    : '<span class="pill pill-neutral">Deactivated</span>') + '</td>' +
        '<td>' +
          '<div class="row-actions">' +
            '<button class="btn btn-ghost btn-icon btn-sm" data-act="edit" data-id="' +
                    user.id + '" title="Edit" aria-label="Edit ' + ui.esc(user.full_name) + '">' +
              ui.icon('edit', 16) + '</button>' +
            (user.is_active
              ? (isSelf
                  ? ''
                  : '<button class="btn btn-ghost btn-icon btn-sm" data-act="deactivate" ' +
                            'data-id="' + user.id + '" title="Deactivate" ' +
                            'style="color:var(--color-danger)">' +
                      ui.icon('trash', 16) + '</button>')
              : '<button class="btn btn-ghost btn-icon btn-sm" data-act="activate" ' +
                        'data-id="' + user.id + '" title="Reactivate" ' +
                        'style="color:var(--color-primary)">' +
                  ui.icon('check', 16) + '</button>') +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join(''));
  }

  function load() {
    $('#tableBody').html(ui.skeletonRows(6, 6));

    return T.api.get('/users/', {
      page: state.page,
      page_size: PAGE_SIZE,
      search: state.search || undefined,
      role: state.role || undefined,
      is_active: state.isActive || undefined,
      ordering: state.ordering
    })
      .then(function (data) {
        renderRows(data.results || []);

        var $bar = $('#paginationBar');
        if (data.count) {
          var from = (data.page - 1) * data.page_size + 1;
          var to = Math.min(data.page * data.page_size, data.count);
          $('#paginationInfo').text('Showing ' + from + '–' + to + ' of ' + fmt.number(data.count));
          $('#paginationControls').html(ui.pagination(data.page, data.total_pages));
          $bar.toggle(data.total_pages > 1);
        } else {
          $bar.hide();
        }

        $('#resultCount').text(
          fmt.number(data.count) + ' user' + (data.count === 1 ? '' : 's')
        );
      })
      .catch(function (error) {
        ui.apiError(error, 'Could not load users');
        $('#tableBody').html(
          '<tr><td colspan="6">' + ui.emptyState({
            icon: 'alert',
            title: 'Could not load users',
            message: error.message || 'Please try again.'
          }) + '</td></tr>'
        );
      });
  }

  /* ----------------------------------------------------------------------
     Create / edit
     ---------------------------------------------------------------------- */
  function openForm(user) {
    var isEdit = Boolean(user);

    var roleOptions = state.roles.map(function (role) {
      var selected = user && user.role && user.role.id === role.id;
      return '<option value="' + role.id + '"' + (selected ? ' selected' : '') + '>' +
               ui.esc(role.label) + '</option>';
    }).join('');

    var departmentOptions = ['<option value="">— None —</option>'].concat(
      state.departments.map(function (department) {
        var selected = user && String(user.department) === String(department.id);
        return '<option value="' + department.id + '"' + (selected ? ' selected' : '') + '>' +
                 ui.esc(department.name) + '</option>';
      })
    ).join('');

    var body =
      '<form id="userForm" novalidate><div class="form-grid">' +
        '<div class="field field-full">' +
          '<label class="label" for="f_full_name">Full name<span class="req">*</span></label>' +
          '<input class="input" id="f_full_name" name="full_name" type="text" ' +
                 'value="' + ui.esc(user ? user.full_name : '') + '" ' +
                 'placeholder="e.g. Rohan Mehta" required>' +
          '<div class="field-error"></div>' +
        '</div>' +

        '<div class="field">' +
          '<label class="label" for="f_email">Email<span class="req">*</span></label>' +
          '<input class="input" id="f_email" name="email" type="email" ' +
                 'value="' + ui.esc(user ? user.email : '') + '" ' +
                 'placeholder="name@company.com" required>' +
          '<div class="field-error"></div>' +
        '</div>' +

        '<div class="field">' +
          '<label class="label" for="f_phone">Phone</label>' +
          '<input class="input" id="f_phone" name="phone" type="text" ' +
                 'value="' + ui.esc(user ? user.phone : '') + '" placeholder="+91 …">' +
          '<div class="field-error"></div>' +
        '</div>' +

        '<div class="field">' +
          '<label class="label" for="f_role_id">Role<span class="req">*</span></label>' +
          '<select class="select" id="f_role_id" name="role_id" required>' + roleOptions + '</select>' +
          '<div class="field-hint">Decides what this person can see and change.</div>' +
          '<div class="field-error"></div>' +
        '</div>' +

        '<div class="field">' +
          '<label class="label" for="f_department">Department</label>' +
          '<select class="select" id="f_department" name="department" data-null-empty="true">' +
            departmentOptions +
          '</select>' +
          '<div class="field-error"></div>' +
        '</div>' +

        '<div class="field field-full">' +
          '<label class="label" for="f_password">' +
            (isEdit ? 'New password' : 'Password') +
            (isEdit ? '' : '<span class="req">*</span>') +
          '</label>' +
          '<input class="input" id="f_password" name="password" type="password" ' +
                 'autocomplete="new-password" placeholder="' +
                 (isEdit ? 'Leave blank to keep the current password' : 'At least 8 characters') +
                 '"' + (isEdit ? '' : ' required') + '>' +
          '<div class="field-error"></div>' +
        '</div>' +

        '<div class="field field-full">' +
          '<label class="checkbox">' +
            '<input type="checkbox" id="f_is_active" name="is_active"' +
                   (!user || user.is_active ? ' checked' : '') + '>' +
            '<span>Active — can sign in</span>' +
          '</label>' +
        '</div>' +
      '</div></form>';

    ui.modal({
      title: isEdit ? 'Edit user' : 'Add user',
      size: 'lg',
      body: body,
      footer:
        '<button class="btn btn-secondary" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-primary" data-act="save">' +
          '<span class="btn-label">' + (isEdit ? 'Save changes' : 'Create user') + '</span>' +
        '</button>',
      onOpen: function ($modal, close) {
        var $form = $modal.find('#userForm');

        $modal.find('[data-act="cancel"]').on('click', close);
        $form.on('submit', function (event) { event.preventDefault(); submit(); });
        $modal.find('[data-act="save"]').on('click', submit);

        function submit() {
          var $save = $modal.find('[data-act="save"]');
          var payload = ui.formToObject($form);

          // An empty password field on edit means "leave it alone".
          if (isEdit && !payload.password) { delete payload.password; }

          ui.clearFieldErrors($form);
          ui.setButtonLoading($save, true);

          var request = isEdit
            ? T.api.patch('/users/' + user.id + '/', payload)
            : T.api.post('/users/', payload);

          request
            .then(function () {
              ui.success(isEdit ? 'User updated' : 'User created', payload.full_name);
              close();
              load();
              loadRoleCounts();
            })
            .catch(function (error) {
              ui.setButtonLoading($save, false);
              if (!ui.applyFieldErrors($form, error)) {
                ui.apiError(error, 'Could not save the user');
              }
            });
        }
      }
    });
  }

  function deactivate(id, name) {
    ui.confirm({
      title: 'Deactivate ' + name + '?',
      message: 'They will lose access immediately. The account is kept, along ' +
               'with their assignment history, and you can reactivate it later.',
      confirmLabel: 'Deactivate'
    }).then(function (confirmed) {
      if (!confirmed) { return; }

      T.api.del('/users/' + id + '/')
        .then(function () {
          ui.success('User deactivated', name);
          load();
        })
        .catch(function (error) { ui.apiError(error, 'Could not deactivate'); });
    });
  }

  function activate(id, name) {
    T.api.post('/users/' + id + '/activate/', {})
      .then(function () {
        ui.success('User reactivated', name);
        load();
      })
      .catch(function (error) { ui.apiError(error, 'Could not reactivate'); });
  }

  /* ----------------------------------------------------------------------
     Wire-up
     ---------------------------------------------------------------------- */
  $(function () {
    T.shell.render('users');
    $('#searchIcon').html(ui.icon('search', 17));
    $('#addBtn').prepend(ui.icon('plus', 17));

    T.auth.requireAuth()
      .then(function () {
        if (!session.isAdmin()) {
          // The API would refuse anyway; say so plainly instead of a bare 403.
          $('#main').html(
            '<div class="card"><div class="card-body">' +
              ui.emptyState({
                icon: 'lock',
                title: 'Super Admin only',
                message: 'User administration is restricted to Super Admins. ' +
                         'Ask an administrator if you need access.'
              }) +
            '</div></div>'
          );
          throw new Error('forbidden');
        }
        return loadReferenceData();
      })
      .then(function () {
        return Promise.all([load(), loadRoleCounts()]);
      })
      .then(function () { T.shell.ready(); })
      .catch(function () { T.shell.ready(); });

    $('#searchInput').on('input', ui.debounce(function () {
      state.search = $(this).val().trim();
      state.page = 1;
      load();
    }, 350));

    $('#roleFilter').on('change', function () {
      state.role = $(this).val();
      state.page = 1;
      load();
    });

    $('#activeFilter').on('change', function () {
      state.isActive = $(this).val();
      state.page = 1;
      load();
    });

    $('.table thead').on('click', 'th.is-sortable', function () {
      var key = $(this).data('sort');
      state.ordering = state.ordering === key ? '-' + key : key;
      state.page = 1;
      $('.table thead th').removeClass('is-sorted-asc is-sorted-desc');
      $(this).addClass(state.ordering.charAt(0) === '-' ? 'is-sorted-desc' : 'is-sorted-asc');
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
      T.api.get('/users/' + $(this).data('id') + '/')
        .then(openForm)
        .catch(function (error) { ui.apiError(error, 'Could not open the user'); });
    });

    $('#tableBody').on('click', '[data-act="deactivate"]', function () {
      var $row = $(this).closest('tr');
      deactivate($(this).data('id'), $row.find('.cell-primary').first().text());
    });

    $('#tableBody').on('click', '[data-act="activate"]', function () {
      var $row = $(this).closest('tr');
      activate($(this).data('id'), $row.find('.cell-primary').first().text());
    });
  });

}(window.Trasset, window.jQuery));
