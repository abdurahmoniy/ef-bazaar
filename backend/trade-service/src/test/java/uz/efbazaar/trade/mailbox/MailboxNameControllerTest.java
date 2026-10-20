package uz.efbazaar.trade.mailbox;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import org.springframework.web.bind.support.WebDataBinderFactory;
import uz.efbazaar.trade.common.exception.TradeExceptionHandler;
import uz.efbazaar.trade.mailbox.controller.MailboxController;
import uz.efbazaar.trade.mailbox.mapper.MailboxMapper;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.plan.service.MailboxSlotService;
import uz.efbazaar.trade.security.AuthenticatedUser;

import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class MailboxNameControllerTest {
    private final UUID owner = UUID.randomUUID();
    private final UUID mailbox = UUID.randomUUID();
    private MailboxService service;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        service = mock(MailboxService.class);
        mvc = standaloneSetup(new MailboxController(service, mock(MailboxMapper.class), mock(uz.efbazaar.trade.trade.repository.TradeRepository.class),
                mock(MailboxSlotService.class), mock(uz.efbazaar.trade.plan.service.MailboxAccessService.class),
                mock(uz.efbazaar.trade.mailbox.link.MailboxLinkSessionRepository.class)))
                .setControllerAdvice(new TradeExceptionHandler())
                .setCustomArgumentResolvers(new HandlerMethodArgumentResolver() {
                    public boolean supportsParameter(MethodParameter parameter) {
                        return parameter.getParameterType() == AuthenticatedUser.class;
                    }
                    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer container,
                                                  NativeWebRequest request, WebDataBinderFactory binder) {
                        return new AuthenticatedUser(owner, null, List.of("ROLE_USER"), null);
                    }
                }).build();
    }

    @Test
    void ownerCanDetachTheirMailbox() throws Exception {
        mvc.perform(post("/api/v1/mailboxes/{id}/detach", mailbox))
                .andExpect(status().isNoContent());
        verify(service).detachOwnedBy(owner, mailbox);
    }

    @Test
    void ownerCanSetMailboxName() throws Exception {
        mvc.perform(patch("/api/v1/mailboxes/{id}/name", mailbox)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"displayName\":\"Main account\"}"))
                .andExpect(status().isNoContent());
        verify(service).renameOwnedBy(owner, mailbox, "Main account");
    }

    @Test
    void rejectsMissingAndNullName() throws Exception {
        for (String body : List.of("{}", "{\"displayName\":null}")) {
            mvc.perform(patch("/api/v1/mailboxes/{id}/name", mailbox)
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }

    @Test
    void rejectsNonStringNames() throws Exception {
        for (String value : List.of("123", "true", "[]", "{}")) {
            mvc.perform(patch("/api/v1/mailboxes/{id}/name", mailbox)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"displayName\":" + value + "}"))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }

    @Test
    void rejectsMoreThanSixtyUtf16Characters() throws Exception {
        for (String name : List.of("a".repeat(61), "😀".repeat(31))) {
            mvc.perform(patch("/api/v1/mailboxes/{id}/name", mailbox)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"displayName\":\"" + name + "\"}"))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }

    @Test
    void permitsEmptyNameAndSixtyUtf16Characters() throws Exception {
        for (String name : List.of("", "a".repeat(60), "  " + "a".repeat(60) + "  ", "😀".repeat(30))) {
            mvc.perform(patch("/api/v1/mailboxes/{id}/name", mailbox)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"displayName\":\"" + name + "\"}"))
                    .andExpect(status().isNoContent());
        }
    }
}
