/* ==========================================================================
   Trasset — app shell
   Renders the Ink sidebar and top bar on every authenticated page, so the
   chrome is defined once (SRS §6.1, §7.3).
   ========================================================================== */

window.Trasset = window.Trasset || {};

(function (T, $) {
  'use strict';

  var ui = T.ui;

  /**
   * Navigation model.
   * `ready: false` renders the item greyed out with a "soon" badge — the IA
   * stays honest about what exists without pretending the screen is there.
   * `roles` limits visibility; omit it to show the item to everyone.
   */
  var NAV = [
    { section: 'Overview', key: 'nav.overview' },
    { id: 'dashboard', label: 'Dashboard', key: 'nav.dashboard', icon: 'dashboard',
      href: 'dashboard.html', ready: true },

    { section: 'Manage', key: 'nav.manage' },
    { id: 'assets', label: 'Assets', key: 'nav.assets', icon: 'box',
      href: 'assets.html', ready: true },
    { id: 'requests', label: 'Requests', key: 'nav.requests', icon: 'inbox',
      href: 'requests.html', ready: true },
    { id: 'maintenance', label: 'Maintenance', key: 'nav.maintenance', icon: 'wrench',
      href: 'maintenance.html', ready: true },
    { id: 'procurement', label: 'Procurement', key: 'nav.procurement', icon: 'cart',
      href: 'procurement.html', ready: true },
    { id: 'reports', label: 'Reports', key: 'nav.reports', icon: 'chart',
      href: 'reports.html', ready: true },

    { section: 'Administration', key: 'nav.administration' },
    { id: 'masters', label: 'Master Data', key: 'nav.masters', icon: 'layers',
      href: 'masters.html', ready: true },
    { id: 'users', label: 'Users', key: 'nav.users', icon: 'users',
      href: 'users.html', ready: true, roles: ['super_admin'] },
    { id: 'audit', label: 'Audit Log', key: 'nav.audit', icon: 'shield',
      href: 'audit.html', ready: true, roles: ['super_admin', 'auditor'] },
    { id: 'settings', label: 'Settings', key: 'nav.settings', icon: 'settings',
      href: 'settings.html', ready: true }
  ];

  /** Short-hand for a translated string with the English as fallback. */
  function t(key, fallback) {
    return T.i18n ? T.i18n.t(key, fallback) : fallback;
  }

  //: Guards against binding the notification polling twice on a re-render.
  var notificationsBound = false;
  var currentNav = null;

  function brandMark(size) {
    var s = size || 34;
    // Rounded-square mark echoing the brand card's app icon.
    return '<span class="brand-mark" style="width:' + s + 'px;height:' + s + 'px">' +
             '<svg width="' + Math.round(s * 0.56) + '" height="' + Math.round(s * 0.56) + '" ' +
                  'viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" ' +
                  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
               '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>' +
             '</svg>' +
           '</span>';
  }

  function wordmark() {
    return '<span class="brand-text">Tr<span class="brand-accent">asset</span></span>';
  }

  function navHtml(activeId, role) {
    var html = '';

    NAV.forEach(function (item) {
      if (item.section) {
        html += '<div class="nav-section">' +
                  ui.esc(t(item.key, item.section)) +
                '</div>';
        return;
      }
      if (item.roles && item.roles.indexOf(role) === -1) { return; }

      var classes = 'nav-item';
      if (item.id === activeId) { classes += ' is-active'; }
      if (!item.ready) { classes += ' is-soon'; }

      html +=
        '<a class="' + classes + '" href="' + (item.ready ? item.href : '#') + '"' +
           (item.ready ? '' : ' tabindex="-1" aria-disabled="true"') +
           (item.id === activeId ? ' aria-current="page"' : '') + '>' +
          ui.icon(item.icon, 19) +
          '<span class="nav-label">' + ui.esc(t(item.key, item.label)) + '</span>' +
          (item.ready
            ? ''
            : '<span class="badge badge-soon">' + ui.esc(t('nav.soon', 'soon')) + '</span>') +
        '</a>';
    });

    return html;
  }

  function sidebarHtml(activeId, user) {
    var role = user ? user.role_name : null;
    var roleLabel = t('role.' + role,
      (user && user.role && user.role.label) || ui.fmt.title(role || ''));

    return '' +
      '<aside class="sidebar" id="sidebar">' +
        '<a class="sidebar-brand" href="dashboard.html">' +
          brandMark(34) + wordmark() +
        '</a>' +
        '<nav class="sidebar-nav" aria-label="Main navigation">' +
          navHtml(activeId, role) +
        '</nav>' +
        '<div class="sidebar-footer">' +
          '<a class="sidebar-user" href="settings.html">' +
            '<span class="avatar avatar-sm">' +
              ui.esc(user ? (user.initials || ui.fmt.initials(user.full_name)) : '?') +
            '</span>' +
            // title attributes so a truncated name is still readable on hover.
            '<span class="sidebar-user-info">' +
              '<span class="sidebar-user-name" title="' +
                ui.esc(user ? user.full_name : '') + '">' +
                ui.esc(user ? user.full_name : '—') +
              '</span>' +
              '<span class="sidebar-user-role" title="' + ui.esc(roleLabel) + '">' +
                ui.esc(roleLabel) +
              '</span>' +
            '</span>' +
          '</a>' +
        '</div>' +
      '</aside>' +
      '<div class="sidebar-scrim" id="sidebarScrim"></div>';
  }

  function topbarHtml(user) {
    var initials = user ? (user.initials || ui.fmt.initials(user.full_name)) : '?';

    return '' +
      '<header class="topbar">' +
        '<button class="icon-btn topbar-toggle" id="sidebarToggle" ' +
                'aria-label="' + ui.esc(t('topbar.openNav', 'Open navigation')) + '">' +
          ui.icon('menu', 21) +
        '</button>' +

        '<div class="global-search">' +
          '<span class="global-search-icon">' + ui.icon('search', 17) + '</span>' +
          '<label class="sr-only" for="globalSearch">' +
            ui.esc(t('topbar.search', 'Search assets by tag, name or serial')) +
          '</label>' +
          '<input class="input" id="globalSearch" type="search" autocomplete="off" ' +
                 'placeholder="' +
                 ui.esc(t('topbar.search', 'Search assets by tag, name or serial…')) + '">' +
          '<span class="search-kbd">/</span>' +
        '</div>' +

        '<div class="topbar-actions">' +
          // Available on every screen, not buried in settings — someone who
          // cannot read the UI cannot navigate to a page to fix that.
          '<span id="langMount"></span>' +
          '<div class="dropdown" id="notifDropdown">' +
            '<button class="icon-btn" id="notifBtn" aria-label="Notifications" ' +
                    'aria-haspopup="true" aria-expanded="false">' +
              ui.icon('bell', 20) +
            '</button>' +
            '<div class="dropdown-menu" id="notifMenu" role="menu" ' +
                 'style="width:380px;max-width:calc(100vw - 32px)">' +
              '<div class="dropdown-header flex justify-between items-center">' +
                '<span>' + ui.esc(t('topbar.notifications', 'Notifications')) + '</span>' +
                '<button class="btn-link text-tiny" id="markAllReadBtn" ' +
                        'style="display:none">' +
                  ui.esc(t('topbar.markAllRead', 'Mark all read')) +
                '</button>' +
              '</div>' +
              '<div id="notifList" style="max-height:380px;overflow-y:auto"></div>' +
            '</div>' +
          '</div>' +

          '<div class="dropdown" id="profileDropdown">' +
            '<button class="topbar-profile" id="profileBtn" aria-haspopup="true" aria-expanded="false">' +
              '<span class="avatar avatar-sm" id="topbarAvatar">' + ui.esc(initials) + '</span>' +
              '<span class="topbar-profile-name" id="topbarName">' +
                ui.esc(user ? user.full_name : '—') +
              '</span>' +
              ui.icon('chevronDown', 15) +
            '</button>' +
            '<div class="dropdown-menu" id="profileMenu" role="menu">' +
              '<div class="dropdown-header" id="profileMenuEmail">' +
                ui.esc(user ? user.email : '') +
              '</div>' +
              '<a class="dropdown-item" href="settings.html" role="menuitem">' +
                ui.icon('user', 17) +
                '<span>' + ui.esc(t('topbar.myProfile', 'My profile')) + '</span>' +
              '</a>' +
              '<a class="dropdown-item" href="settings.html#password" role="menuitem">' +
                ui.icon('lock', 17) +
                '<span>' + ui.esc(t('topbar.changePassword', 'Change password')) + '</span>' +
              '</a>' +
              '<div class="dropdown-divider"></div>' +
              '<button class="dropdown-item is-danger" id="logoutBtn" role="menuitem">' +
                ui.icon('logout', 17) +
                '<span>' + ui.esc(t('topbar.signOut', 'Sign out')) + '</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</header>';
  }

  function bindDropdown($trigger, $menu) {
    $trigger.on('click', function (event) {
      event.stopPropagation();
      var willOpen = !$menu.hasClass('is-open');
      $('.dropdown-menu').removeClass('is-open');
      $('[aria-haspopup="true"]').attr('aria-expanded', 'false');
      $menu.toggleClass('is-open', willOpen);
      $trigger.attr('aria-expanded', String(willOpen));
    });
  }

  function bindShell() {
    var $sidebar = $('#sidebar');
    var $scrim = $('#sidebarScrim');

    function closeSidebar() {
      $sidebar.removeClass('is-open');
      $scrim.removeClass('is-open');
    }

    $('#sidebarToggle').on('click', function () {
      $sidebar.toggleClass('is-open');
      $scrim.toggleClass('is-open', $sidebar.hasClass('is-open'));
    });
    $scrim.on('click', closeSidebar);

    bindDropdown($('#profileBtn'), $('#profileMenu'));
    bindDropdown($('#notifBtn'), $('#notifMenu'));

    $(document).on('click', function () {
      $('.dropdown-menu').removeClass('is-open');
      $('[aria-haspopup="true"]').attr('aria-expanded', 'false');
    });
    $('.dropdown-menu').on('click', function (event) { event.stopPropagation(); });

    $('#logoutBtn').on('click', function () {
      T.auth.logout();
    });

    // "/" focuses global search, Escape closes the mobile drawer.
    $(document).on('keydown', function (event) {
      var tag = (event.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select';

      if (event.key === '/' && !typing) {
        event.preventDefault();
        $('#globalSearch').focus();
      }
      if (event.key === 'Escape') { closeSidebar(); }
    });

    // Global search hands off to the asset list, which owns the filtering UI.
    $('#globalSearch').on('keydown', function (event) {
      if (event.key !== 'Enter') { return; }
      var term = $(this).val().trim();
      if (!term) { return; }
      window.location.href = 'assets.html?q=' + encodeURIComponent(term);
    });
  }

  /* ------------------------------------------------------------------------
     Notifications (FR-12.1)
     ---------------------------------------------------------------------- */
  function renderBadge(unread) {
    var $bell = $('#notifBtn');
    $bell.find('.badge-count').remove();

    if (unread > 0) {
      $bell.append('<span class="badge-count">' +
                     (unread > 99 ? '99+' : unread) + '</span>');
      $bell.attr('aria-label',
        unread + ' ' + t('topbar.unread', 'unread notifications'));
    } else {
      $bell.attr('aria-label', t('topbar.notifications', 'Notifications'));
    }
    $('#markAllReadBtn').toggle(unread > 0);
  }

  function refreshCount() {
    return T.api.get('/notifications/count/')
      .then(function (data) { renderBadge(data.unread); return data; })
      .catch(function () { /* the badge is not worth a toast */ });
  }

  function renderNotifications(rows) {
    if (!rows.length) {
      $('#notifList').html(
        '<div class="empty-state" style="padding:28px 16px">' +
          '<div class="empty-state-icon">' + ui.icon('bell', 22) + '</div>' +
          '<p class="text-small" style="margin:0">' +
            ui.esc(t('topbar.noNotifications',
              'Nothing new. You will hear about assignments, requests and ' +
              'maintenance here.')) +
          '</p>' +
        '</div>'
      );
      return;
    }

    $('#notifList').html(rows.map(function (row) {
      return '<a class="dropdown-item" href="' + ui.esc(row.link || '#') + '" ' +
                'data-notif="' + row.id + '" ' +
                'style="align-items:flex-start;' +
                (row.is_read ? '' : 'background:var(--primary-soft)') + '">' +
        '<span style="color:' + ui.esc(row.color) + ';margin-top:2px;flex-shrink:0">' +
          ui.icon(row.icon, 17) +
        '</span>' +
        '<span style="min-width:0">' +
          '<span class="fw-500" style="display:block">' + ui.esc(row.title) + '</span>' +
          (row.message
            ? '<span class="text-small text-muted" style="display:block">' +
                ui.esc(row.message.length > 90
                  ? row.message.slice(0, 90) + '…' : row.message) +
              '</span>'
            : '') +
          '<span class="text-tiny text-muted">' +
            ui.esc(ui.fmt.relative(row.created_at)) +
          '</span>' +
        '</span>' +
      '</a>';
    }).join(''));
  }

  function loadNotifications() {
    $('#notifList').html(
      '<div style="padding:16px">' +
        '<div class="skeleton skeleton-text w-75 mb-3"></div>' +
        '<div class="skeleton skeleton-text w-60"></div>' +
      '</div>'
    );

    return T.api.get('/notifications/', { page_size: 10 })
      .then(function (data) { renderNotifications(data.results || []); })
      .catch(function () {
        $('#notifList').html(
          '<div class="empty-state" style="padding:24px 16px">' +
            '<p class="text-small" style="margin:0">Could not load notifications.</p>' +
          '</div>'
        );
      });
  }

  function bindNotifications() {
    // Load on open rather than on page load — the badge count is enough until
    // someone actually looks.
    $('#notifBtn').on('click', function () {
      if ($('#notifMenu').hasClass('is-open')) { loadNotifications(); }
    });

    $('#markAllReadBtn').on('click', function (event) {
      event.preventDefault();
      event.stopPropagation();

      T.api.post('/notifications/read-all/', {})
        .then(function () {
          renderBadge(0);
          loadNotifications();
        })
        .catch(function (error) { ui.apiError(error, 'Could not mark them read'); });
    });

    // Follow the link, but mark it read on the way out.
    $('#notifList').on('click', '[data-notif]', function () {
      var id = $(this).data('notif');
      T.api.post('/notifications/' + id + '/read/', {}).then(refreshCount);
    });

    refreshCount();
    // Poll gently. Not websockets — this is a five-minute-old-news problem.
    setInterval(refreshCount, 60000);
  }

  /** Repaint the parts of the chrome that depend on the profile. */
  function applyUser(user) {
    if (!user) { return; }
    var initials = user.initials || ui.fmt.initials(user.full_name);
    var roleLabel = t('role.' + user.role_name,
      (user.role && user.role.label) || ui.fmt.title(user.role_name));

    $('#topbarAvatar').text(initials);
    $('#topbarName').text(user.full_name).attr('title', user.full_name);
    $('#profileMenuEmail').text(user.email);
    $('.sidebar-user-name').text(user.full_name).attr('title', user.full_name);
    $('.sidebar-user-role').text(roleLabel).attr('title', roleLabel);
    $('.sidebar-user .avatar').text(initials);
  }

  /**
   * Repaint the chrome in the current language.
   *
   * The topbar is patched in place rather than re-rendered: rebuilding it
   * would drop the dropdown handlers, the notification poll and the unread
   * badge. The nav is only links, so replacing it wholesale is safe.
   */
  function retranslate() {
    var user = T.api.profile.get();

    $('.sidebar-nav').html(navHtml(currentNav, user ? user.role_name : null));

    $('label[for="globalSearch"]')
      .text(t('topbar.search', 'Search assets by tag, name or serial'));
    $('#globalSearch')
      .attr('placeholder', t('topbar.search',
        'Search assets by tag, name or serial…'));
    $('#sidebarToggle').attr('aria-label', t('topbar.openNav', 'Open navigation'));

    $('#notifMenu .dropdown-header > span')
      .text(t('topbar.notifications', 'Notifications'));
    $('#markAllReadBtn').text(t('topbar.markAllRead', 'Mark all read'));
    $('#profileMenu [href="settings.html"] span')
      .text(t('topbar.myProfile', 'My profile'));
    $('#profileMenu [href="settings.html#password"] span')
      .text(t('topbar.changePassword', 'Change password'));
    $('#logoutBtn span').text(t('topbar.signOut', 'Sign out'));

    applyUser(user);
  }

  /**
   * Render the shell into the page.
   * @param {string} activeId nav id to highlight
   */
  function render(activeId) {
    var user = T.api.profile.get();
    var $app = $('#app');

    currentNav = activeId;

    $app.prepend(sidebarHtml(activeId, user));
    $app.find('.main').prepend(topbarHtml(user));

    bindShell();

    if (T.i18n) {
      T.i18n.mount('#langMount');
      // Page-level scripts translate their own content on the same event.
      $(document).on('trasset:lang', retranslate);
    }

    // Wait for the session before asking for notifications, or the first call
    // races the token refresh on a page load.
    $(document).on('trasset:user', function (event, freshUser) {
      applyUser(freshUser);
      if (!notificationsBound) {
        notificationsBound = true;
        bindNotifications();
      }
    });
  }

  /** Hide the boot overlay once the page has its data. */
  function ready() {
    $('#boot').fadeOut(160, function () { $(this).remove(); });
  }

  T.shell = {
    render: render,
    ready: ready,
    applyUser: applyUser,
    brandMark: brandMark,
    wordmark: wordmark,
    NAV: NAV
  };

}(window.Trasset, window.jQuery));
