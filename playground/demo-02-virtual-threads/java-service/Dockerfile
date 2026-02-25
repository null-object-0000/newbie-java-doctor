# 第一阶段：编译打包
FROM maven:3.9.12-eclipse-temurin-25 AS builder
WORKDIR /app
COPY pom.xml .
# 预先下载依赖，利用 Docker 缓存加速后续构建
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn clean package -DskipTests

# 第二阶段：极简运行环境
FROM eclipse-temurin:25-jre-alpine
RUN apk add --no-cache curl
WORKDIR /app
COPY --from=builder /app/target/bff-service-0.0.1-SNAPSHOT.jar app.jar
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
