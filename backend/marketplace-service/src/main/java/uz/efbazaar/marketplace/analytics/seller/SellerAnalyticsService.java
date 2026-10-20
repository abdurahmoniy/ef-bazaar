package uz.efbazaar.marketplace.analytics.seller;

import java.sql.*;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.plan.PlanProjection;

@Service
public class SellerAnalyticsService {
  private static final ZoneId ZONE = ZoneId.of("Asia/Samarkand");
  private final JdbcTemplate jdbc;
  private final PlanProjection plans;
  private final Clock clock;

  @org.springframework.beans.factory.annotation.Autowired
  public SellerAnalyticsService(JdbcTemplate jdbc, PlanProjection plans) {
    this(jdbc, plans, Clock.systemUTC());
  }

  SellerAnalyticsService(JdbcTemplate jdbc, PlanProjection plans, Clock clock) {
    this.jdbc = jdbc;
    this.plans = plans;
    this.clock = clock;
  }

  public record Capabilities(String status, Integer historyDays, boolean exportEnabled) {}

  public record Coverage(
      @com.fasterxml.jackson.annotation.JsonFormat(
              shape = com.fasterxml.jackson.annotation.JsonFormat.Shape.STRING)
          Instant collectionStartedAt,
      String timezone,
      String views,
      String saves,
      String inquiries,
      String trades,
      boolean historyPartial) {}

  public record Summary(
      long listingCount,
      long uniqueViews,
      long currentFavorites,
      long inquiries,
      Capabilities capabilities,
      Coverage coverage) {}

  public record Metrics(
      long uniqueViews,
      long saveAdditions,
      long inquiries,
      long completedTrades,
      String grossSalesUzs) {}

  public record Day(
      @com.fasterxml.jackson.annotation.JsonFormat(
              shape = com.fasterxml.jackson.annotation.JsonFormat.Shape.STRING)
          LocalDate date,
      long uniqueViews,
      long saveAdditions,
      long inquiries,
      long completedTrades,
      String grossSalesUzs) {}

  public record ListingRow(
      UUID listingId,
      String title,
      String status,
      long uniqueViews,
      long saveAdditions,
      long inquiries,
      long completedTrades,
      String grossSalesUzs) {}

  public record Report(
      int days,
      @com.fasterxml.jackson.annotation.JsonFormat(
              shape = com.fasterxml.jackson.annotation.JsonFormat.Shape.STRING)
          LocalDate fromDate,
      @com.fasterxml.jackson.annotation.JsonFormat(
              shape = com.fasterxml.jackson.annotation.JsonFormat.Shape.STRING)
          LocalDate toDate,
      Coverage coverage,
      Metrics totals,
      List<Day> daily,
      List<ListingRow> listings,
      int page,
      int size,
      long totalListings) {}

  private static MarketplaceException error(HttpStatus status, String code) {
    return new MarketplaceException(status, code, code);
  }

  public Capabilities capabilities(UUID owner) {
    var s = plans.readCapabilities(owner);
    var g = s.grants();
    if (!s.subscriptionFresh()
        || !s.planFresh()
        || !g.containsKey("analytics.history_days")
        || !g.containsKey("analytics.export")) return new Capabilities("UNAVAILABLE", 0, false);
    String h = g.get("analytics.history_days"), e = g.get("analytics.export");
    if (!"true".equals(e) && !"false".equals(e)) return new Capabilities("UNAVAILABLE", 0, false);
    Integer limit;
    try {
      limit = h == null ? null : Integer.valueOf(h);
      if (limit == null && !"STAFF".equals(s.planCode())
          || limit != null && (limit < 0 || !h.matches("[0-9]+")))
        throw new IllegalArgumentException();
    } catch (IllegalArgumentException ex) {
      return new Capabilities("UNAVAILABLE", 0, false);
    }
    return new Capabilities(
        limit != null && limit == 0 ? "DENIED" : "AVAILABLE", limit, "true".equals(e));
  }

  private void authorize(UUID owner, int days, boolean export) {
    if (days != 7 && days != 30 && days != 90)
      throw error(HttpStatus.BAD_REQUEST, "analytics_invalid_days");
    var c = capabilities(owner);
    if (c.status().equals("UNAVAILABLE"))
      throw error(HttpStatus.SERVICE_UNAVAILABLE, "analytics_policy_unavailable");
    if (c.status().equals("DENIED")
        || c.historyDays() != null && c.historyDays() < days
        || export && !c.exportEnabled())
      throw error(HttpStatus.FORBIDDEN, "analytics_upgrade_required");
  }

