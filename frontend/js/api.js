/* ==========================================================================
   Trasset — API client
   Central AJAX wrapper: attaches the JWT, unwraps the response envelope,
   refreshes the access token on 401 and normalises errors (Build plan Day 20).
   ========================================================================== */

window.Trasset = window.Trasset || {};

(function (T, $) {
  'use strict';

  var CONFIG = {
    // Point this at the DRF server. Override before load with window.TRASSET_API_BASE.
    baseUrl: window.TRASSET_API_BASE || 'http://127.0.0.1:8000/api/v1',
    refreshKey: 'trasset.refresh',
    userKey: 'trasset.user',
    loginPage: 'index.html'
  };

  /* ------------------------------------------------------------------------
     Token store

     The access token lives in memory only, so it is gone the moment the tab
     closes. The refresh token is persisted to localStorage — without it a page
     reload would drop the session. That is a deliberate trade-off: it keeps
     sessions usable, at the cost of being readable by any script that manages
     to run on this origin. Keep the app free of injected third-party scripts.
     ---------------------------------------------------------------------- */
  var accessToken = null;

  var tokens = {
    getAccess: function () { return accessToken; },

    getRefresh: function () {
      try { return localStorage.getItem(CONFIG.refreshKey); }
      catch (e) { return null; }
    },

    set: function (access, refresh) {
      accessToken = access || null;
      try {
        if (refresh) { localStorage.setItem(CONFIG.refreshKey, refresh); }
      } catch (e) { /* private browsing — session lasts until reload */ }
    },

    clear: function () {
      accessToken = null;
      try {
        localStorage.removeItem(CONFIG.refreshKey);
        localStorage.removeItem(CONFIG.userKey);
      } catch (e) { /* ignore */ }
    }
  };

  /* ------------------------------------------------------------------------
     Cached profile — lets the shell paint before /auth/me/ returns
     ---------------------------------------------------------------------- */
  var profile = {
    get: function () {
      try {
        var raw = localStorage.getItem(CONFIG.userKey);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    set: function (user) {
      try { localStorage.setItem(CONFIG.userKey, JSON.stringify(user)); }
      catch (e) { /* ignore */ }
    }
  };

  /* ------------------------------------------------------------------------
     Errors
     ---------------------------------------------------------------------- */
  function ApiError(status, message, errors) {
    this.name = 'ApiError';
    this.status = status;
    this.message = message || 'Something went wrong.';
    this.errors = errors || null;
  }
  ApiError.prototype = Object.create(Error.prototype);

  /** First field-level message, handy for focusing the offending input. */
  ApiError.prototype.firstFieldError = function () {
    if (!this.errors) { return null; }
    for (var key in this.errors) {
      if (Object.prototype.hasOwnProperty.call(this.errors, key)) {
        var value = this.errors[key];
        return { field: key, message: $.isArray(value) ? value[0] : String(value) };
      }
    }
    return null;
  };

  function parseError(jqXHR) {
    var status = jqXHR.status;
    var body = jqXHR.responseJSON;

    if (!body && jqXHR.responseText) {
      try { body = JSON.parse(jqXHR.responseText); } catch (e) { body = null; }
    }

    if (status === 0) {
      return new ApiError(0,
        'Cannot reach the Trasset API. Check that the server is running at ' +
        CONFIG.baseUrl.replace('/api/v1', '') + '.');
    }
    if (body && body.message) {
      return new ApiError(status, body.message, body.errors);
    }
    if (status >= 500) {
      return new ApiError(status, 'The server ran into a problem. Please try again.');
    }
    return new ApiError(status, 'Request failed (' + status + ').');
  }

  /* ------------------------------------------------------------------------
     Token refresh — single-flight so N parallel 401s trigger one refresh
     ---------------------------------------------------------------------- */
  var refreshPromise = null;

  function refreshAccessToken() {
    if (refreshPromise) { return refreshPromise; }

    var refresh = tokens.getRefresh();
    if (!refresh) {
      return Promise.reject(new ApiError(401, 'Your session has expired.'));
    }

    refreshPromise = new Promise(function (resolve, reject) {
      $.ajax({
        url: CONFIG.baseUrl + '/auth/refresh/',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ refresh: refresh })
      }).done(function (body) {
        var data = (body && body.data) || {};
        if (!data.access) {
          reject(new ApiError(401, 'Your session has expired.'));
          return;
        }
        // Refresh rotation is on server-side, so store the new refresh too.
        tokens.set(data.access, data.refresh || refresh);
        resolve(data.access);
      }).fail(function () {
        reject(new ApiError(401, 'Your session has expired. Please sign in again.'));
      });
    });

    refreshPromise['finally'](function () { refreshPromise = null; });
    return refreshPromise;
  }

  /* ------------------------------------------------------------------------
     Core request
     ---------------------------------------------------------------------- */
  function buildUrl(path, params) {
    var url = /^https?:/.test(path) ? path : CONFIG.baseUrl + path;
    if (params) {
      var query = [];
      Object.keys(params).forEach(function (key) {
        var value = params[key];
        if (value === null || value === undefined || value === '') { return; }
        query.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
      });
      if (query.length) { url += (url.indexOf('?') === -1 ? '?' : '&') + query.join('&'); }
    }
    return url;
  }

  function send(options, isRetry) {
    return new Promise(function (resolve, reject) {
      var settings = {
        url: buildUrl(options.path, options.params),
        method: options.method || 'GET',
        headers: {},
        dataType: 'json'
      };

      var access = tokens.getAccess();
      if (access && !options.skipAuth) {
        settings.headers.Authorization = 'Bearer ' + access;
      }

      if (options.formData) {
        // Let the browser set the multipart boundary.
        settings.data = options.formData;
        settings.processData = false;
        settings.contentType = false;
      } else if (options.data !== undefined) {
        settings.contentType = 'application/json';
        settings.data = JSON.stringify(options.data);
      }

      $.ajax(settings)
        .done(function (body) {
          // Endpoints that return no content (204) give an empty body.
          resolve(body && typeof body === 'object' ? body.data : null);
        })
        .fail(function (jqXHR) {
          // A 401 on an authenticated call means the access token aged out.
          // Refresh once, then replay the original request.
          var canRetry = jqXHR.status === 401 &&
                         !isRetry &&
                         !options.skipAuth &&
                         !options.skipRefresh &&
                         tokens.getRefresh();

          if (canRetry) {
            refreshAccessToken()
              .then(function () { return send(options, true); })
              .then(resolve)
              .catch(function (error) {
                T.api.onSessionExpired();
                reject(error);
              });
            return;
          }

          if (jqXHR.status === 401 && !options.skipAuth) {
            T.api.onSessionExpired();
          }
          reject(parseError(jqXHR));
        });
    });
  }

  /* ------------------------------------------------------------------------
     Public surface
     ---------------------------------------------------------------------- */
  T.api = {
    config: CONFIG,
    tokens: tokens,
    profile: profile,
    ApiError: ApiError,

    request: send,

    get: function (path, params) {
      return send({ method: 'GET', path: path, params: params });
    },
    post: function (path, data, params) {
      return send({ method: 'POST', path: path, data: data, params: params });
    },
    patch: function (path, data) {
      return send({ method: 'PATCH', path: path, data: data });
    },
    put: function (path, data) {
      return send({ method: 'PUT', path: path, data: data });
    },
    del: function (path) {
      return send({ method: 'DELETE', path: path });
    },
    upload: function (path, formData, method) {
      return send({ method: method || 'POST', path: path, formData: formData });
    },

    /* --- Session ------------------------------------------------------- */
    login: function (email, password) {
      return send({
        method: 'POST',
        path: '/auth/login/',
        data: { email: email, password: password },
        skipAuth: true,
        skipRefresh: true
      }).then(function (data) {
        tokens.set(data.access, data.refresh);
        if (data.user) { profile.set(data.user); }
        return data;
      });
    },

    logout: function () {
      var refresh = tokens.getRefresh();
      var done = refresh
        ? send({ method: 'POST', path: '/auth/logout/', data: { refresh: refresh } })
            .catch(function () { /* token already invalid — sign out anyway */ })
        : Promise.resolve();

      return done.then(function () { tokens.clear(); });
    },

    me: function () {
      return T.api.get('/auth/me/').then(function (user) {
        profile.set(user);
        return user;
      });
    },

    isAuthenticated: function () {
      return Boolean(tokens.getAccess() || tokens.getRefresh());
    },

    /**
     * Restore a session after a page load. The access token is gone (memory
     * only), so trade the stored refresh token for a fresh one.
     */
    restore: function () {
      if (accessToken) { return Promise.resolve(true); }
      if (!tokens.getRefresh()) { return Promise.resolve(false); }
      return refreshAccessToken()
        .then(function () { return true; })
        .catch(function () { tokens.clear(); return false; });
    },

    /** Overridden by auth.js so pages can redirect on expiry. */
    onSessionExpired: function () {}
  };

}(window.Trasset, window.jQuery));
