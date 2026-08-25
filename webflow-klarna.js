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

  // Neutralise aussi le PayPal natif Webflow sur les pages panier globales.
  removeLegacyButtons();
  var cleanupCount = 0;
  var cleanupTimer = window.setInterval(function () {
    removeLegacyButtons();
    cleanupCount += 1;
    if (cleanupCount >= 10) window.clearInterval(cleanupTimer);
  }, 1000);

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
