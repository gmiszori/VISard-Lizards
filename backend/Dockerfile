# Multi-stage build for VISard-Lizards Backend (Spring Boot / Java 25)
FROM eclipse-temurin:25-jdk AS build
WORKDIR /app

COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw dependency:go-offline -B

COPY src ./src
COPY third-party ./third-party
RUN ./mvnw clean package -DskipTests -B

FROM eclipse-temurin:25-jre
WORKDIR /app

EXPOSE 8080

RUN useradd --system --uid 10001 --create-home appuser && mkdir -p /app/data && chown -R appuser:appuser /app
COPY --from=build /app/target/*.jar app.jar
RUN chown appuser:appuser app.jar
USER appuser

ENTRYPOINT ["java", "-jar", "app.jar"]
