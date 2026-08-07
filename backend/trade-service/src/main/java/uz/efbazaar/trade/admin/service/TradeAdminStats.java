package uz.efbazaar.trade.admin.service;

import java.util.UUID;

/**
 * Narrow write port for admin statistics.
 *
 * <p>Exists so {@code TradeStateHandler} — which lives in the trade package and
 * is the single funnel for every state entry, including scheduler-driven ones —
 * can update counters without importing the admin service and creating a
 * dependency cycle.
 */
public interface TradeAdminStats {

    /**
     * @param workSeconds  accepted → admin pressed close (what the catalogue shows)
     * @param closeSeconds accepted → SUCCESS (includes the parties' confirm latency)
     */
    void recordCompleted(UUID adminId, long workSeconds, long closeSeconds);

    /** Admin went quiet and a platform admin reassigned the trade away. */
    void recordAbandoned(UUID adminId);

    /** Admin aborted the trade themselves — e.g. the account was fake. */
    void recordCancelled(UUID adminId);

    /** One party left a 1–5 star rating. Never called on hide (spec §10). */
    void recordRating(UUID adminId, int stars);
}
