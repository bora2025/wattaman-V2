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
 *   host.permissions                                    // this user's granted permissions of the plugin (newer cores; null on older ones)
 *
 * Devices (school core 0.1.33+, and only when the page declares them in options.devices):
 *   WattanamPluginUI.scanner.start({ onResult: (text) => ..., onClose: () => ..., onError: (message) => ... });
 *   WattanamPluginUI.scanner.stop();
 *   const position = await WattanamPluginUI.location();  // { latitude, longitude, accuracy }
 *   const deviceId = await WattanamPluginUI.deviceId();  // per-plugin browser identifier (core 0.1.35+, devices: device-id)
 * The school page runs the camera and shows it above your screen; you receive only decoded text.
 *
 * More devices (school core with the station bridges; declare them in options.devices):
 *   face:    WattanamPluginUI.face.start({ mode: 'identify' | 'enroll', title, liveness: true, samples: 3,
 *              onResult: (r) => ..., onError, onClose })   r = { mode, descriptors: [[128 numbers], ...],
 *              quality: { score, size }, liveness: { passed, challenge }, modelVersion } — never an image.
 *            WattanamPluginUI.face.stop(); feedback / activity as for the scanner's station.
 *            The plugin must declare "biometric-data" in operational.dataClassification.
 *   nfc:     WattanamPluginUI.nfc.start({ onRead: (serialNumber) => ..., onError, onClose }); .stop()
 *            (Web NFC: Chrome on Android; USB readers type like a keyboard and need no device).
 *   storage: await WattanamPluginUI.storage.get(key) / .set(key, value) / .remove(key) / .keys()
 *            (JSON values on this device for this plugin; at most 256 KiB each, 1 MiB in all).
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
  var faceHandlers = null;
  var nfcHandlers = null;

  function send(message) {
    message.protocol = PROTOCOL;
    global.parent.postMessage(message, '*');
  }

  global.addEventListener('message', function (event) {
    if (event.source !== global.parent || !event.data || event.data.protocol !== PROTOCOL) return;
    var data = event.data;
    if (data.type === 'init') {
      context = { pluginId: data.pluginId, pluginVersion: data.pluginVersion, params: data.params || {}, language: data.language || 'en', theme: data.theme || {}, devices: Array.isArray(data.devices) ? data.devices : [], query: data.query && typeof data.query === 'object' ? data.query : {}, permissions: Array.isArray(data.permissions) ? data.permissions : null };
      applyTheme(context.theme);
      waiting.splice(0).forEach(function (resolve) { resolve(context); });
    } else if (data.type === 'scan-result' && scanHandlers) {
      if (typeof scanHandlers.onResult === 'function' && typeof data.text === 'string') scanHandlers.onResult(data.text);
    } else if ((data.type === 'scan-closed' || data.type === 'scan-error') && scanHandlers) {
      var handlers = scanHandlers;
      scanHandlers = null;
      if (data.type === 'scan-error' && typeof handlers.onError === 'function') handlers.onError(String(data.message || 'The scanner could not start.'));
      if (typeof handlers.onClose === 'function') handlers.onClose();
    } else if (data.type === 'face-result' && faceHandlers) {
      if (typeof faceHandlers.onResult === 'function' && data.result && typeof data.result === 'object') faceHandlers.onResult(data.result);
    } else if ((data.type === 'face-closed' || data.type === 'face-error') && faceHandlers) {
      var face = faceHandlers;
      faceHandlers = null;
      if (data.type === 'face-error' && typeof face.onError === 'function') face.onError(String(data.message || 'The camera could not start.'));
      if (typeof face.onClose === 'function') face.onClose();
    } else if (data.type === 'nfc-result' && nfcHandlers) {
      if (typeof nfcHandlers.onRead === 'function' && typeof data.serialNumber === 'string') nfcHandlers.onRead(data.serialNumber);
    } else if ((data.type === 'nfc-closed' || data.type === 'nfc-error') && nfcHandlers) {
      var nfc = nfcHandlers;
      nfcHandlers = null;
      if (data.type === 'nfc-error' && typeof nfc.onError === 'function') nfc.onError(String(data.message || 'NFC could not start.'));
      if (typeof nfc.onClose === 'function') nfc.onClose();
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

  function request(method, path, body, query, plugin) {
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
      if (plugin) message.plugin = plugin;
      if (query) message.query = query;
      if (body !== undefined) message.body = body;
      send(message);
    });
  }

  // A request answered by the school page itself (not the plugin API).
  function hostRequest(type, prefix, unavailable, extra) {
    return new Promise(function (resolve, reject) {
      var id = prefix + (++counter) + '_' + Date.now().toString(36);
      var timer = setTimeout(function () {
        if (!pending[id]) return;
        delete pending[id];
        var error = new Error(unavailable);
        error.status = 0; reject(error);
      }, 15000);
      pending[id] = { resolve: resolve, reject: reject, timer: timer };
      var message = { type: type, id: id };
      Object.keys(extra || {}).forEach(function (key) { message[key] = extra[key]; });
      send(message);
    });
  }

  // This browser's identifier for this plugin (the sandbox has no storage of its own). pluginId (optional,
  // school core 0.1.36+): a partner's identifier, for devices registered with that plugin (options.apis).
  function deviceId(pluginId) {
    return hostRequest('device-id', 'd', 'Device identifier is unavailable (school core older than 0.1.35, or no answer).', pluginId ? { plugin: pluginId } : undefined).then(function (body) { return body && body.deviceId; });
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
    // layout: 'station' shows the school's full-screen camera station; title names it.
    start: function (handlers) {
      scanHandlers = handlers || {};
      var message = { type: 'scan-start' };
      if (scanHandlers.layout === 'station') message.layout = 'station';
      if (scanHandlers.title) message.title = String(scanHandlers.title);
      send(message);
    },
    // Station layout only: the status bubble under the scan box (tone: info|success|warning|error).
    feedback: function (tone, message) { send({ type: 'scan-feedback', tone: tone, message: String(message || '') }); },
    // Station layout only: the side list. items: [{ title, detail?, tone, initials? }] (plain text).
    activity: function (items, title) { var message = { type: 'scan-activity', items: items || [] }; if (title) message.title = String(title); send(message); },
    stop: function () { send({ type: 'scan-stop' }); },
    active: function () { return scanHandlers !== null; },
  };

  // Faces: the school page runs the camera and the face model and returns face vectors only.
  var face = {
    start: function (handlers) {
      faceHandlers = handlers || {};
      var message = { type: 'face-start', mode: faceHandlers.mode === 'enroll' ? 'enroll' : 'identify', liveness: faceHandlers.liveness !== false };
      if (faceHandlers.title) message.title = String(faceHandlers.title);
      if (faceHandlers.samples) message.samples = Number(faceHandlers.samples);
      send(message);
    },
    stop: function () { send({ type: 'face-stop' }); },
    feedback: function (tone, message) { send({ type: 'scan-feedback', tone: tone, message: String(message || '') }); },
    activity: function (items, title) { var message = { type: 'scan-activity', items: items || [] }; if (title) message.title = String(title); send(message); },
    active: function () { return faceHandlers !== null; },
  };
  // NFC cards through the school page (Web NFC, Chrome on Android).
  var nfc = {
    start: function (handlers) { nfcHandlers = handlers || {}; send({ type: 'nfc-start' }); },
    stop: function () { send({ type: 'nfc-stop' }); },
    active: function () { return nfcHandlers !== null; },
  };
  // A small store on this device for this plugin (the sandbox has no storage of its own).
  function store(op, key, value) {
    var extra = { op: op }; if (key !== undefined) extra.key = key; if (value !== undefined) extra.value = value;
    return hostRequest('storage', 's', 'Device storage is unavailable (school core without the storage device, or no answer).', extra)
      .then(function (body) { return body ? body.value : undefined; });
  }
  var storage = {
    get: function (key) { return store('get', key); },
    set: function (key, value) { return store('set', key, value); },
    remove: function (key) { return store('remove', key); },
    keys: function () { return store('keys'); },
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
    // A partner plugin's API and pages (school core 0.2+): the page lists the partner in options.apis and
    // the partner's routes list this plugin as a caller. Same calls as api, plus navigate.
    partner: function (pluginId) {
      return {
        get: function (path, query) { return request('GET', path, undefined, query, pluginId); },
        post: function (path, body) { return request('POST', path, body, undefined, pluginId); },
        put: function (path, body) { return request('PUT', path, body, undefined, pluginId); },
        patch: function (path, body) { return request('PATCH', path, body, undefined, pluginId); },
        delete: function (path, body) { return request('DELETE', path, body, undefined, pluginId); },
        navigate: function (routePath, query) { var message = { type: 'navigate', routePath: routePath, plugin: pluginId }; if (query) message.query = query; send(message); },
      };
    },
    autoResize: autoResize,
    scanner: scanner,
    location: location,
    deviceId: deviceId,
    face: face,
    nfc: nfc,
    storage: storage,
  };
})(window);
