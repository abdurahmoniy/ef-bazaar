# ==============================================================
# auth-service — multi-stage build
# Stage 1: Maven + JDK 21 → .jar
# Stage 2: lean JRE 21 → run
# ==============================================================

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace

# Dependency layer — pom.xml o'zgarmasa, cache hit
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 mvn -B -q dependency:go-offline

# Source layer
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q clean package -DskipTests

# ----------------------------------------------------------------

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Non-root user (security)
RUN addgroup -S app && adduser -S -G app app

COPY --from=build /workspace/target/auth-service.jar app.jar

USER app

EXPOSE 8081

ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0"
ENV SPRING_PROFILES_ACTIVE=docker

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD wget -qO- http://localhost:8081/actuator/health | grep -q '"status":"UP"' || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
