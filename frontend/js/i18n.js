/* ==========================================================================
   Trasset — language switching (English / हिन्दी)

   Static markup is translated by tagging it:

       <span data-i18n="nav.assets">Assets</span>
       <input data-i18n-attr="placeholder:search.assets">

   Strings built in JavaScript go through `T.i18n.t('key')`.

   The English text stays in the HTML as the fallback, so a missing key
   degrades to readable English rather than to a blank or a raw key.
   ========================================================================== */

window.Trasset = window.Trasset || {};

(function (T, $) {
  'use strict';

  var STORAGE_KEY = 'trasset.lang';
  var DEFAULT_LANG = 'en';

  /* ----------------------------------------------------------------------
     Dictionary

     Hindi here is the business Hindi actually used in Indian offices — which
     keeps established English loanwords (डैशबोर्ड, वारंटी, सीरियल नंबर) rather
     than reaching for literal Sanskritised coinages nobody says out loud.
     ---------------------------------------------------------------------- */
  var STRINGS = {
    hi: {
      /* --- Brand & chrome --- */
      'app.tagline': 'एसेट मैनेजमेंट सिस्टम',
      'nav.overview': 'सिंहावलोकन',
      'nav.manage': 'प्रबंधन',
      'nav.administration': 'प्रशासन',
      'nav.dashboard': 'डैशबोर्ड',
      'nav.assets': 'संपत्तियाँ',
      'nav.requests': 'अनुरोध',
      'nav.maintenance': 'रखरखाव',
      'nav.procurement': 'खरीद',
      'nav.reports': 'रिपोर्ट',
      'nav.masters': 'मास्टर डेटा',
      'nav.users': 'उपयोगकर्ता',
      'nav.audit': 'ऑडिट लॉग',
      'nav.settings': 'सेटिंग्स',
      'nav.soon': 'जल्द',

      'topbar.search': 'टैग, नाम या सीरियल से संपत्ति खोजें…',
      'topbar.notifications': 'सूचनाएँ',
      'topbar.markAllRead': 'सभी पढ़ा हुआ चिह्नित करें',
      'topbar.noNotifications': 'कुछ नया नहीं। आवंटन, अनुरोध और रखरखाव की सूचनाएँ यहाँ दिखेंगी।',
      'topbar.myProfile': 'मेरी प्रोफ़ाइल',
      'topbar.changePassword': 'पासवर्ड बदलें',
      'topbar.signOut': 'साइन आउट',
      'topbar.openNav': 'नेविगेशन खोलें',

      /* --- Roles --- */
      'role.super_admin': 'सुपर एडमिन',
      'role.asset_manager': 'एसेट मैनेजर',
      'role.department_head': 'विभाग प्रमुख',
      'role.employee': 'कर्मचारी',
      'role.auditor': 'ऑडिटर',

      /* --- Sign in --- */
      'auth.headline1': 'हर संपत्ति का',
      'auth.headline2': 'पूरा हिसाब।',
      'auth.sub': 'लैपटॉप, वाहन, फ़र्नीचर और लाइसेंस — खरीद से लेकर निपटान तक पूरे जीवनचक्र में ट्रैक करें, मूल्यह्रास, रखरखाव और पूरे ऑडिट ट्रेल के साथ।',
      'auth.feature1.title': 'स्वचालित एसेट टैग',
      'auth.feature1.desc': 'बनाते ही क्रमवार TRA-2026-000001 पहचान संख्या।',
      'auth.feature2.title': 'सजीव मूल्यह्रास',
      'auth.feature2.desc': 'सीधी रेखा या घटता शेष — अपने आप पुनर्गणना।',
      'auth.feature3.title': 'भूमिका आधारित पहुँच',
      'auth.feature3.desc': 'पाँच भूमिकाएँ, हर एंडपॉइंट पर लागू — सिर्फ़ छिपाई नहीं गईं।',
      'auth.welcome': 'वापसी पर स्वागत है',
      'auth.lede': 'अपने Trasset कार्यक्षेत्र में साइन इन करें।',
      'auth.email': 'ईमेल पता',
      'auth.emailPlaceholder': 'aap@company.com',
      'auth.password': 'पासवर्ड',
      'auth.passwordPlaceholder': 'अपना पासवर्ड दर्ज करें',
      'auth.keepSignedIn': 'मुझे साइन इन रखें',
      'auth.forgot': 'पासवर्ड भूल गए?',
      'auth.signIn': 'साइन इन करें',
      'auth.demoTitle': 'डेमो खाते · भरने के लिए क्लिक करें',
      'auth.enterEmail': 'अपना ईमेल पता दर्ज करें।',
      'auth.enterPassword': 'अपना पासवर्ड दर्ज करें।',
      'auth.failed': 'साइन इन नहीं हो सका। अपनी जानकारी जाँचें और फिर कोशिश करें।',
      'auth.expired': 'आपका सत्र समाप्त हो गया है। कृपया फिर से साइन इन करें।',
      'auth.signedIn': 'साइन इन हो गया',
      'auth.showPassword': 'पासवर्ड दिखाएँ',
      'auth.hidePassword': 'पासवर्ड छिपाएँ',

      /* --- Common actions --- */
      'action.save': 'परिवर्तन सहेजें',
      'action.cancel': 'रद्द करें',
      'action.delete': 'हटाएँ',
      'action.edit': 'संपादित करें',
      'action.view': 'देखें',
      'action.add': 'जोड़ें',
      'action.create': 'बनाएँ',
      'action.close': 'बंद करें',
      'action.confirm': 'पुष्टि करें',
      'action.refresh': 'ताज़ा करें',
      'action.clearFilters': 'फ़िल्टर हटाएँ',
      'action.search': 'खोजें',
      'action.export': 'निर्यात',
      'action.import': 'आयात',
      'action.upload': 'अपलोड',
      'action.download': 'डाउनलोड',
      'action.assign': 'आवंटित करें',
      'action.checkin': 'वापस लें',
      'action.retire': 'सेवामुक्त करें',
      'action.approve': 'स्वीकृत करें',
      'action.reject': 'अस्वीकार करें',
      'action.start': 'शुरू करें',
      'action.complete': 'पूर्ण करें',
      'action.actions': 'कार्रवाई',

      /* --- Statuses --- */
      'status.available': 'उपलब्ध',
      'status.assigned': 'आवंटित',
      'status.under_maintenance': 'रखरखाव में',
      'status.retired': 'सेवामुक्त',
      'status.lost': 'गुम',
      'status.disposed': 'निपटाया गया',
      'status.pending': 'लंबित',
      'status.approved': 'स्वीकृत',
      'status.rejected': 'अस्वीकृत',
      'status.cancelled': 'रद्द',
      'status.active': 'सक्रिय',
      'status.inactive': 'निष्क्रिय',

      /* --- Shared field labels --- */
      'field.name': 'नाम',
      'field.assetTag': 'संपत्ति टैग',
      'field.category': 'श्रेणी',
      'field.serialNumber': 'सीरियल नंबर',
      'field.status': 'स्थिति',
      'field.location': 'स्थान',
      'field.department': 'विभाग',
      'field.vendor': 'विक्रेता',
      'field.assignedTo': 'आवंटित',
      'field.purchaseDate': 'खरीद तिथि',
      'field.purchaseCost': 'खरीद लागत',
      'field.bookValue': 'बही मूल्य',
      'field.warranty': 'वारंटी',
      'field.value': 'मूल्य',
      'field.description': 'विवरण',
      'field.notes': 'टिप्पणियाँ',
      'field.date': 'तिथि',
      'field.reason': 'कारण',

      /* --- Dashboard --- */
      'dash.title': 'डैशबोर्ड',
      'dash.subtitle': 'आपकी संपत्ति सूची की स्थिति।',
      'dash.totalAssets': 'कुल संपत्तियाँ',
      'dash.bookValue': 'बही मूल्य',
      'dash.assigned': 'आवंटित',
      'dash.available': 'उपलब्ध',
      'dash.inMaintenance': 'रखरखाव में',
      'dash.expiringWarranties': 'समाप्त होती वारंटी',
      'dash.valueOverTime': 'समय के साथ मूल्य',
      'dash.valueOverTimeSub': 'पिछले 12 महीनों की संचयी खरीद लागत',
      'dash.byStatus': 'स्थिति अनुसार',
      'dash.byStatusSub': 'वर्तमान जीवनचक्र स्थिति',
      'dash.byCategory': 'श्रेणी अनुसार',
      'dash.byCategorySub': 'संपत्ति संख्या के अनुसार शीर्ष श्रेणियाँ',
      'dash.assetsAdded': 'जोड़ी गई संपत्तियाँ',
      'dash.assetsAddedSub': 'प्रति माह नए रिकॉर्ड',
      'dash.recentlyAdded': 'हाल में जोड़ी गईं',
      'dash.recentlyAddedSub': 'सूची में नवीनतम प्रविष्टियाँ',
      'dash.warrantiesExpiring': 'समाप्त होती वारंटी',
      'dash.warrantiesExpiringSub': 'अगले 30 दिनों में',
      'dash.categories': 'श्रेणियाँ',
      'dash.readyToAssign': 'आवंटन के लिए तैयार',
      'dash.greetingMorning': 'सुप्रभात',
      'dash.greetingAfternoon': 'नमस्कार',
      'dash.greetingEvening': 'शुभ संध्या',

      /* --- Page titles --- */
      'page.assets': 'संपत्तियाँ',
      'page.assetsSub': 'संस्था की सभी संपत्तियाँ, और वे किसके पास हैं।',
      'page.requests': 'अनुरोध',
      'page.myRequests': 'मेरे अनुरोध',
      'page.approvals': 'स्वीकृतियाँ',
      'page.maintenance': 'रखरखाव',
      'page.maintenanceSub': 'क्या निर्धारित है, क्या सेवा से बाहर है, और उसकी लागत।',
      'page.procurement': 'खरीद',
      'page.procurementSub': 'क्या ऑर्डर पर है, क्या आ चुका है, और वह क्या बना।',
      'page.reports': 'रिपोर्ट',
      'page.reportsSub': 'फ़िल्टर करें, स्क्रीन पर देखें, फिर CSV या Excel में डाउनलोड करें।',
      'page.masters': 'मास्टर डेटा',
      'page.mastersSub': 'श्रेणियाँ, स्थान, विभाग और विक्रेता — हर संपत्ति इन्हीं पर आधारित है।',
      'page.users': 'उपयोगकर्ता',
      'page.usersSub': 'पहुँच रखने वाला हर व्यक्ति, और उसकी भूमिका।',
      'page.audit': 'ऑडिट लॉग',
      'page.auditSub': 'किसने क्या किया, कब और कहाँ से। केवल जोड़ा जा सकता है — बदला या हटाया नहीं।',
      'page.settings': 'सेटिंग्स',
      'page.settingsSub': 'आपकी प्रोफ़ाइल, पासवर्ड और सूचना प्राथमिकताएँ।',

      /* --- Settings --- */
      'settings.profile': 'प्रोफ़ाइल',
      'settings.profileSub': 'Trasset में आपका नाम कैसे दिखता है।',
      'settings.fullName': 'पूरा नाम',
      'settings.phone': 'फ़ोन',
      'settings.emailMe': 'आवंटन, रखरखाव और वारंटी सूचनाएँ ईमेल करें',
      'settings.changePassword': 'पासवर्ड बदलें',
      'settings.changePasswordSub': 'कम से कम 8 अक्षर, और ऐसा नहीं जो आसानी से अनुमान लगे।',
      'settings.currentPassword': 'वर्तमान पासवर्ड',
      'settings.newPassword': 'नया पासवर्ड',
      'settings.confirmPassword': 'नए पासवर्ड की पुष्टि करें',
      'settings.updatePassword': 'पासवर्ड अपडेट करें',
      'settings.noDepartment': 'कोई विभाग नहीं',

      /* --- Table & list chrome --- */
      'list.showing': 'दिखा रहे हैं',
      'list.of': 'में से',
      'list.noResults': 'कोई परिणाम नहीं',
      'list.tryDifferent': 'अलग खोज आज़माएँ, या फ़िल्टर हटाएँ।',
      'list.loading': 'लोड हो रहा है…',
      'list.previousPage': 'पिछला पृष्ठ',
      'list.nextPage': 'अगला पृष्ठ',
      'list.allStatuses': 'सभी स्थितियाँ',
      'list.allCategories': 'सभी श्रेणियाँ',
      'list.allLocations': 'सभी स्थान',
      'list.allDepartments': 'सभी विभाग',
      'list.allVendors': 'सभी विक्रेता',

      /* --- Messages --- */
      'msg.somethingWrong': 'कुछ गड़बड़ हुई',
      'msg.couldNotLoad': 'लोड नहीं हो सका',
      'msg.tryAgain': 'कृपया फिर कोशिश करें।',
      'msg.saved': 'सहेज लिया गया',
      'msg.deleted': 'हटा दिया गया',
      'msg.areYouSure': 'क्या आप निश्चित हैं?',
      'msg.cannotBeUndone': 'यह क्रिया वापस नहीं ली जा सकती।',
      'msg.serverUnreachable': 'सर्वर से संपर्क नहीं हो पा रहा',
      'msg.loadingWorkspace': 'आपका कार्यक्षेत्र लोड हो रहा है…',

      /* --- Language switch --- */
      'lang.switchTo': 'English पर जाएँ',
      'lang.label': 'भाषा',
      'lang.changed': 'भाषा बदलकर हिन्दी कर दी गई'
    }
  };

  /* ----------------------------------------------------------------------
     State
     ---------------------------------------------------------------------- */
  function stored() {
    try { return localStorage.getItem(STORAGE_KEY); }
    catch (e) { return null; }
  }

  var current = stored() === 'hi' ? 'hi' : DEFAULT_LANG;

  /**
   * Translate a key.
   * @param {string} key
   * @param {string} [fallback] English text to use when untranslated
   */
  function t(key, fallback) {
    if (current === 'en') { return fallback !== undefined ? fallback : key; }
    var table = STRINGS[current] || {};
    if (table[key] !== undefined) { return table[key]; }
    return fallback !== undefined ? fallback : key;
  }

  /* ----------------------------------------------------------------------
     Applying to the DOM
     ---------------------------------------------------------------------- */
  function apply(root) {
    var $root = root ? $(root) : $(document);

    $root.find('[data-i18n]').addBack('[data-i18n]').each(function () {
      var $el = $(this);
      var key = $el.attr('data-i18n');

      // Keep the English text around, so switching back is lossless.
      if ($el.attr('data-i18n-en') === undefined) {
        $el.attr('data-i18n-en', $el.text());
      }
      $el.text(t(key, $el.attr('data-i18n-en')));
    });

    // data-i18n-attr="placeholder:auth.email" or "title:x;aria-label:y"
    $root.find('[data-i18n-attr]').addBack('[data-i18n-attr]').each(function () {
      var $el = $(this);
      $el.attr('data-i18n-attr').split(';').forEach(function (pair) {
        var parts = pair.split(':');
        if (parts.length !== 2) { return; }

        var attribute = $.trim(parts[0]);
        var key = $.trim(parts[1]);
        var memo = 'data-i18n-en-' + attribute;

        if ($el.attr(memo) === undefined) {
          $el.attr(memo, $el.attr(attribute) || '');
        }
        $el.attr(attribute, t(key, $el.attr(memo)));
      });
    });

    document.documentElement.setAttribute('lang', current);
  }

  /* ----------------------------------------------------------------------
     Switching
     ---------------------------------------------------------------------- */
  function set(lang, options) {
    var next = lang === 'hi' ? 'hi' : 'en';
    if (next === current && !(options && options.force)) { return; }

    current = next;
    try { localStorage.setItem(STORAGE_KEY, current); } catch (e) { /* private mode */ }

    var animate = !(options && options.animate === false);

    if (!animate) {
      apply();
      $(document).trigger('trasset:lang', [current]);
      return;
    }

    // Fade the page out, swap the text while it is invisible, fade it back.
    // Swapping in view produces a visible flicker of mixed languages.
    var $body = $('body').addClass('lang-switching');

    window.setTimeout(function () {
      apply();
      $(document).trigger('trasset:lang', [current]);
      $body.removeClass('lang-switching');
    }, 180);
  }

  function toggle() {
    set(current === 'en' ? 'hi' : 'en');
  }

  /* ----------------------------------------------------------------------
     The control

     Shows the language you would switch *to*, not the one you are in — a
     button labelled with the current state reads as a status, and people
     press it expecting nothing to happen.
     ---------------------------------------------------------------------- */
  function buttonHtml(variant) {
    var target = current === 'en' ? 'हिन्दी' : 'English';
    var label = current === 'en' ? 'Switch to Hindi' : 'Switch to English';

    return '<button class="lang-toggle' + (variant ? ' lang-toggle-' + variant : '') + '" ' +
                   'id="langToggle" type="button" ' +
                   'aria-label="' + label + '" title="' + label + '">' +
             '<span class="lang-toggle-globe" aria-hidden="true">' +
               '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
                    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
                 '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/>' +
                 '<path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z"/>' +
               '</svg>' +
             '</span>' +
             '<span class="lang-toggle-text">' + target + '</span>' +
           '</button>';
  }

  /** Drop the control into a container and wire it up. */
  function mount(selector, variant) {
    var $host = $(selector);
    if (!$host.length) { return; }

    $host.html(buttonHtml(variant));

    $host.off('click.i18n').on('click.i18n', '#langToggle', function () {
      toggle();
      // Relabel for the *new* target language.
      $host.html(buttonHtml(variant));
    });
  }

  T.i18n = {
    t: t,
    apply: apply,
    set: set,
    toggle: toggle,
    mount: mount,
    get lang() { return current; },
    isHindi: function () { return current === 'hi'; },
    strings: STRINGS
  };

  // Set <html lang> as early as possible so the font rule applies before paint.
  document.documentElement.setAttribute('lang', current);

  $(function () { apply(); });

}(window.Trasset, window.jQuery));
