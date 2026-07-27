/* ==========================================================================
   Trasset — session & route guard
   ========================================================================== */

window.Trasset = window.Trasset || {};

(function (T, $) {
  'use strict';

  var LOGIN_PAGE = 'index.html';
  var HOME_PAGE = 'dashboard.html';

  var session = {
    user: null,

    /** Role slug of the signed-in user, or null. */
    role: function () {
      return session.user ? session.user.role_name : null;
    },

    is: function () {
      var role = session.role();
      return Array.prototype.indexOf.call(arguments, role) !== -1;
    },

    isManager: function () {
      return session.is('super_admin', 'asset_manager');
    },

    isAdmin: function () {
      return session.is('super_admin');
    },

    /** Auditors may read everything but must never see a write control. */
    canWrite: function () {
      return session.isManager();
    }
  };

  function redirectToLogin(reason) {
    if (window.location.pathname.indexOf(LOGIN_PAGE) !== -1) { return; }
    var target = LOGIN_PAGE;
    if (reason) { target += '?reason=' + encodeURIComponent(reason); }
    window.location.replace(target);
  }

  // api.js calls this whenever a refresh fails or a 401 can't be recovered.
  T.api.onSessionExpired = function () {
    T.api.tokens.clear();
    redirectToLogin('expired');
  };

  /**
   * Guard an authenticated page.
   *
   * Paints the cached profile immediately so the shell doesn't flash empty,
   * then revalidates against /auth/me/ in the background.
   *
   * @returns {Promise<object>} resolves with the user profile
   */
  function requireAuth() {
    if (!T.api.isAuthenticated()) {
      redirectToLogin();
      return new Promise(function () {}); // never settles — page is leaving
    }

    var cached = T.api.profile.get();
    if (cached) { session.user = cached; }

    return T.api.restore()
      .then(function (ok) {
        if (!ok) {
          redirectToLogin('expired');
          return new Promise(function () {});
        }
        return T.api.me();
      })
      .then(function (user) {
        session.user = user;
        $(document).trigger('trasset:user', [user]);
        return user;
      })
      .catch(function (error) {
        if (error && error.status === 0) {
          // Server unreachable — say so rather than bouncing to login.
          T.ui.error('Cannot reach the server', error.message);
          throw error;
        }
        redirectToLogin('expired');
        return new Promise(function () {});
      });
  }

  /** Used by the login page: skip the form if a session is already live. */
  function redirectIfAuthenticated() {
    if (!T.api.isAuthenticated()) { return Promise.resolve(false); }
    return T.api.restore().then(function (ok) {
      if (ok) { window.location.replace(HOME_PAGE); return true; }
      return false;
    });
  }

  function logout() {
    return T.api.logout()['finally'](function () {
      window.location.replace(LOGIN_PAGE);
    });
  }

  T.auth = {
    session: session,
    requireAuth: requireAuth,
    redirectIfAuthenticated: redirectIfAuthenticated,
    logout: logout,
    LOGIN_PAGE: LOGIN_PAGE,
    HOME_PAGE: HOME_PAGE
  };

}(window.Trasset, window.jQuery));
