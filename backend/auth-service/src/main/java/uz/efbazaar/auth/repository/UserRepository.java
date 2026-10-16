package uz.efbazaar.auth.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.auth.domain.User;

import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;

import uz.efbazaar.auth.domain.Role;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByTelegramId(Long telegramId);

    List<User> findByTelegramIdIn(Collection<Long> telegramIds);

    Optional<User> findByGoogleId(String googleId);

    /**
     * Telegram'i ulangan foydalanuvchilarning chat id lari — ommaviy xabar
     * uchun manzillar ro'yxati.
     *
     * <p>Faqat id qaytariladi, User entity emas: ro'yxat o'n minglab bo'lishi
     * mumkin va butun obyektni yuklash keraksiz xotira sarfi. Tartib `id`
     * bo'yicha qat'iy — sahifalash tartibsiz bo'lsa ba'zi foydalanuvchi ikki
     * marta xabar olar, ba'zisi umuman olmasdi.
     */
    @Query("select u.telegramId from User u where u.telegramId is not null order by u.id")
    Page<Long> findTelegramIds(Pageable pageable);

    /**
     * Bitta rolga tegishli manzillar — ommaviy xabarni faqat adminlarga
     * yuborish uchun (haqiqiy jo'natishdan oldingi sinov).
     */
    @Query("""
            select u.telegramId from User u
            where u.telegramId is not null and u.role = :role
            order by u.id
            """)
    Page<Long> findTelegramIdsByRole(Role role, Pageable pageable);

    /**
     * Berilgan roldan TASHQARI hammasi — adminlarni chetlab o'tib faqat
     * oddiy foydalanuvchilarga yuborish uchun.
     */
    @Query("""
            select u.telegramId from User u
            where u.telegramId is not null and u.role <> :role
            order by u.id
            """)
    Page<Long> findTelegramIdsByRoleNot(Role role, Pageable pageable);

    /**
     * Everyone holding a role, for services that need to reach a group rather
     * than a person — a payout waiting for whoever is on duty, say.
     */
    List<User> findByRole(uz.efbazaar.auth.domain.Role role);

    boolean existsByGoogleId(String googleId);

    /** Case-insensitive contains-search over the admin-visible identity fields. */
    @Query("""
            SELECT u FROM User u
             WHERE lower(u.telegramUsername) LIKE lower(concat('%', :q, '%'))
                OR lower(u.telegramFirstName) LIKE lower(concat('%', :q, '%'))
                OR lower(u.telegramLastName) LIKE lower(concat('%', :q, '%'))
                OR lower(u.googleGivenName) LIKE lower(concat('%', :q, '%'))
                OR lower(u.email) LIKE lower(concat('%', :q, '%'))
            """)
    Page<User> search(@Param("q") String q, Pageable pageable);

    /**
     * Matnli qidiruv, lekin faqat Telegramga ulanganlar orasidan.
     *
     * <p>Botga xabar yuborish uchun manzil tanlanayotganda ulanmagan
     * foydalanuvchini ko'rsatish foydasiz: uni tanlab bo'lardi, xabar esa
     * yetmasdi va sabab faqat jo'natishdan keyin ma'lum bo'lardi.
     */
    @Query("""
            SELECT u FROM User u
             WHERE u.telegramId IS NOT NULL
               AND (lower(u.telegramUsername) LIKE lower(concat('%', :q, '%'))
                OR lower(u.telegramFirstName) LIKE lower(concat('%', :q, '%'))
                OR lower(u.telegramLastName) LIKE lower(concat('%', :q, '%'))
                OR lower(u.googleGivenName) LIKE lower(concat('%', :q, '%'))
                OR lower(u.email) LIKE lower(concat('%', :q, '%')))
            """)
    Page<User> searchWithTelegram(@Param("q") String q, Pageable pageable);

    Page<User> findByTelegramIdNotNull(Pageable pageable);
}
