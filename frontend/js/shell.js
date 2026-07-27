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
    { section: 'Overview' },
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: 'dashboard.html', ready: true },

    { section: 'Manage' },
    { id: 'assets', label: 'Assets', icon: 'box', href: 'assets.html', ready: false },
    { id: 'maintenance', label: 'Maintenance', icon: 'wrench', href: 'maintenance.html', ready: false },
    { id: 'procurement', label: 'Procurement', icon: 'cart', href: 'procurement.html', ready: false },
    { id: 'reports', label: 'Reports', icon: 'chart', href: 'reports.html', ready: false },

    { section: 'Administration' },
    { id: 'masters', label: 'Master Data', icon: 'layers', href: 'masters.html', ready: true },
    { id: 'users', label: 'Users', icon: 'users', href: 'users.html', ready: true,
      roles: ['super_admin'] },
    { id: 'audit', label: 'Audit Log', icon: 'shield', href: 'audit.html', ready: false,
      roles: ['super_admin', 'auditor'] },
    { id: 'settings', label: 'Settings', icon: 'settings', href: 'settings.html', ready: true }
  ];

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
        html += '<div class="nav-section">' + ui.esc(item.section) + '</div>';
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
          '<span class="nav-label">' + ui.esc(item.label) + '</span>' +
          (item.ready ? '' : '<span class="badge badge-soon">soon</span>') +
        '</a>';
    });

    return html;
  }

  function sidebarHtml(activeId, user) {
    var role = user ? user.role_name : null;
    var roleLabel = (user && user.role && user.role.label) || ui.fmt.title(role || '');

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
            '<span class="sidebar-user-info">' +
              '<span class="sidebar-user-name">' + ui.esc(user ? user.full_name : '—') + '</span>' +
              '<span class="sidebar-user-role">' + ui.esc(roleLabel) + '</span>' +
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
        '<button class="icon-btn topbar-toggle" id="sidebarToggle" aria-label="Open navigation">' +
          ui.icon('menu', 21) +
        '</button>' +

        '<div class="global-search">' +
          '<span class="global-search-icon">' + ui.icon('search', 17) + '</span>' +
          '<label class="sr-only" for="globalSearch">Search assets by tag, name or serial</label>' +
          '<input class="input" id="globalSearch" type="search" ' +
                 'placeholder="Search assets by tag, name or serial…" autocomplete="off">' +
          '<span class="search-kbd">/</span>' +
        '</div>' +

        '<div class="topbar-actions">' +
          '<div class="dropdown" id="notifDropdown">' +
            '<button class="icon-btn" id="notifBtn" aria-label="Notifications" ' +
                    'aria-haspopup="true" aria-expanded="false">' +
              ui.icon('bell', 20) +
            '</button>' +
            '<div class="dropdown-menu" id="notifMenu" role="menu">' +
              '<div class="dropdown-header">Notifications</div>' +
              '<div class="empty-state" style="padding:24px 16px">' +
                '<p class="text-small" style="margin:0">You have no notifications yet.</p>' +
              '</div>' +
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
                ui.icon('user', 17) + '<span>My profile</span>' +
              '</a>' +
              '<a class="dropdown-item" href="settings.html#password" role="menuitem">' +
                ui.icon('lock', 17) + '<span>Change password</span>' +
              '</a>' +
              '<div class="dropdown-divider"></div>' +
              '<button class="dropdown-item is-danger" id="logoutBtn" role="menuitem">' +
                ui.icon('logout', 17) + '<span>Sign out</span>' +
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

    // Global search: assets aren't built yet, so say so rather than fail silently.
    $('#globalSearch').on('keydown', function (event) {
      if (event.key !== 'Enter') { return; }
      var term = $(this).val().trim();
      if (!term) { return; }
      ui.info('Asset search is coming with the assets screen',
              'Searched for "' + term + '".');
    });
  }

  /** Repaint the parts of the chrome that depend on the profile. */
  function applyUser(user) {
    if (!user) { return; }
    var initials = user.initials || ui.fmt.initials(user.full_name);
    $('#topbarAvatar').text(initials);
    $('#topbarName').text(user.full_name);
    $('#profileMenuEmail').text(user.email);
    $('.sidebar-user-name').text(user.full_name);
    $('.sidebar-user-role').text((user.role && user.role.label) || ui.fmt.title(user.role_name));
    $('.sidebar-user .avatar').text(initials);
  }

  /**
   * Render the shell into the page.
   * @param {string} activeId nav id to highlight
   */
  function render(activeId) {
    var user = T.api.profile.get();
    var $app = $('#app');

    $app.prepend(sidebarHtml(activeId, user));
    $app.find('.main').prepend(topbarHtml(user));

    bindShell();
    $(document).on('trasset:user', function (event, freshUser) { applyUser(freshUser); });
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
