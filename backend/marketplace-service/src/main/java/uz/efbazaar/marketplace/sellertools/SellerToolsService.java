package uz.efbazaar.marketplace.sellertools;

import static uz.efbazaar.marketplace.sellertools.SellerToolAccess.error;

import java.sql.*;
import java.time.Instant;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SellerToolsService {
  private final JdbcTemplate jdbc;
  private final SellerToolAccess access;

  public enum Kind {
    templates("seller_reply_templates"),
    notes("seller_private_notes");
    final String table;

    Kind(String table) {
      this.table = table;
    }
  }

  public record Input(String title, String body, UUID chatId, UUID listingId) {}

  public record Row(
      UUID id,
      String title,
      String body,
      UUID chatId,
      UUID listingId,
      @com.fasterxml.jackson.annotation.JsonFormat(
              shape = com.fasterxml.jackson.annotation.JsonFormat.Shape.STRING)
          Instant createdAt,
      @com.fasterxml.jackson.annotation.JsonFormat(
              shape = com.fasterxml.jackson.annotation.JsonFormat.Shape.STRING)
          Instant updatedAt) {}

  public record Page(List<Row> content, int page, int size, long totalElements) {}

  public record Export(List<Row> templates, List<Row> notes) {}

  private Row row(ResultSet rs, Kind kind) throws SQLException {
    return new Row(
        rs.getObject("id", UUID.class),
        rs.getString("title"),
        rs.getString("body"),
        kind == Kind.notes ? rs.getObject("chat_id", UUID.class) : null,
        kind == Kind.notes ? rs.getObject("listing_id", UUID.class) : null,
        rs.getTimestamp("created_at").toInstant(),
        rs.getTimestamp("updated_at").toInstant());
  }

  @Transactional(readOnly = true)
  public Row get(UUID owner, Kind kind, UUID id) {
    return jdbc
        .query(
            "SELECT * FROM " + kind.table + " WHERE owner_id=? AND id=?",
            (rs, n) -> row(rs, kind),
            owner,
            id)
        .stream()
        .findFirst()
        .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "not_found"));
  }

  @Transactional(readOnly = true)
  public Page list(UUID owner, Kind kind, int page, int size, UUID chat, UUID listing) {
    if (page < 0 || page > 100000 || size < 1 || size > 100)
      throw error(HttpStatus.BAD_REQUEST, "invalid_page");
    String where = " WHERE owner_id=?";
    List<Object> args = new ArrayList<>();
    args.add(owner);
    if (kind == Kind.notes && chat != null) {
      where += " AND chat_id=?";
      args.add(chat);
    }
    if (kind == Kind.notes && listing != null) {
      where += " AND listing_id=?";
      args.add(listing);
    }
    long total =
        jdbc.queryForObject(
            "SELECT count(*) FROM " + kind.table + where, Long.class, args.toArray());
    args.add(size);
    args.add((long) page * size);
    return new Page(
        jdbc.query(
            "SELECT * FROM "
                + kind.table
                + where
                + " ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
            (rs, n) -> row(rs, kind),
            args.toArray()),
        page,
        size,
        total);
  }

  @Transactional(
      readOnly = true,
      isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
  public Export export(UUID owner) {
    return new Export(all(owner, Kind.templates), all(owner, Kind.notes));
  }

  private List<Row> all(UUID owner, Kind kind) {
    return jdbc.query(
        "SELECT * FROM " + kind.table + " WHERE owner_id=? ORDER BY created_at DESC,id DESC",
        (rs, n) -> row(rs, kind),
        owner);
  }

  @Transactional
  public Row save(UUID owner, Kind kind, UUID id, Input input) {
    access.require(owner, "seller.tools");
    Row old = id == null ? null : get(owner, kind, id);
    if (input == null
        || input.body() == null
        || input.body().isBlank()
        || input.body().length() > (kind == Kind.templates ? 4000 : 8000)
        || input.title() != null && input.title().length() > 120
        || kind == Kind.templates && (input.title() == null || input.title().isBlank()))
      throw error(HttpStatus.BAD_REQUEST, "invalid_text");
    String title = input.title() == null ? "" : input.title();
    if (kind == Kind.notes) validateContext(owner, input, old);
    else if (input.chatId() != null || input.listingId() != null)
      throw error(HttpStatus.BAD_REQUEST, "invalid_context");
    UUID savedId = id == null ? UUID.randomUUID() : id;
    if (id == null) {
      if (kind == Kind.notes)
        jdbc.update(
            "INSERT INTO seller_private_notes(id,owner_id,title,body,chat_id,listing_id) VALUES"
                + " (?,?,?,?,?,?)",
            savedId,
            owner,
            title,
            input.body(),
            input.chatId(),
            input.listingId());
      else
        jdbc.update(
            "INSERT INTO seller_reply_templates(id,owner_id,title,body) VALUES (?,?,?,?)",
            savedId,
            owner,
            title,
            input.body());
    } else {
      if (kind == Kind.notes)
        jdbc.update(
            "UPDATE seller_private_notes SET title=?,body=?,chat_id=?,listing_id=?,updated_at=now()"
                + " WHERE id=? AND owner_id=?",
            title,
            input.body(),
            input.chatId(),
            input.listingId(),
            id,
            owner);
      else
        jdbc.update(
            "UPDATE seller_reply_templates SET title=?,body=?,updated_at=now() WHERE id=? AND"
                + " owner_id=?",
            title,
            input.body(),
            id,
            owner);
    }
    // A context or row lock may have outlived paid access; roll back DB-only work.
    access.require(owner, "seller.tools");
    return get(owner, kind, savedId);
  }

  private void validateContext(UUID owner, Input input, Row old) {
    if (input.chatId() == null && input.listingId() == null)
      throw error(HttpStatus.BAD_REQUEST, "context_required");
    if (input.chatId() != null && (old == null || !input.chatId().equals(old.chatId()))) {
      if (jdbc.query(
              "SELECT id FROM chats WHERE id=? AND (buyer_id=? OR seller_id=?) FOR SHARE",
              (rs, n) -> rs.getObject(1),
              input.chatId(),
              owner,
              owner)
          .isEmpty()) throw error(HttpStatus.NOT_FOUND, "context_not_found");
    }
    if (input.listingId() != null && (old == null || !input.listingId().equals(old.listingId()))) {
      if (jdbc.query(
              "SELECT id FROM listings WHERE id=? AND seller_id=? FOR SHARE",
              (rs, n) -> rs.getObject(1),
              input.listingId(),
              owner)
          .isEmpty()) throw error(HttpStatus.NOT_FOUND, "context_not_found");
    }
  }

  @Transactional
  public void delete(UUID owner, Kind kind, UUID id) {
    access.require(owner, "seller.tools");
    if (jdbc.update("DELETE FROM " + kind.table + " WHERE id=? AND owner_id=?", id, owner) == 0)
      throw error(HttpStatus.NOT_FOUND, "not_found");
    access.require(owner, "seller.tools");
  }
}
