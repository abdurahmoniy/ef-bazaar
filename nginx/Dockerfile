FROM nginx:1.27-alpine

# Default config va custom site config
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/ /etc/nginx/conf.d/

EXPOSE 80
# EXPOSE 443  # TLS keyinroq (certbot)

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/healthz > /dev/null || exit 1
