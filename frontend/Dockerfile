# ==============================================================
# Frontend — multi-stage:
# Stage 1: Node 22 → npm build (dist/)
# Stage 2: nginx:alpine → serve static
# ==============================================================

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

# ----------------------------------------------------------------

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/healthz > /dev/null || exit 1
