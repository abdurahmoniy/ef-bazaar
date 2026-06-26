# ==============================================================
# auth-service — multi-stage build with Spring Boot LAYERED jar.
#
# Why layered: dependencies (75 MB) o'zgarmaganida Docker cache hit.
# Faqat kod o'zgarsa application/ layer (~50 KB) qayta build qilinadi.
# ==============================================================

# ---------------- Stage 1: build jar ----------------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace

# Dependency layer — pom.xml o'zgarmagunicha cache reuses
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 mvn -B -q dependency:go-offline

# Source layer
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q clean package -DskipTests \
 && mv target/*.jar target/app.jar

# ---------------- Stage 2: extract layers ----------------
FROM eclipse-temurin:21-jre-alpine AS extract
WORKDIR /workspace
COPY --from=build /workspace/target/app.jar app.jar
RUN java -Djarmode=tools -jar app.jar extract --layers --launcher

# ---------------- Stage 3: lean runtime ----------------
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

RUN addgroup -S app && adduser -S -G app app

# Layers ni alohida COPY qilamiz — kamdan-kam o'zgaradiganlari avval
COPY --from=extract /workspace/app/dependencies/         ./
COPY --from=extract /workspace/app/spring-boot-loader/   ./
COPY --from=extract /workspace/app/snapshot-dependencies/ ./
COPY --from=extract /workspace/app/application/          ./

USER app
EXPOSE 8081

ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0"
ENV SPRING_PROFILES_ACTIVE=docker

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD wget -qO- http://localhost:8081/actuator/health | grep -q '"status":"UP"' || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS org.springframework.boot.loader.launch.JarLauncher"]
