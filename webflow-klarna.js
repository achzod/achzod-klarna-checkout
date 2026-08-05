(function () {
  'use strict';

  if (!/\/checkout\/?$/.test(window.location.pathname)) return;

  var API_URL = 'https://achzod-klarna-checkout.onrender.com/checkout-klarna';
  var BUTTON_ID = 'achzod-klarna-checkout';
  var LEGACY_IDS = ['klarna-fixed-btn', 'ac-klarna-fixed', 'ac-klarna-btn'];

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

  function readDomItems() {
    return Array.prototype.map.call(
      document.querySelectorAll('.w-commerce-commercecheckoutorderitem'),
      function (row) {
        var nameNode = row.querySelector('.w-commerce-commercecheckoutorderitemdescriptionwrapper');
        var priceNode = row.querySelector('.w-commerce-commercecheckoutorderitemprice');
        var name = nameNode ? nameNode.textContent.trim() : '';
        var price = parseEuro(priceNode ? priceNode.textContent : row.textContent);
        return name && price ? { name: name.slice(0, 120), price: price, quantity: parseQuantity(row) } : null;
      }
    ).filter(Boolean);
  }

  function readBackupItems() {
    try {
      var raw = localStorage.getItem('achzod_cart_backup');
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(function (item) {
        return {
          name: String(item.name || '').slice(0, 120),
          price: Number(item.price),
          quantity: Number(item.quantity) || 1,
        };
      }).filter(function (item) { return item.name && item.price > 0; }) : [];
    } catch (_) {
      return [];
    }
  }

  function readPayload() {
    var items = readDomItems();
    if (!items.length) items = readBackupItems();
    var totalNode = document.querySelector('.w-commerce-commercecheckoutsummarytotal');
    var totalAmount = parseEuro(totalNode ? totalNode.textContent : '');
    var emailNode = document.querySelector('input[type="email"]');
    var payload = {
      items: items,
      customerEmail: emailNode ? emailNode.value : '',
      successUrl: 'https://achzodcoaching.com/order-confirmation',
      cancelUrl: 'https://achzodcoaching.com/checkout',
    };
    if (totalAmount) payload.totalAmount = totalAmount;
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
  }

  function mount() {
    removeLegacyButtons();
    if (document.getElementById(BUTTON_ID)) return;

    var wrap = document.createElement('div');
    wrap.id = BUTTON_ID;
    wrap.setAttribute('style', 'position:fixed;bottom:0;left:0;right:0;z-index:99999;padding:12px 15px;background:#FFB3C7;box-shadow:0 -4px 18px rgba(0,0,0,.25)');
    wrap.innerHTML = '<button type="button" style="width:100%;max-width:520px;margin:0 auto;display:flex;align-items:center;justify-content:center;gap:10px;padding:15px 20px;background:#0A0B09;color:#fff;font-weight:800;font-size:16px;border:0;border-radius:10px;cursor:pointer"><img src="https://x.klarnacdn.net/payment-method/assets/badges/generic/klarna.svg" alt="Klarna" style="height:22px">Payer en 3x avec Klarna</button><div role="alert" aria-live="polite" style="display:none;max-width:520px;margin:8px auto 0;color:#0A0B09;font-size:13px;font-weight:700;text-align:center"></div>';
    document.body.appendChild(wrap);
    document.body.style.paddingBottom = '90px';

    var button = wrap.querySelector('button');
    var errorBox = wrap.querySelector('[role="alert"]');
    button.addEventListener('click', async function () {
      if (button.disabled) return;
      var payload = readPayload();
      if (!payload.items.length) {
        errorBox.textContent = 'Ton panier semble vide. Recharge la page puis réessaie.';
        errorBox.style.display = 'block';
        return;
      }

      var original = button.innerHTML;
      button.disabled = true;
      button.style.opacity = '.72';
      button.textContent = 'Ouverture de Klarna...';
      errorBox.style.display = 'none';
      var attemptId = newAttemptId();
      track('klarna_checkout_started', { cart_quantity: payload.items.reduce(function (sum, item) { return sum + item.quantity; }, 0) });

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
        errorBox.textContent = String(error.message || 'Klarna est momentanément indisponible. Réessaie dans un instant.');
        errorBox.style.display = 'block';
        button.disabled = false;
        button.style.opacity = '1';
        button.innerHTML = original;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
  var cleanupCount = 0;
  var cleanupTimer = window.setInterval(function () {
    removeLegacyButtons();
    cleanupCount += 1;
    if (cleanupCount >= 10) window.clearInterval(cleanupTimer);
  }, 1000);
})();
