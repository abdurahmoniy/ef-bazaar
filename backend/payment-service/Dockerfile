# ==============================================================
# payment-service — multi-stage build with Spring Boot LAYERED jar.
# Same pattern as auth-service (see backend/auth-service/Dockerfile).
# Build context: backend/ (docker build -f backend/payment-service/Dockerfile backend).
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
# GHA cache RUN qatlamlarini saqlaydi, cache mount ichidagi ~/.m2 ni emas.
# Kutubxonalar oddiy qatlamda qolsin: src o'zgarganda ham keyingi runner oladi.
# Umumiy kutubxonalar (build context — backend/). Servis pom'i ulardan
# oldin o'rnatilgan bo'lishi kerak: aks holda go-offline ularni Maven
# Central'dan qidirib yiqiladi.
COPY libs/outbox/pom.xml libs/outbox/pom.xml
COPY libs/outbox/src libs/outbox/src
RUN n=0; until mvn -B -ntp -f libs/outbox/pom.xml install -DskipTests; do \
      n=$((n+1)); \
      if [ "$n" -ge 5 ]; then echo "Maven 5 urinishdan keyin ham yiqildi"; exit 1; fi; \
      echo "Maven yiqildi (urinish $n/5) — $((n*20))s dan keyin qayta"; \
      sleep $((n*20)); \
    done
COPY payment-service/pom.xml .
RUN n=0; until mvn -B -ntp dependency:go-offline; do \
      n=$((n+1)); \
      if [ "$n" -ge 5 ]; then echo "Maven 5 urinishdan keyin ham yiqildi"; exit 1; fi; \
      echo "Maven yiqildi (urinish $n/5) — $((n*20))s dan keyin qayta"; \
      sleep $((n*20)); \
    done
COPY payment-service/src ./src
RUN n=0; until mvn -B -ntp clean package -DskipTests; do \
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
