package uz.efbazaar.auth.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.TokenResponse;
import uz.efbazaar.auth.mapper.UserMapper;
import uz.efbazaar.auth.security.JwtProperties;
import uz.efbazaar.auth.security.JwtService;

@Component
@RequiredArgsConstructor
public class TokenIssuer {

    private final JwtService jwtService;
    private final JwtProperties jwtProperties;
    private final UserMapper userMapper;

    public TokenResponse issue(User user) {
        String access = jwtService.issueAccessToken(user);
        var refresh = jwtService.issueRefreshToken(user.getId());
        return new TokenResponse(
                access,
                refresh.token(),
                jwtProperties.accessTokenTtl().getSeconds(),
                jwtProperties.refreshTokenTtl().getSeconds(),
                userMapper.toResponse(user)
        );
    }
}
