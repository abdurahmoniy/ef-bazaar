package uz.efbazaar.auth.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.event.AuthEventPublisher;
import uz.efbazaar.auth.repository.UserRepository;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Admin user search: what an admin types to find someone. */
@ExtendWith(MockitoExtension.class)
class UserSearchTest {

    @Mock UserRepository users;
    @Mock AuthEventPublisher events;
    @InjectMocks UserService service;

    private final Pageable page = PageRequest.of(0, 20);

    private static User user(String first, String last, String username, String email) {
        User u = new User();
        u.setId(UUID.randomUUID());
        u.setTelegramFirstName(first);
        u.setTelegramLastName(last);
        u.setTelegramUsername(username);
        u.setEmail(email);
        return u;
    }

    @Test
    void anAtSignBeforeTheUsernameIsIgnored() {
        when(users.search(eq("aliyev"), any())).thenReturn(Page.empty());

        service.findAll("@aliyev", page);

        verify(users).search(eq("aliyev"), any());
    }

    @Test
    void firstAndLastNameTogetherFindThePerson() {
        User match = user("Ali", "Valiyev", "ali_v", null);
        User other = user("Ali", "Karimov", "alik", null);
        when(users.search(eq("valiyev"), any())).thenReturn(new PageImpl<>(List.of(match, other)));

        Page<User> found = service.findAll("Ali Valiyev", page);

        assertThat(found.getContent()).containsExactly(match);
    }

    @Test
    void wordsMayComeInAnyOrderAndCase() {
        User match = user("Ali", "Valiyev", null, null);
        when(users.search(eq("valiyev"), any())).thenReturn(new PageImpl<>(List.of(match)));

        assertThat(service.findAll("valiyev ALI", page).getContent()).containsExactly(match);
    }

    @Test
    void aSingleWordStillUsesTheDatabaseSearchDirectly() {
        Page<User> fromDb = new PageImpl<>(List.of(user("Ali", null, null, "ali@gmail.com")));
        when(users.search(eq("ali@gmail.com"), eq(page))).thenReturn(fromDb);

        assertThat(service.findAll("ali@gmail.com", page)).isSameAs(fromDb);
    }
}
