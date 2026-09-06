(function () {
  'use strict';

  var API_URL = 'https://achzod-klarna-checkout.onrender.com/checkout-klarna';
  var PAYPAL_API_URL = 'https://achzod-klarna-checkout.onrender.com/checkout-paypal';
  var PAYPAL_CONFIG_URL = 'https://achzod-klarna-checkout.onrender.com/paypal/config';
  var BUTTON_ID = 'achzod-klarna-checkout';
  var LEGACY_IDS = ['klarna-fixed-btn', 'ac-klarna-fixed', 'ac-klarna-btn'];
  var LEGACY_PAYPAL_SELECTORS = [
    '[data-wf-paypal-button]',
    '[data-wf-paypal-element]',
    '.paypal-2'
  ];
  var LEGACY_BACKUP_KEYS = ['achzod_cart_backup', 'achzod_cart_timestamp'];
  var LEGACY_BACKUP_COOKIE = 'achzod_cart';
  var PROMO_STORAGE_KEY = 'achzod_klarna_promo';
  var CHECKOUT_ITEM_SELECTOR = '.w-commerce-commercecheckoutorderitem';
  var CHECKOUT_TOTAL_SELECTOR = '.w-commerce-commercecheckoutsummarytotal';
  var DOM_READY_TIMEOUT_MS = 4000;
  var DOM_READY_INTERVAL_MS = 120;

  // Purge tout état hérité du vieux système de backup pour éviter que d'anciens
  // paniers accumulés côté localStorage/cookie ne remontent dans Klarna.
  function purgeLegacyBackups() {
    try {
      LEGACY_BACKUP_KEYS.forEach(function (key) {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });
    } catch (_) {}
    try {
      document.cookie = LEGACY_BACKUP_COOKIE + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;domain=.achzodcoaching.com';
      document.cookie = LEGACY_BACKUP_COOKIE + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/';
    } catch (_) {}
    try {
      window.getAchzodCartBackup = function () { return []; };
      window.clearAchzodCart = function () {};
    } catch (_) {}
  }

  function parseEuro(value) {
    var text = String(value || '').replace(/\u00a0/g, ' ');
    var match = text.match(/([\d\s]+)[,.](\d{2})/);
    if (!match) return null;
    var amount = Number(match[1].replace(/\s/g, '') + '.' + match[2]);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }

  function parseQuantity(row) {
    var input = row.querySelector('input[type="number"], input[name*="quantity" i]');
    if (input && Number.isSafeInteger(Number(input.value)) && Number(input.value) > 0) {
      return Number(input.value);
    }
    var quantityNode = row.querySelector(
      '.w-commerce-commercecheckoutorderitemquantitywrapper, [class*="quantity" i]'
    );
    var text = quantityNode ? quantityNode.textContent : row.textContent;
    var normalizedText = String(text || '').trim();
    var match = normalizedText.match(/(?:qt[ée]|qty|quantit[ée])\s*:?\s*(\d+)/i);
    if (!match && quantityNode) match = normalizedText.match(/^\s*(\d+)\s*$/);
    var quantity = match ? Number(match[1]) : 1;
    return Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 10 ? quantity : 1;
  }

  function decodeWebflowText(value) {
    var text = String(value || '');
    try {
      text = decodeURIComponent(text);
    } catch (_) {}
    return text;
  }

  function cleanProductName(value) {
    var original = decodeWebflowText(value);
    var normalized = original
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Webflow colle parfois la devise et la durée: "EUR8 semaines".
    var durationMatch = normalized.match(/(?:^|[^0-9])(4|8|12)\s+semaines?\b/);
    var duration = durationMatch ? durationMatch[1] : '';

    if (normalized.indexOf('private lab') !== -1 && duration) return 'Private Lab ' + duration + ' semaines';
    if (normalized.indexOf('essential') !== -1 && duration) return 'Essential ' + duration + ' semaines';
    if (normalized.indexOf('elite') !== -1 && duration) return 'Elite ' + duration + ' semaines';
    if (normalized.indexOf('coaching sans suivi') !== -1) return 'Coaching sans suivi';
    if (normalized.indexOf('anabolic code') !== -1) return 'Anabolic Code';
    if (normalized.indexOf('bioenergetique') !== -1) return 'Bioénergétique et timing de la nutrition';
    if (normalized.indexOf('liberer son potentiel') !== -1) return 'Libérer son potentiel génétique';
    if (normalized.indexOf('shred') !== -1) return '4 semaines pour être SHRED';
    return original.trim().slice(0, 120);
  }

  // Source de vérité : le DOM du checkout Webflow. On ne s'appuie plus sur
  // aucun backup localStorage/cookie — c'était la source du bug où les produits
  // s'accumulaient au retour depuis Klarna.
  function readDomItems() {
    return Array.prototype.map.call(
      document.querySelectorAll(CHECKOUT_ITEM_SELECTOR),
      function (row) {
        // Webflow peut laisser d'anciennes lignes cachées dans le DOM après un
        // retour navigateur. Elles ne font pas partie du panier affiché.
        var style = window.getComputedStyle(row);
        var rect = row.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden'
          || style.opacity === '0' || rect.width === 0 || rect.height === 0) {
          return null;
        }
        var nameNode = row.querySelector('.w-commerce-commercecheckoutorderitemdescriptionwrapper');
        var priceNode = row.querySelector('.w-commerce-commercecheckoutorderitemprice');
        var name = cleanProductName(nameNode ? nameNode.textContent : row.textContent);
        var price = parseEuro(priceNode ? priceNode.textContent : row.textContent);
        return name && price ? { name: name.slice(0, 120), price: price, quantity: parseQuantity(row) } : null;
      }
    ).filter(Boolean);
  }

  function waitForDomItems() {
    return new Promise(function (resolve) {
      var startedAt = Date.now();
      function poll() {
        var items = readDomItems();
        if (items.length > 0) return resolve(items);
        if (Date.now() - startedAt >= DOM_READY_TIMEOUT_MS) return resolve([]);
        window.setTimeout(poll, DOM_READY_INTERVAL_MS);
      }
      poll();
    });
  }

  function normalizePromotionCode(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 64);
  }

  function rememberPromotionCode() {
    var input = document.querySelector('[data-node-type="commerce-checkout-discount-input"]');
    var code = normalizePromotionCode(input ? input.value : '');
    try {
      if (code) sessionStorage.setItem(PROMO_STORAGE_KEY, code);
      else sessionStorage.removeItem(PROMO_STORAGE_KEY);
    } catch (_) {}
  }

  function readAppliedPromotionCode() {
    var text = String(document.body ? document.body.innerText : '');
    var match = text.match(/discount\s*\(\s*([a-z0-9_-]{1,64})\s*\)/i);
    return normalizePromotionCode(match ? match[1] : '');
  }

  function readPromotionCode() {
    var appliedCode = readAppliedPromotionCode();
    if (appliedCode) return appliedCode;
    try {
      return normalizePromotionCode(sessionStorage.getItem(PROMO_STORAGE_KEY));
    } catch (_) {
      return '';
    }
  }

  function trackPromotionForm() {
    var form = document.querySelector('[data-node-type="commerce-checkout-discount-form"]');
    if (!form) return;
    form.addEventListener('submit', rememberPromotionCode, true);
    var button = form.querySelector('button');
    if (button) button.addEventListener('click', rememberPromotionCode, true);
  }

  async function buildPayload() {
    var items = await waitForDomItems();
    var totalNode = document.querySelector(CHECKOUT_TOTAL_SELECTOR);
    var totalAmount = parseEuro(totalNode ? totalNode.textContent : '');
    var emailNode = document.querySelector('input[type="email"]');
    var payload = {
      items: items,
      customerEmail: emailNode ? emailNode.value : '',
      successUrl: 'https://achzodcoaching.com/order-confirmation',
      cancelUrl: 'https://achzodcoaching.com/checkout',
    };
    if (totalAmount) payload.totalAmount = totalAmount;
    var discountCode = readPromotionCode();
    if (discountCode) payload.discountCode = discountCode;
    return payload;
  }

  function newAttemptId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'checkout_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  }

  function track(eventName, details) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: eventName }, details || {}));
  }

  function removeLegacyButtons() {
    LEGACY_IDS.forEach(function (id) {
      var node = document.getElementById(id);
      if (node) node.remove();
    });
    LEGACY_PAYPAL_SELECTORS.forEach(function (selector) {
      Array.prototype.forEach.call(document.querySelectorAll(selector), function (node) {
        if (node && node.id !== BUTTON_ID && !node.closest('#' + BUTTON_ID)) node.remove();
      });
    });
  }

  async function openKlarnaCheckout(button, errorBox) {
    if (button && button.disabled) return;

    var payload;
    try {
      payload = await buildPayload();
    } catch (_) {
      payload = { items: [] };
    }

    if (!payload.items.length) {
      if (errorBox) {
        errorBox.textContent = 'Ton panier semble vide. Recharge la page puis réessaie.';
        errorBox.style.display = 'block';
      }
      return;
    }

    var original = button ? button.innerHTML : '';
    if (button) {
      button.disabled = true;
      button.style.opacity = '.72';
      button.textContent = 'Ouverture de Klarna...';
    }
    if (errorBox) errorBox.style.display = 'none';

    var attemptId = newAttemptId();
    track('klarna_checkout_started', {
      cart_quantity: payload.items.reduce(function (sum, item) { return sum + item.quantity; }, 0),
    });

    try {
      var response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Checkout-Attempt': attemptId },
        body: JSON.stringify(payload),
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.url) throw new Error(data.error || 'Le paiement ne répond pas');
      track('klarna_checkout_ready');
      window.location.assign(data.url);
    } catch (error) {
      track('klarna_checkout_error', { message: String(error.message || 'unknown').slice(0, 120) });
      if (errorBox) {
        errorBox.textContent = String(error.message || 'Klarna est momentanément indisponible. Réessaie dans un instant.');
        errorBox.style.display = 'block';
      }
      if (button) {
        button.disabled = false;
        button.style.opacity = '1';
        button.innerHTML = original;
      }
    }
  }

  async function isPayPalAvailable() {
    try {
      var controller = window.AbortController ? new AbortController() : null;
      var timeout = window.setTimeout(function () {
        if (controller) controller.abort();
      }, 1200);
      var response = await fetch(PAYPAL_CONFIG_URL, {
        method: 'GET',
        signal: controller ? controller.signal : undefined,
      });
      window.clearTimeout(timeout);
      var data = await response.json().catch(function () { return {}; });
      return Boolean(response.ok && data.enabled);
    } catch (_) {
      return false;
    }
  }

  async function openPayPalCheckout(button, errorBox) {
    if (button && button.disabled) return;

    var payload;
    try {
      payload = await buildPayload();
    } catch (_) {
      payload = { items: [] };
    }

    if (!payload.items.length) {
      if (errorBox) {
        errorBox.textContent = 'Ton panier semble vide. Recharge la page puis réessaie.';
        errorBox.style.display = 'block';
      }
      return;
    }

    var original = button ? button.innerHTML : '';
    if (button) {
      button.disabled = true;
      button.style.opacity = '.72';
      button.textContent = 'Ouverture de PayPal...';
    }
    if (errorBox) errorBox.style.display = 'none';

    var attemptId = newAttemptId();
    track('paypal_checkout_started', {
      cart_quantity: payload.items.reduce(function (sum, item) { return sum + item.quantity; }, 0),
    });

    try {
      var response = await fetch(PAYPAL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Checkout-Attempt': attemptId },
        body: JSON.stringify(payload),
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.url) throw new Error(data.error || 'Le paiement PayPal ne répond pas');
      track('paypal_checkout_ready');
      window.location.assign(data.url);
    } catch (error) {
      track('paypal_checkout_error', { message: String(error.message || 'unknown').slice(0, 120) });
      if (errorBox) {
        errorBox.textContent = String(error.message || 'PayPal est momentanément indisponible. Utilise Klarna ou carte bancaire.');
        errorBox.style.display = 'block';
      }
      if (button) {
        button.disabled = false;
        button.style.opacity = '1';
        button.innerHTML = original;
      }
    }
  }

  function currentPageLabel() {
    var path = String(window.location.pathname || '/');
    var title = String(document.title || '').replace(/\s+/g, ' ').trim();
    if (/\/coaching/i.test(path)) return 'Page coaching';
    if (/\/product|\/produit|\/checkout|\/cart|\/panier/i.test(path)) return 'Page offre / panier';
    if (/\/blog|\/articles?/i.test(path)) return 'Article / contenu Achzod';
    return title ? title.slice(0, 80) : 'achzodcoaching.com';
  }

  function readUtmParams() {
    var params = new URLSearchParams(window.location.search || '');
    var utm = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (key) {
      var value = params.get(key);
      if (value) utm[key] = value.slice(0, 160);
    });
    return utm;
  }

  function buildCoachingWhatsAppMessage(data) {
    var lines = [
      'Salut Achzod, je viens de ton site coaching.',
      '',
      'Page : ' + currentPageLabel()
    ];
    if (data.goal) lines.push('Objectif : ' + data.goal);
    if (data.blocker) lines.push('Blocage : ' + data.blocker);
    if (data.urgency) lines.push('Timing : ' + data.urgency);
    if (data.email) lines.push('Email : ' + data.email);
    if (data.phone) lines.push('Tel : ' + data.phone);
    if (data.details) lines.push('Contexte : ' + data.details);
    lines.push('', 'Tu peux me dire si je dois partir sur coaching, APEXLABS ou les deux ?');
    return lines.join('\n');
  }

  function openCoachingWhatsApp(data) {
    window.open(
      'https://wa.me/971585210514?text=' + encodeURIComponent(buildCoachingWhatsAppMessage(data || {})),
      '_blank',
      'noopener,noreferrer'
    );
  }

  function trackCoachingLead(payload) {
    var safePayload = Object.assign({
      eventType: 'click',
      offer: 'Achzod Coaching',
      tier: 'coaching_direct',
      page: currentPageLabel(),
      placement: 'achzodcoaching_global',
      sourceUrl: String(window.location.href || '').slice(0, 500),
      referrer: String(document.referrer || '').slice(0, 500),
      utm: readUtmParams()
    }, payload || {});

    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', safePayload.eventType === 'form' ? 'generate_lead' : 'contact', {
          event_category: 'coaching_whatsapp',
          event_label: safePayload.placement,
          offer: safePayload.offer
        });
      }
    } catch (_) {}

    try {
      if (typeof window.fbq === 'function') {
        window.fbq('track', safePayload.eventType === 'form' ? 'Lead' : 'Contact', {
          content_name: safePayload.offer,
          content_category: 'coaching'
        });
      }
    } catch (_) {}

    try {
      fetch('https://apexlabs.achzodcoaching.com/api/track/whatsapp-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify(safePayload)
      }).catch(function () {});
    } catch (_) {}
  }

  function injectCoachingWhatsAppHub() {
    if (document.getElementById('achzod-coaching-whatsapp-hub')) return;

    var style = document.createElement('style');
    style.id = 'achzod-coaching-whatsapp-hub-styles';
    style.textContent = [
      '#achzod-coaching-whatsapp-hub{position:fixed;right:18px;bottom:18px;z-index:2147483000;font-family:proxima-nova,Arial,sans-serif;color:#fff}',
      '#achzod-coaching-whatsapp-hub *{box-sizing:border-box}',
      '#achzod-coaching-wa-card{display:none;width:min(360px,calc(100vw - 28px));margin-bottom:12px;border:1px solid rgba(255,255,255,.18);border-radius:16px;background:#101114;box-shadow:0 22px 60px rgba(0,0,0,.36);overflow:hidden}',
      '#achzod-coaching-wa-card.is-open{display:block}',
      '.achzod-coaching-wa-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 16px 10px;background:linear-gradient(135deg,#14181a,#102316)}',
      '.achzod-coaching-wa-kicker{margin:0 0 5px;color:#7cf4a8;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}',
      '.achzod-coaching-wa-title{margin:0;color:#fff;font-size:18px;font-weight:900;line-height:1.08}',
      '.achzod-coaching-wa-sub{margin:6px 0 0;color:rgba(255,255,255,.78);font-size:13px;line-height:1.35}',
      '.achzod-coaching-wa-close{width:30px;height:30px;border:0;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;font-size:20px;line-height:1;cursor:pointer}',
      '.achzod-coaching-wa-form{display:grid;gap:9px;padding:13px 16px 16px}',
      '.achzod-coaching-wa-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      '.achzod-coaching-wa-form input,.achzod-coaching-wa-form select,.achzod-coaching-wa-form textarea{width:100%;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:#181a1f;color:#fff;padding:11px 12px;font:600 13px proxima-nova,Arial,sans-serif;outline:none}',
      '.achzod-coaching-wa-form textarea{min-height:70px;resize:vertical}',
      '.achzod-coaching-wa-form input::placeholder,.achzod-coaching-wa-form textarea::placeholder{color:rgba(255,255,255,.46)}',
      '.achzod-coaching-wa-error{display:none;color:#ffb2b2;font-size:12px;font-weight:700;line-height:1.3}',
      '.achzod-coaching-wa-submit{border:0;border-radius:11px;background:#25d366;color:#07140b;padding:12px 14px;font-size:14px;font-weight:950;cursor:pointer;box-shadow:0 12px 26px rgba(37,211,102,.28)}',
      '.achzod-coaching-wa-pulse{display:flex;align-items:center;gap:10px;min-height:56px;border:0;border-radius:999px;background:#25d366;color:#07140b;padding:10px 16px 10px 12px;font-weight:950;box-shadow:0 16px 42px rgba(37,211,102,.34);cursor:pointer}',
      '.achzod-coaching-wa-pulse span:first-child{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.38);font-size:19px}',
      '.achzod-coaching-wa-pulse small{display:block;color:rgba(7,20,11,.72);font-size:11px;font-weight:800;text-align:left}',
      '.achzod-coaching-wa-pulse strong{display:block;font-size:14px;line-height:1;text-align:left}',
      '@media(max-width:520px){#achzod-coaching-whatsapp-hub{right:12px;bottom:12px}.achzod-coaching-wa-row{grid-template-columns:1fr}.achzod-coaching-wa-pulse{padding-right:14px}}'
    ].join('');
    document.head.appendChild(style);

    var hub = document.createElement('div');
    hub.id = 'achzod-coaching-whatsapp-hub';
    if (/\/checkout\/?$/.test(window.location.pathname || '')) {
      hub.style.bottom = '102px';
    }
    hub.innerHTML = [
      '<div id="achzod-coaching-wa-card" role="dialog" aria-label="Orientation coaching WhatsApp">',
      '<div class="achzod-coaching-wa-head">',
      '<div><p class="achzod-coaching-wa-kicker">Orientation gratuite</p>',
      '<p class="achzod-coaching-wa-title">Tu veux le coaching ? Envoie ton cas.</p>',
      '<p class="achzod-coaching-wa-sub">Laisse ton contact + ton blocage. Le message WhatsApp part deja structure pour te router vite.</p></div>',
      '<button type="button" class="achzod-coaching-wa-close" aria-label="Fermer">x</button>',
      '</div>',
      '<form class="achzod-coaching-wa-form">',
      '<div class="achzod-coaching-wa-row"><input name="email" type="email" placeholder="Email"><input name="phone" type="tel" placeholder="WhatsApp / tel"></div>',
      '<input name="goal" required placeholder="Objectif principal">',
      '<select name="blocker" required><option value="">Blocage principal</option><option>Perte de gras bloquee</option><option>Prise de muscle / recomp</option><option>Manque de cadre et suivi</option><option>Energie / sommeil / hormones</option><option>Je ne sais pas quoi choisir</option></select>',
      '<select name="urgency" required><option value="">Timing</option><option>Maintenant</option><option>Cette semaine</option><option>Ce mois-ci</option><option>Je compare encore</option></select>',
      '<textarea name="details" placeholder="Contexte rapide : niveau, poids, objectif, ce que tu as deja essaye"></textarea>',
      '<div class="achzod-coaching-wa-error">Laisse au moins ton email ou ton tel pour qu on puisse te relancer proprement.</div>',
      '<button type="submit" class="achzod-coaching-wa-submit">Envoyer sur WhatsApp</button>',
      '</form>',
      '</div>',
      '<button type="button" class="achzod-coaching-wa-pulse" aria-label="Contacter Achzod sur WhatsApp"><span>☎</span><span><small>Coaching Achzod</small><strong>Parler a Achzod</strong></span></button>'
    ].join('');
    document.body.appendChild(hub);

    var card = hub.querySelector('#achzod-coaching-wa-card');
    var pulse = hub.querySelector('.achzod-coaching-wa-pulse');
    var close = hub.querySelector('.achzod-coaching-wa-close');
    var form = hub.querySelector('form');
    var error = hub.querySelector('.achzod-coaching-wa-error');

    function setOpen(open) {
      card.classList.toggle('is-open', !!open);
    }

    pulse.addEventListener('click', function () {
      trackCoachingLead({ eventType: 'click', placement: 'achzodcoaching_floating_button' });
      setOpen(!card.classList.contains('is-open'));
    });
    close.addEventListener('click', function () { setOpen(false); });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = {
        email: String(form.email.value || '').trim(),
        phone: String(form.phone.value || '').trim(),
        goal: String(form.goal.value || '').trim(),
        blocker: String(form.blocker.value || '').trim(),
        urgency: String(form.urgency.value || '').trim(),
        details: String(form.details.value || '').trim()
      };
      if (!data.email && !data.phone) {
        error.style.display = 'block';
        return;
      }
      error.style.display = 'none';
      trackCoachingLead(Object.assign({
        eventType: 'form',
        placement: 'achzodcoaching_global_form',
        contactEmail: data.email
      }, data));
      openCoachingWhatsApp(data);
      setOpen(false);
    });

    try {
      if (!sessionStorage.getItem('achzod_coaching_whatsapp_prompted_v1')) {
        sessionStorage.setItem('achzod_coaching_whatsapp_prompted_v1', '1');
        window.setTimeout(function () { setOpen(true); }, 12000);
      }
    } catch (_) {
      window.setTimeout(function () { setOpen(true); }, 12000);
    }
  }

  // Neutralise aussi le PayPal natif Webflow sur les pages panier globales.
  removeLegacyButtons();
  var cleanupCount = 0;
  var cleanupTimer = window.setInterval(function () {
    removeLegacyButtons();
    cleanupCount += 1;
    if (cleanupCount >= 10) window.clearInterval(cleanupTimer);
  }, 1000);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectCoachingWhatsAppHub);
  else injectCoachingWhatsAppHub();

  if (!/\/checkout\/?$/.test(window.location.pathname)) return;

  // Recharge complète du checkout Webflow quand la page revient du cache
  // (bouton retour navigateur, retour depuis Stripe/Klarna). Force la lecture
  // du panier réel côté serveur Webflow au lieu du snapshot mis en cache.
  function setupBFCacheReload() {
    window.addEventListener('pageshow', function (event) {
      var navigation = window.performance && window.performance.getEntriesByType
        ? window.performance.getEntriesByType('navigation')[0]
        : null;
      if (event.persisted || (navigation && navigation.type === 'back_forward')) {
        window.location.reload();
      }
    });
  }

  async function mount() {
    purgeLegacyBackups();
    removeLegacyButtons();
    setupBFCacheReload();
    if (document.getElementById(BUTTON_ID)) return;
    trackPromotionForm();
    var paypalAvailable = await isPayPalAvailable();

    var wrap = document.createElement('div');
    wrap.id = BUTTON_ID;
    wrap.setAttribute('style', 'position:fixed;bottom:0;left:0;right:0;z-index:99999;padding:12px 15px;background:#FFB3C7;box-shadow:0 -4px 18px rgba(0,0,0,.25)');
    wrap.innerHTML = '<div style="width:100%;max-width:520px;margin:0 auto;display:grid;grid-template-columns:' + (paypalAvailable ? '1fr 1fr' : '1fr') + ';gap:10px"><button type="button" class="ac-klarna-btn" style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:15px 14px;background:#0A0B09;color:#fff;font-weight:800;font-size:15px;border:0;border-radius:10px;cursor:pointer"><img src="https://x.klarnacdn.net/payment-method/assets/badges/generic/klarna.svg" alt="Klarna" style="height:22px">Klarna 3x</button>' + (paypalAvailable ? '<button type="button" class="ac-paypal-btn" style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:15px 14px;background:#fff;color:#003087;font-weight:800;font-size:15px;border:0;border-radius:10px;cursor:pointer"><img src="https://www.paypalobjects.com/webstatic/icon/pp258.png" alt="PayPal" style="height:20px">PayPal</button>' : '') + '</div><div role="alert" aria-live="polite" style="display:none;max-width:520px;margin:8px auto 0;color:#0A0B09;font-size:13px;font-weight:700;text-align:center"></div>';
    document.body.appendChild(wrap);
    document.body.style.paddingBottom = '90px';

    var klarnaButton = wrap.querySelector('.ac-klarna-btn');
    var paypalButton = wrap.querySelector('.ac-paypal-btn');
    var errorBox = wrap.querySelector('[role="alert"]');
    window.klarnaGo = function () {
      return openKlarnaCheckout(klarnaButton, errorBox);
    };
    window.paypalGo = function () {
      return openPayPalCheckout(paypalButton, errorBox);
    };
    klarnaButton.addEventListener('click', function () {
      return openKlarnaCheckout(klarnaButton, errorBox);
    });
    if (paypalButton) paypalButton.addEventListener('click', function () {
      return openPayPalCheckout(paypalButton, errorBox);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
