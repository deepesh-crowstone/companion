import 'dart:js_interop';
import 'dart:js_interop_unsafe';

/// On web the `posthog_flutter` plugin does not initialize posthog-js — it only
/// forwards calls to a `window.posthog` instance. That instance is created by
/// the loader snippet in `web/index.html`; here we call `init()` on it with the
/// project key configured via `--dart-define`, so web and mobile share a single
/// source of truth for the PostHog configuration.
@JS('window.posthog')
external _PosthogJs? get _posthog;

extension type _PosthogJs._(JSObject _) implements JSObject {
  external void init(String token, JSAny config);
}

void initPosthogWeb({
  required String apiKey,
  required String host,
  String proxyPath = '',
}) {
  final ph = _posthog;
  if (ph == null) return;

  // When a first-party proxy path is set, posthog-js talks to it (so blockers
  // can't drop events) and `ui_host` must point at the real PostHog app for the
  // toolbar / replay links to work. Otherwise talk to the ingest host directly.
  final useProxy = proxyPath.isNotEmpty;
  final config = JSObject()
    ..['api_host'] = (useProxy ? proxyPath : host).toJS
    ..['person_profiles'] = 'identified_only'.toJS
    ..['capture_pageview'] = true.toJS
    ..['capture_pageleave'] = true.toJS;
  if (useProxy) {
    config['ui_host'] = host.replaceFirst('.i.posthog.com', '.posthog.com').toJS;
  }

  ph.init(apiKey, config);
}
