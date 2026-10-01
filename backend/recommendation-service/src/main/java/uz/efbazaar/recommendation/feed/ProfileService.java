package uz.efbazaar.recommendation.feed;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import uz.efbazaar.recommendation.match.Criterion;

import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
public class ProfileService {

    private final ProfileRepository repository;
    private final FeedProperties props;
    private final Clock clock;

    @Autowired
    public ProfileService(ProfileRepository repository, FeedProperties props) {
        this(repository, props, Clock.systemUTC());
    }

    ProfileService(ProfileRepository repository, FeedProperties props, Clock clock) {
        this.repository = repository;
        this.props = props;
        this.clock = clock;
    }

    /** Og'irlik kamayishi bo'yicha (teng bo'lsa karta ID), META boost bilan, eng ko'pi {@code profileLimit}. */
    public List<Criterion> profile(UUID userId) {
        Instant since = clock.instant().minus(props.interestWindow());
        return repository.signals(userId, since).stream()
                .map(signal -> new Criterion(signal.efhubId(), signal.playerId(),
                        signal.activeMeta() ? signal.weight().multiply(props.metaBoost()) : signal.weight()))
                .sorted(Comparator.comparing(Criterion::weight, Comparator.reverseOrder())
                        .thenComparingLong(Criterion::efhubId))
                .limit(props.profileLimit())
                .toList();
    }
}
