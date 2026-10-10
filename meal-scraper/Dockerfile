FROM eclipse-temurin:25-jdk AS build
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates && rm -rf /var/lib/apt/lists/*
ENV KOTLIN_CLI_JAVA_HOME=/opt/java/openjdk
COPY . .
RUN sed -i 's/\r$//' kotlin && sh ./kotlin package -m server -m connector -p jvm -f executable-jar

FROM eclipse-temurin:25-jre
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10002 --create-home scraper
COPY --from=build /build/build/tasks/_server_executableJarJvm/server-jvm-executable.jar /app/server.jar
COPY --from=build /build/build/tasks/_connector_executableJarJvm/connector-jvm-executable.jar /app/connector.jar
ENV MEAL_CONNECTOR_HOST=0.0.0.0 MEAL_CONNECTOR_PORT=8091 MEAL_MCP_JAR=/app/server.jar
USER scraper
EXPOSE 8091
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl --fail --silent --max-time 8 --header "Authorization: Bearer $MEAL_CONNECTOR_TOKEN" http://127.0.0.1:8091/health > /dev/null || exit 1
ENTRYPOINT ["java", "-jar", "/app/connector.jar", "/app/server.jar"]
