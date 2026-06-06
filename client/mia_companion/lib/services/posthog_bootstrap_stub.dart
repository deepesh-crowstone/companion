/// Mobile/desktop no-op. On these platforms PostHog is initialized by the
/// native SDK through `Posthog().setup()`, so there is nothing extra to do.
/// (Mobile is not subject to browser ad-blockers, so it ignores [proxyPath].)
void initPosthogWeb({
  required String apiKey,
  required String host,
  String proxyPath = '',
}) {}