  private Coverage coverage() {
    return coverage(null);
  }

  private Coverage coverage(LocalDate start) {
    Instant collectionStart =
        jdbc.queryForObject("SELECT started_at FROM seller_analytics_collection", Timestamp.class)
            .toInstant();
    return new Coverage(
        collectionStart,
        ZONE.toString(),
        "FIRST_UNIQUE_WITH_EXISTING_HISTORY",
        "ADDITIONS_SINCE_COLLECTION",
        "FIRST_REQUEST_WITH_EXISTING_HISTORY",
        "COMPLETIONS_SINCE_COLLECTION",
        start == null || start.atStartOfDay(ZONE).toInstant().isBefore(collectionStart));
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public Summary summary(UUID owner) {
    return jdbc.queryForObject(
        """
WITH own AS (SELECT id FROM listings WHERE seller_id=? AND status IN ('ACTIVE','SOLD'))
SELECT (SELECT count(*) FROM own) listing_count,
 (SELECT count(*) FROM seller_analytics_facts v JOIN own o ON o.id=v.listing_id WHERE v.seller_id=? AND v.metric='VIEW' AND v.occurred_at<=statement_timestamp()) views,
 (SELECT count(*) FROM listing_likes f JOIN own o ON o.id=f.listing_id WHERE f.user_id<>? AND f.created_at<=statement_timestamp()) favorites,
 (SELECT count(*) FROM seller_analytics_facts r JOIN own o ON o.id=r.listing_id WHERE r.seller_id=? AND r.metric='INQUIRY' AND r.occurred_at<=statement_timestamp()) inquiries
""",
        (rs, n) ->
            new Summary(
                rs.getLong("listing_count"),
                rs.getLong("views"),
                rs.getLong("favorites"),
                rs.getLong("inquiries"),
                capabilities(owner),
                coverage()),
        owner,
        owner,
        owner,
        owner);
  }

  // Same selection underlies totals, daily rows, listing pages and the full CSV.
  // Ledger timestamps bound the partial current day and exclude future facts.
  private static final String DATA =
      """
WITH own AS (SELECT id,description,status FROM listings WHERE seller_id=? AND status IN ('ACTIVE','SOLD') AND (CAST(? AS uuid) IS NULL OR id=CAST(? AS uuid))),
facts AS (SELECT f.* FROM seller_analytics_facts f JOIN own o ON o.id=f.listing_id WHERE f.seller_id=? AND f.occurred_at>=? AND f.occurred_at<=?),
rows AS (SELECT o.id,o.description,o.status,count(*) FILTER(WHERE f.metric='VIEW') unique_views,
 count(*) FILTER(WHERE f.metric='SAVE') save_additions,count(*) FILTER(WHERE f.metric='INQUIRY') inquiries,
 count(*) FILTER(WHERE f.metric='TRADE') completed_trades,coalesce(sum(f.gross_sales_uzs),0) gross_sales_uzs
 FROM own o LEFT JOIN facts f ON f.listing_id=o.id GROUP BY o.id,o.description,o.status)
""";

  private Object[] args(UUID owner, UUID listing, LocalDate start, Instant end) {
    return new Object[] {
      owner,
      listing,
      listing,
      owner,
      Timestamp.from(start.atStartOfDay(ZONE).toInstant()),
      Timestamp.from(end)
    };
  }

  private void checkListing(UUID owner, UUID listing) {
    if (listing != null
        && jdbc.queryForObject(
                "SELECT count(*) FROM listings WHERE id=? AND seller_id=? AND status IN"
                    + " ('ACTIVE','SOLD')",
                Long.class,
                listing,
                owner)
            == 0) throw error(HttpStatus.NOT_FOUND, "listing_not_found");
  }

  private Metrics metrics(ResultSet rs) throws SQLException {
    return new Metrics(
        rs.getLong("unique_views"),
        rs.getLong("save_additions"),
        rs.getLong("inquiries"),
        rs.getLong("completed_trades"),
        rs.getBigDecimal("gross_sales_uzs").toPlainString());
  }

  private ListingRow listing(ResultSet rs) throws SQLException {
    var m = metrics(rs);
    return new ListingRow(
        rs.getObject("id", UUID.class),
        rs.getString("description"),
        rs.getString("status"),
        m.uniqueViews(),
        m.saveAdditions(),
        m.inquiries(),
        m.completedTrades(),
        m.grossSalesUzs());
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public Report report(UUID owner, int days, UUID listing, int page, int size) {
    authorize(owner, days, false);
    checkListing(owner, listing);
    if (page < 0 || size < 1 || size > 100)
      throw error(HttpStatus.BAD_REQUEST, "analytics_invalid_page");
    Instant end = clock.instant();
    LocalDate today = end.atZone(ZONE).toLocalDate(), start = today.minusDays(days - 1L);
    Object[] params = args(owner, listing, start, end);
    var totals =
        jdbc.queryForObject(
            DATA
                + "SELECT coalesce(sum(unique_views),0)"
                + " unique_views,coalesce(sum(save_additions),0)"
                + " save_additions,coalesce(sum(inquiries),0)"
                + " inquiries,coalesce(sum(completed_trades),0)"
                + " completed_trades,coalesce(sum(gross_sales_uzs),0) gross_sales_uzs FROM rows",
            (rs, n) -> metrics(rs),
            params);
    var known =
        jdbc.query(
            DATA
                + "SELECT (occurred_at AT TIME ZONE 'Asia/Samarkand')::date AS metric_date,count(*)"
                + " FILTER(WHERE metric='VIEW') unique_views,count(*) FILTER(WHERE metric='SAVE')"
                + " save_additions,count(*) FILTER(WHERE metric='INQUIRY') inquiries,count(*)"
                + " FILTER(WHERE metric='TRADE') completed_trades,coalesce(sum(gross_sales_uzs),0)"
                + " gross_sales_uzs FROM facts GROUP BY metric_date",
            (rs, n) -> {
              var m = metrics(rs);
              return new Day(
                  rs.getDate("metric_date").toLocalDate(),
                  m.uniqueViews(),
                  m.saveAdditions(),
                  m.inquiries(),
                  m.completedTrades(),
                  m.grossSalesUzs());
            },
            params);
    Map<LocalDate, Day> byDay = new HashMap<>();
    known.forEach(d -> byDay.put(d.date(), d));
    List<Day> daily = new ArrayList<>();
    for (LocalDate d = start; !d.isAfter(today); d = d.plusDays(1))
      daily.add(byDay.getOrDefault(d, new Day(d, 0, 0, 0, 0, "0")));
    List<Object> pageArgs = new ArrayList<>(Arrays.asList(params));
    pageArgs.add(size);
    pageArgs.add((long) page * size);
    var rows =
        jdbc.query(
            DATA + "SELECT * FROM rows ORDER BY id LIMIT ? OFFSET ?",
            (rs, n) -> listing(rs),
            pageArgs.toArray());
    long count = jdbc.queryForObject(DATA + "SELECT count(*) FROM rows", Long.class, params);
    return new Report(days, start, today, coverage(start), totals, daily, rows, page, size, count);
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public String export(UUID owner, int days, UUID listing) {
    authorize(owner, days, true);
    checkListing(owner, listing);
    Instant end = clock.instant();
    LocalDate today = end.atZone(ZONE).toLocalDate(), start = today.minusDays(days - 1L);
    StringBuilder csv =
        new StringBuilder(
            "listingId,title,status,fromDate,toDate,uniqueViews,saveAdditions,inquiries,completedTrades,grossSalesUzs\r\n");
    jdbc.query(
        DATA + "SELECT * FROM rows ORDER BY id",
        (org.springframework.jdbc.core.RowCallbackHandler)
            rs -> {
              var r = listing(rs);
              csv.append(
                      String.join(
                          ",",
                          cell(r.listingId().toString()),
                          cell(r.title()),
                          cell(r.status()),
                          cell(start.toString()),
                          cell(today.toString()),
                          Long.toString(r.uniqueViews()),
                          Long.toString(r.saveAdditions()),
                          Long.toString(r.inquiries()),
                          Long.toString(r.completedTrades()),
                          r.grossSalesUzs()))
                  .append("\r\n");
            },
        args(owner, listing, start, end));
    return csv.toString();
  }

  static String cell(String value) {
    String s = value == null ? "" : value.replace('\r', ' ').replace('\n', ' ');
    int first = 0;
    while (first < s.length()) {
      int codePoint = s.codePointAt(first);
      if (!Character.isWhitespace(codePoint)
          && !Character.isSpaceChar(codePoint)
          && !Character.isISOControl(codePoint)) break;
      first += Character.charCount(codePoint);
    }
    if (first < s.length() && "=+@-".indexOf(s.charAt(first)) >= 0) s = "'" + s;
    return "\"" + s.replace("\"", "\"\"") + "\"";
  }
}
