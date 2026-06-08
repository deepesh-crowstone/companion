# Flutter web build + nginx static server for Railway.
FROM ghcr.io/cirruslabs/flutter:stable AS build

WORKDIR /app

COPY pubspec.yaml pubspec.lock ./
RUN flutter pub get

COPY . .

# Override in Railway: service variable API_BASE_URL (passed as Docker build arg).
ARG API_BASE_URL=https://api.chatlife.online
# PostHog first-party proxy path — must match the nginx /zr-relay locations
# below. Only the nginx-served (Railway) web build opts in; the relative path is
# same-origin so it works for both chatlife.online and www.chatlife.online.
ARG POSTHOG_WEB_PROXY_PATH=/zr-relay
ARG MIXPANEL_TOKEN=
RUN CANVASKIT_URL="$$(sh scripts/canvaskit_url.sh)" && \
    flutter build web --release --pwa-strategy=none \
      --dart-define=API_BASE_URL=${API_BASE_URL} \
      --dart-define=POSTHOG_WEB_PROXY_PATH=${POSTHOG_WEB_PROXY_PATH} \
      --dart-define=MIXPANEL_TOKEN=${MIXPANEL_TOKEN} \
      --dart-define=FLUTTER_WEB_CANVASKIT_URL=$$CANVASKIT_URL

FROM nginx:1.27-alpine

ENV PORT=8080

COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/build/web /usr/share/nginx/html

EXPOSE 8080
