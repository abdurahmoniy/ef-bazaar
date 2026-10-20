package uz.efbazaar.marketplace.profileappearance;

import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.plan.PlanProjection;
import uz.efbazaar.marketplace.sellertools.SellerToolAccess;

@Service
@RequiredArgsConstructor
public class ProfileAppearanceStore {
  private final JdbcTemplate jdbc;
  private final PlanProjection plans;
  private final SellerToolAccess access;

  public record Appearance(
      boolean pro,
      String coverFileId,
      @com.fasterxml.jackson.annotation.JsonFormat(
              shape = com.fasterxml.jackson.annotation.JsonFormat.Shape.STRING)
          Instant validUntil) {}

  public record OwnAppearance(
      boolean pro,
      String coverFileId,
      String capability,
      @com.fasterxml.jackson.annotation.JsonFormat(
              shape = com.fasterxml.jackson.annotation.JsonFormat.Shape.STRING)
          Instant validUntil) {}

  @Transactional(readOnly = true)
  public Appearance publicAppearance(UUID user) {
    var snapshot = plans.readCapabilities(user);
    boolean active = "AVAILABLE".equals(SellerToolAccess.status(snapshot, "profile.decoration"));
    return new Appearance(
        active, active ? cover(user) : null, active ? snapshot.validUntil() : null);
  }

  @Transactional(readOnly = true)
  public OwnAppearance own(UUID user) {
    var snapshot = plans.readCapabilities(user);
    String capability = SellerToolAccess.status(snapshot, "profile.decoration");
    boolean active = "AVAILABLE".equals(capability);
    return new OwnAppearance(
        active, cover(user), capability, active ? snapshot.validUntil() : null);
  }

  private String cover(UUID user) {
    var rows =
        jdbc.query(
            "SELECT cover_file_id FROM profile_appearances WHERE user_id=?",
            (rs, n) -> rs.getString(1),
            user);
    return rows.isEmpty() ? null : rows.get(0);
  }

  @Transactional
  public OwnAppearance save(UUID user, String fileId) {
    access.require(user, "profile.decoration");
    jdbc.update(
        "INSERT INTO profile_appearances(user_id,cover_file_id) VALUES (?,?) ON CONFLICT(user_id)"
            + " DO UPDATE SET cover_file_id=EXCLUDED.cover_file_id,updated_at=now()",
        user,
        fileId);
    // The upsert may wait on an existing cover row; denied access rolls it back.
    access.require(user, "profile.decoration");
    return own(user);
  }
}
