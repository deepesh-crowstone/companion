import 'package:flutter_test/flutter_test.dart';
import 'package:mia_companion/main.dart';

void main() {
  testWidgets('app boots', (WidgetTester tester) async {
    await tester.pumpWidget(const MiaApp());
    await tester.pump();
    expect(find.byType(MiaApp), findsOneWidget);
  });
}
