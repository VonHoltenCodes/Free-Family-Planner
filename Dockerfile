# Free Family Planner — local-host image.
# Stage 1 builds the WeatherStar 4000+ bundle (netbymatt/ws4kp, MIT); stage 2 serves web/ with tools/serve.py.
FROM node:20-bookworm-slim AS ws4kp
ARG WS4KP_REF=v6.2.6
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 --branch ${WS4KP_REF} https://github.com/netbymatt/ws4kp.git . \
 && npm ci --no-audit --no-fund \
 && npx gulp buildDist \
 && sed -i 's#`/data/\${#`data/${#g' dist/resources/ws.min.js \
 && sed -i 's#`/images/maps/radar/#`images/maps/radar/#g; s#"/images/maps/radar/#"images/maps/radar/#g' dist/resources/ws.min.js

FROM python:3.12-slim
LABEL org.opencontainers.image.title="Free Family Planner" \
      org.opencontainers.image.source="https://github.com/VonHoltenCodes/Free-Family-Planner" \
      org.opencontainers.image.licenses="GPL-3.0"
WORKDIR /app
COPY web/ web/
COPY tools/serve.py tools/serve.py
COPY --from=ws4kp /src/dist/ web/ws4kp/
# config.js is mounted at run time (see docker-compose.yml); the example keeps the image self-contained
RUN [ -f web/config.js ] || cp web/config.example.js web/config.js
VOLUME ["/app/data"]
EXPOSE 8765
CMD ["python3", "tools/serve.py", "--host", "0.0.0.0", "--port", "8765", "--no-open"]
