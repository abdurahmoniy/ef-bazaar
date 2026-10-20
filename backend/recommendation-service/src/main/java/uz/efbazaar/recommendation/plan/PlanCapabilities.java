package uz.efbazaar.recommendation.plan;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

/** Readiness-aware boundary for allocations and paid actions. */
@Service
@RequiredArgsConstructor
public class PlanCapabilities {
    public enum Status { AVAILABLE, DENIED, UNAVAILABLE }
    public record Capability(Status status, String value) {
        public boolean unlimited() { return status == Status.AVAILABLE && value == null; }
    }
    private final PlanProjection projection;

    @Transactional(readOnly = true)
    public Capability capability(UUID userId, String key) {
        var snapshot = projection.readCapability(userId, key);
        if (!snapshot.subscriptionFresh() || !snapshot.planFresh()) return new Capability(Status.UNAVAILABLE, null);
        return snapshot.granted() ? new Capability(Status.AVAILABLE, snapshot.value()) : new Capability(Status.DENIED, null);
    }
    public record Capabilities(java.util.Map<String,Capability> values, java.time.Instant sourceTime,
                               java.util.Map<String,java.time.Instant> grantSourceTimes) {}
    @Transactional(readOnly = true)
    public Capabilities capabilitiesSnapshot(UUID userId, java.util.List<String> keys) {
        var snapshot = projection.readCapabilities(userId);
        java.util.Map<String,Capability> result = new java.util.LinkedHashMap<>();
        for (String key : keys) {
            Capability capability = !snapshot.subscriptionFresh() || !snapshot.planFresh()
                    ? new Capability(Status.UNAVAILABLE, null)
                    : snapshot.grants().containsKey(key)
                        ? new Capability(Status.AVAILABLE, snapshot.grants().get(key))
                        : new Capability(Status.DENIED, null);
            result.put(key, capability);
        }
        return new Capabilities(result, snapshot.sourceTime(), snapshot.grantSourceTimes());
    }
    @Transactional(readOnly = true)
    public java.util.Map<String,Capability> capabilities(UUID userId, java.util.List<String> keys) {
        return capabilitiesSnapshot(userId, keys).values();
    }

}
