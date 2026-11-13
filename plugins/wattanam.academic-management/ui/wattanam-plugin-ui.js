/*
 * Wattanam plugin UI client (protocol "wattanam.plugin-ui/1").
 *
 * Copy this file into your plugin's ui/ folder and load it before your own script:
 *   <script src="wattanam-plugin-ui.js"></script><script src="app.js"></script>
 *
 * Your screen runs in a sandboxed iframe: it has no network access and no access to the school's
 * cookies or page. Everything goes through the host:
 *
 *   const host = await WattanamPluginUI.connect();      // { pluginId, pluginVersion, params, language, theme }
 *   const rows = await WattanamPluginUI.api.get('sessions');
 *   await WattanamPluginUI.api.post('sessions', { ... });
 *   WattanamPluginUI.navigate('settings');              // another page of this plugin
 *   WattanamPluginUI.navigate('attendance', { classId: id });   // ...with a query (core 0.1.34+); read it as host.query
 *   WattanamPluginUI.autoResize();                       // keep the frame as tall as the content
 *
 * Devices (school core 0.1.33+, and only when the page declares them in options.devices):
 *   WattanamPluginUI.scanner.start({ onResult: (text) => ..., onClose: () => ..., onError: (message) => ... });
 *   WattanamPluginUI.scanner.stop();
 *   const position = await WattanamPluginUI.location();  // { latitude, longitude, accuracy }
 * The school page runs the camera and shows it above your screen; you receive only decoded text.
 *
 * API calls go to YOUR plugin's API only (paths are relative, e.g. 'classes/42'); they run as the
 * signed-in user and your routes' permissions apply. Failed calls reject with an Error that has
 * .status and .body.
 */
(function (global) {
  'use strict';
  var PROTOCOL = 'wattanam.plugin-ui/1';
  var pending = {};
  var counter = 0;
  var context = null;
  var waiting = [];
  var scanHandlers = null;

  function send(message) {
    message.protocol = PROTOCOL;
    global.parent.postMessage(message, '*');
  }

  global.addEventListener('message', function (event) {
    if (event.source !== global.parent || !event.data || event.data.protocol !== PROTOCOL) return;
    var data = event.data;
    if (data.type === 'init') {
      context = { pluginId: data.pluginId, pluginVersion: data.pluginVersion, params: data.params || {}, language: data.language || 'en', theme: data.theme || {}, devices: Array.isArray(data.devices) ? data.devices : [], query: data.query && typeof data.query === 'object' ? data.query : {} };
      applyTheme(context.theme);
      waiting.splice(0).forEach(function (resolve) { resolve(context); });
    } else if (data.type === 'scan-result' && scanHandlers) {
      if (typeof scanHandlers.onResult === 'function' && typeof data.text === 'string') scanHandlers.onResult(data.text);
    } else if ((data.type === 'scan-closed' || data.type === 'scan-error') && scanHandlers) {
      var handlers = scanHandlers;
      scanHandlers = null;
      if (data.type === 'scan-error' && typeof handlers.onError === 'function') handlers.onError(String(data.message || 'The scanner could not start.'));
      if (typeof handlers.onClose === 'function') handlers.onClose();
    } else if (data.type === 'response' && pending[data.id]) {
      var entry = pending[data.id];
      delete pending[data.id];
      clearTimeout(entry.timer);
      if (data.status >= 200 && data.status < 300) entry.resolve(data.body);
      else {
        var body = data.body || {};
        var text = Array.isArray(body.message) ? body.message.join(' ') : body.message;
        var error = new Error(text || ('Request failed (' + data.status + ')'));
        error.status = data.status; error.body = body;
        entry.reject(error);
      }
    }
  });

  function applyTheme(theme) {
    var root = global.document.documentElement.style;
    Object.keys(theme || {}).forEach(function (key) {
      if (typeof theme[key] === 'string' && theme[key]) root.setProperty('--host-' + key.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }), theme[key]);
    });
  }

  function connect() {
    if (context) return Promise.resolve(context);
    var promise = new Promise(function (resolve) { waiting.push(resolve); });
    send({ type: 'ready' });
    return promise;
  }

  function request(method, path, body, query) {
    return new Promise(function (resolve, reject) {
      var id = 'r' + (++counter) + '_' + Date.now().toString(36);
      var timer = setTimeout(function () {
        if (!pending[id]) return;
        delete pending[id];
        var error = new Error('The school did not answer this request (unsafe path, or the screen was closed).');
        error.status = 0; reject(error);
      }, 30000);
      pending[id] = { resolve: resolve, reject: reject, timer: timer };
      var message = { type: 'request', id: id, method: method, path: String(path).replace(/^\/+/, '') };
      if (query) message.query = query;
      if (body !== undefined) message.body = body;
      send(message);
    });
  }

  // One position from the school page (the sandbox has no location API of its own).
  function location() {
    return new Promise(function (resolve, reject) {
      var id = 'l' + (++counter) + '_' + Date.now().toString(36);
      var timer = setTimeout(function () {
        if (!pending[id]) return;
        delete pending[id];
        var error = new Error('Location is unavailable (school core older than 0.1.33, or no answer).');
        error.status = 0; reject(error);
      }, 15000);
      pending[id] = { resolve: resolve, reject: reject, timer: timer };
      send({ type: 'location', id: id });
    });
  }

  var scanner = {
    // handlers: { onResult(text), onClose(), onError(message) }. Starting again replaces them.
    start: function (handlers) { scanHandlers = handlers || {}; send({ type: 'scan-start' }); },
    stop: function () { send({ type: 'scan-stop' }); },
    active: function () { return scanHandlers !== null; },
  };

  function autoResize() {
    // Measure the content, not the document: inside an iframe documentElement.scrollHeight is never
    // smaller than the frame itself, so the frame could grow but never shrink back.
    var report = function () {
      var body = global.document.body;
      var style = global.getComputedStyle(body);
      var height = body.getBoundingClientRect().height + parseFloat(style.marginTop || '0') + parseFloat(style.marginBottom || '0');
      send({ type: 'resize', height: Math.ceil(height) });
    };
    if (global.ResizeObserver) new global.ResizeObserver(report).observe(global.document.body);
    global.addEventListener('load', report);
    report();
  }

  global.WattanamPluginUI = {
    connect: connect,
    context: function () { return context; },
    api: {
      get: function (path, query) { return request('GET', path, undefined, query); },
      post: function (path, body) { return request('POST', path, body); },
      put: function (path, body) { return request('PUT', path, body); },
      patch: function (path, body) { return request('PATCH', path, body); },
      delete: function (path, body) { return request('DELETE', path, body); },
    },
    // query (optional, school core 0.1.34+): plain values the opened page reads from context.query.
    navigate: function (routePath, query) { var message = { type: 'navigate', routePath: routePath }; if (query) message.query = query; send(message); },
    autoResize: autoResize,
    scanner: scanner,
    location: location,
  };
})(window);
