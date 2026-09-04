# ==============================================================
# payment-service — multi-stage build with Spring Boot LAYERED jar.
# Same pattern as auth-service (see backend/auth-service/Dockerfile).
# ==============================================================

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
# Maven Central anonim CI trafigini cheklaydi va 429 qaytaradi. Bu VAQTINCHALIK
# holat uchun butun image qurilishini yiqitadi.
#
# MAVEN_OPTS dagi retryHandler bu yerda YETARLI EMAS: u faqat tarmoq uzilishida
# qayta uriniladi, 429 esa to'liq HTTP javob va Maven uni "server javob berdi"
# deb hisoblaydi. Shuning uchun qayta urinish qobiq darajasida — u nima sababdan
# yiqilganidan qat'i nazar ishlaydi.
ENV MAVEN_OPTS="-Dmaven.wagon.http.retryHandler.count=5 \
                -Dmaven.wagon.http.retryHandler.requestSentEnabled=true \
                -Dmaven.wagon.httpconnectionManager.ttlSeconds=120"
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 \
    n=0; until mvn -B -q dependency:go-offline; do \
      n=$((n+1)); \
      if [ "$n" -ge 5 ]; then echo "Maven 5 urinishdan keyin ham yiqildi"; exit 1; fi; \
      echo "Maven yiqildi (urinish $n/5) — $((n*20))s dan keyin qayta"; \
      sleep $((n*20)); \
    done
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    n=0; until mvn -B -q clean package -DskipTests; do \
      n=$((n+1)); \
      if [ "$n" -ge 5 ]; then echo "Maven 5 urinishdan keyin ham yiqildi"; exit 1; fi; \
      echo "Maven yiqildi (urinish $n/5) — $((n*20))s dan keyin qayta"; \
      sleep $((n*20)); \
    done \
 && mv target/*.jar target/app.jar

FROM eclipse-temurin:21-jre-alpine AS extract
WORKDIR /workspace
COPY --from=build /workspace/target/app.jar app.jar
RUN java -Djarmode=tools -jar app.jar extract --layers --launcher

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S app && adduser -S -G app app

COPY --from=extract /workspace/app/dependencies/          ./
COPY --from=extract /workspace/app/spring-boot-loader/    ./
COPY --from=extract /workspace/app/snapshot-dependencies/ ./
COPY --from=extract /workspace/app/application/           ./

USER app
EXPOSE 8087

ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0"
ENV SPRING_PROFILES_ACTIVE=docker

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD wget -qO- http://localhost:8087/actuator/health | grep -q '"status":"UP"' || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS org.springframework.boot.loader.launch.JarLauncher"]
