# Flutter web build + nginx static server for Railway.
FROM ghcr.io/cirruslabs/flutter:stable AS build

WORKDIR /app

COPY pubspec.yaml pubspec.lock ./
RUN flutter pub get

COPY . .

# Override in Railway: service variable API_BASE_URL (passed as Docker build arg).
ARG API_BASE_URL=https://api.chatlife.online
RUN ENGINE_REVISION="$(flutter --version | grep -oE 'revision [a-f0-9]+' | awk '{print $2}')" && \
    flutter build web --release --pwa-strategy=none \
      --dart-define=API_BASE_URL=${API_BASE_URL} \
      --dart-define=FLUTTER_WEB_CANVASKIT_URL=https://www.gstatic.com/flutter-canvaskit/${ENGINE_REVISION}/

FROM nginx:1.27-alpine

ENV PORT=8080

COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/build/web /usr/share/nginx/html

EXPOSE 8080
