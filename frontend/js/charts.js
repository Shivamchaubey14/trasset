/* ==========================================================================
   Trasset — Chart.js presets
   Every chart pulls its colours from the CSS custom properties, so the brand
   palette stays defined in exactly one place (SRS §7.3).
   ========================================================================== */

window.Trasset = window.Trasset || {};

(function (T) {
  'use strict';

  function token(name, fallback) {
    var value = getComputedStyle(document.documentElement)
                  .getPropertyValue(name).trim();
    return value || fallback;
  }

  var palette = {
    primary: token('--color-primary', '#3BB77E'),
    accent:  token('--color-accent', '#FDC040'),
    ink:     token('--color-ink', '#253D4E'),
    muted:   token('--color-muted', '#7B8794'),
    danger:  token('--color-danger', '#E5484D'),
    border:  token('--border', '#E3E8EE'),
    surface: token('--color-surface', '#FFFFFF')
  };

  var series = [
    token('--chart-1', '#3BB77E'), token('--chart-2', '#253D4E'),
    token('--chart-3', '#FDC040'), token('--chart-4', '#7B8794'),
    token('--chart-5', '#5FC9A0'), token('--chart-6', '#4A6B85'),
    token('--chart-7', '#E5484D'), token('--chart-8', '#B8C2CC')
  ];

  function applyDefaults() {
    if (!window.Chart) { return; }
    Chart.defaults.font.family = "'Lexend', 'Segoe UI', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = palette.muted;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.legend.labels.padding = 16;
    Chart.defaults.maintainAspectRatio = false;
  }

  /** Shared tooltip styling — dark Ink card, generous padding. */
  function tooltip(extra) {
    return Object.assign({
      backgroundColor: palette.ink,
      titleColor: '#fff',
      bodyColor: 'rgba(255,255,255,.85)',
      padding: 12,
      cornerRadius: 8,
      displayColors: true,
      boxPadding: 4,
      titleFont: { family: "'Quicksand', sans-serif", size: 13, weight: '700' }
    }, extra || {});
  }

  var registry = {};

  /** Create (or replace) a chart bound to a canvas id. */
  function mount(canvasId, config) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) { return null; }
    if (registry[canvasId]) { registry[canvasId].destroy(); }
    registry[canvasId] = new Chart(canvas.getContext('2d'), config);
    return registry[canvasId];
  }

  var money = function (value) {
    return T.ui ? T.ui.fmt.moneyShort(value) : value;
  };

  /* ----------------------------------------------------------------------
     Doughnut — assets by status
     ---------------------------------------------------------------------- */
  function statusDoughnut(canvasId, rows) {
    var visible = rows.filter(function (row) { return row.count > 0; });
    if (!visible.length) { return null; }

    return mount(canvasId, {
      type: 'doughnut',
      data: {
        labels: visible.map(function (r) { return r.label; }),
        datasets: [{
          data: visible.map(function (r) { return r.count; }),
          backgroundColor: visible.map(function (r) { return r.color; }),
          borderColor: palette.surface,
          borderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        cutout: '66%',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: tooltip({
            callbacks: {
              label: function (ctx) {
                var total = ctx.dataset.data.reduce(function (a, b) { return a + b; }, 0);
                var pct = total ? Math.round((ctx.parsed / total) * 100) : 0;
                return ' ' + ctx.label + ': ' + ctx.parsed + ' (' + pct + '%)';
              }
            }
          })
        }
      }
    });
  }

  /* ----------------------------------------------------------------------
     Horizontal bar — assets by category
     ---------------------------------------------------------------------- */
  function categoryBar(canvasId, rows) {
    if (!rows.length) { return null; }

    return mount(canvasId, {
      type: 'bar',
      data: {
        labels: rows.map(function (r) { return r.name; }),
        datasets: [{
          label: 'Assets',
          data: rows.map(function (r) { return r.count; }),
          backgroundColor: rows.map(function (r, i) {
            return r.color || series[i % series.length];
          }),
          borderRadius: 6,
          borderSkipped: false,
          barThickness: 18
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: tooltip({
            callbacks: {
              label: function (ctx) {
                var row = rows[ctx.dataIndex];
                return ' ' + ctx.parsed.x + ' assets · ' + money(row.value);
              }
            }
          })
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: palette.border, drawBorder: false }
          },
          y: { grid: { display: false, drawBorder: false } }
        }
      }
    });
  }

  /* ----------------------------------------------------------------------
     Line — register value over time
     ---------------------------------------------------------------------- */
  function valueLine(canvasId, rows) {
    if (!rows.length) { return null; }

    var canvas = document.getElementById(canvasId);
    if (!canvas) { return null; }

    var gradient = canvas.getContext('2d').createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, 'rgba(59, 183, 126, .26)');
    gradient.addColorStop(1, 'rgba(59, 183, 126, 0)');

    return mount(canvasId, {
      type: 'line',
      data: {
        labels: rows.map(function (r) { return r.label; }),
        datasets: [{
          label: 'Register value',
          data: rows.map(function (r) { return parseFloat(r.value); }),
          borderColor: palette.primary,
          backgroundColor: gradient,
          borderWidth: 2.5,
          fill: true,
          tension: .35,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointBackgroundColor: palette.primary,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2
        }]
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: tooltip({
            callbacks: {
              label: function (ctx) { return ' Register value: ' + money(ctx.parsed.y); },
              afterLabel: function (ctx) {
                var added = parseFloat(rows[ctx.dataIndex].added || 0);
                return added > 0 ? ' Added this month: ' + money(added) : '';
              }
            }
          })
        },
        scales: {
          x: { grid: { display: false, drawBorder: false } },
          y: {
            beginAtZero: true,
            grid: { color: palette.border, drawBorder: false },
            ticks: { callback: function (value) { return money(value); } }
          }
        }
      }
    });
  }

  /* ----------------------------------------------------------------------
     Bar — assets added per month
     ---------------------------------------------------------------------- */
  function addedBar(canvasId, rows) {
    if (!rows.length) { return null; }

    return mount(canvasId, {
      type: 'bar',
      data: {
        labels: rows.map(function (r) { return r.label; }),
        datasets: [{
          label: 'Assets added',
          data: rows.map(function (r) { return r.count; }),
          backgroundColor: palette.accent,
          hoverBackgroundColor: '#e8ac2c',
          borderRadius: 5,
          borderSkipped: false,
          maxBarThickness: 26
        }]
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: tooltip({
            callbacks: {
              label: function (ctx) {
                return ' ' + ctx.parsed.y + ' asset' + (ctx.parsed.y === 1 ? '' : 's') + ' added';
              }
            }
          })
        },
        scales: {
          x: { grid: { display: false, drawBorder: false } },
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: palette.border, drawBorder: false }
          }
        }
      }
    });
  }

  T.charts = {
    palette: palette,
    series: series,
    applyDefaults: applyDefaults,
    mount: mount,
    tooltip: tooltip,
    statusDoughnut: statusDoughnut,
    categoryBar: categoryBar,
    valueLine: valueLine,
    addedBar: addedBar,
    destroyAll: function () {
      Object.keys(registry).forEach(function (id) { registry[id].destroy(); });
      registry = {};
    }
  };

}(window.Trasset));
