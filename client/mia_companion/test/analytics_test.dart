import 'package:flutter_test/flutter_test.dart';
import 'package:mia_companion/config.dart';
import 'package:mia_companion/services/analytics.dart';
import 'package:mia_companion/services/mixpanel_service.dart';

void main() {
  test('mixpanel token is configured', () {
    expect(mixpanelToken, isNotEmpty);
    expect(MixpanelService.instance.isEnabled, isTrue);
  });

  test('analytics event catalog is non-empty', () {
    expect(AnalyticsEvents.pageViewed, isNotEmpty);
    expect(AnalyticsEvents.paywallShown, isNotEmpty);
    expect(AnalyticsEvents.freeMessageLimitReached, isNotEmpty);
  });
}
