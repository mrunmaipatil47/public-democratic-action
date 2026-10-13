/*
  Progressive enhancement for the generated site. Every page is complete without
  this file: it only adds (1) client-side filtering on issues/index.html, with the
  result count announced through an aria-live region and the filter state kept in
  the query string, and (2) a "Copy" button for the invitation on contribute.html.
  No network requests are made.
*/
(function () {
  'use strict';

  var doc = document;
  doc.documentElement.classList.add('js');

  function normalise(text) {
    return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function setupIssueFilter() {
    var form = doc.getElementById('issue-filter');
    var count = doc.getElementById('issue-count');
    if (!form || !count) return;

    var rows = Array.prototype.slice.call(doc.querySelectorAll('[data-issue-row]'));
    var groups = Array.prototype.slice.call(doc.querySelectorAll('[data-domain-group]'));
    var domainSelect = form.elements.domain;
    var routeSelect = form.elements.route;
    var textInput = form.elements.q;
    if (!domainSelect || !routeSelect || !textInput) return;

    var template = count.getAttribute('data-template') || '{shown} / {total}';
    var noneText = count.getAttribute('data-none') || '';
    var total = rows.length;

    function apply(updateUrl) {
      var domain = domainSelect.value;
      var route = routeSelect.value;
      var words = normalise(textInput.value).split(' ').filter(Boolean);
      var shown = 0;

      rows.forEach(function (row) {
        var text = row.getAttribute('data-text') || '';
        var routes = ' ' + (row.getAttribute('data-routes') || '') + ' ';
        var visible =
          (!domain || row.getAttribute('data-domain') === domain) &&
          (!route || routes.indexOf(' ' + route + ' ') !== -1) &&
          words.every(function (word) {
            return text.indexOf(word) !== -1;
          });
        row.hidden = !visible;
        if (visible) shown += 1;
      });

      groups.forEach(function (group) {
        group.hidden = !group.querySelector('[data-issue-row]:not([hidden])');
      });

      count.textContent = shown
        ? template.replace('{shown}', String(shown)).replace('{total}', String(total))
        : noneText;

      if (updateUrl && window.history && typeof window.history.replaceState === 'function') {
        var params = new URLSearchParams();
        if (domain) params.set('domain', domain);
        if (route) params.set('route', route);
        if (words.length) params.set('q', textInput.value.trim());
        var query = params.toString();
        window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
      }
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      apply(true);
    });
    form.addEventListener('input', function () {
      apply(true);
    });
    form.addEventListener('change', function () {
      apply(true);
    });
    form.addEventListener('reset', function () {
      window.setTimeout(function () {
        apply(true);
      }, 0);
    });

    // Read the query string on load so filtered links (…?route=A) work.
    var initial = new URLSearchParams(window.location.search);
    if (initial.get('domain')) domainSelect.value = initial.get('domain');
    if (initial.get('route')) routeSelect.value = initial.get('route');
    if (initial.get('q')) textInput.value = initial.get('q');
    apply(false);
  }

  function setupCopyButton() {
    var quote = doc.getElementById('invitation');
    var actions = doc.getElementById('invitation-actions');
    if (!quote || !actions) return;

    var button = doc.createElement('button');
    button.type = 'button';
    button.textContent = quote.getAttribute('data-copy-label') || 'Copy';

    var status = doc.createElement('p');
    status.className = 'status-message';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    actions.appendChild(button);
    actions.appendChild(status);

    function invitationText() {
      var paragraphs = Array.prototype.map.call(quote.querySelectorAll('p'), function (p) {
        return p.textContent.replace(/\s+/g, ' ').trim();
      });
      return paragraphs.join('\n\n');
    }

    function selectQuote() {
      try {
        var range = doc.createRange();
        range.selectNodeContents(quote);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      } catch (error) {
        /* selection is a convenience only */
      }
    }

    function done() {
      status.textContent = quote.getAttribute('data-copied') || 'Copied.';
    }

    function failed() {
      status.textContent = quote.getAttribute('data-failed') || 'Copy failed.';
      selectQuote();
    }

    button.addEventListener('click', function () {
      var text = invitationText();
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(done, failed);
      } else {
        failed();
      }
    });
  }

  function init() {
    setupIssueFilter();
    setupCopyButton();
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
