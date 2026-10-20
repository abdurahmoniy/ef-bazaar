package uz.efbazaar.marketplace.analytics.seller;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class SellerAnalyticsCsvTest {
  @ParameterizedTest
  @ValueSource(
      strings = {" =1", "\t+1", "\r@a", "\n-1", "\u00a0=1", "\u2003=1", "\u0001=1", "=1\u2028tail"})
  void spreadsheetFormulasRemainProtectedAfterUnicodeWhitespaceAndControls(String title) {
    assertThat(SellerAnalyticsService.cell(title)).startsWith("\"'");
  }
}
