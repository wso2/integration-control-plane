# syntax=docker/dockerfile:1.7
# Multi-stage build for the ipaas console.
# Stage 1: build the React/Vite app with pnpm.
# Stage 2: serve the static bundle with nginx on port 3000.

# ==========================================
# Stage 1: Build the React application
# ==========================================
FROM node:22-alpine AS builder

# corepack (built into Node 22) activates pnpm without an npm-registry round-trip.
RUN corepack enable pnpm && corepack install -g pnpm@10

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# patchedDependencies in package.json reference these files; pnpm reads them
# during install, so they must be present before `pnpm install` runs.
COPY patches/ ./patches/

# Cache mount: pnpm's content-addressable store persists across builds.
# First build still does the cold download; subsequent installs just re-link.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

# Cache mount for vite/swc transform output so incremental builds are faster.
RUN --mount=type=cache,target=/app/node_modules/.vite \
    pnpm build

# ==========================================
# Stage 2: Serve with nginx
# ==========================================
FROM nginx:1.27-alpine

USER root

# Skip `apk update && apk upgrade`: the base image is recent enough for local-dev,
# and the upgrade adds ~30-60s + 10-20 MB without security benefit here.
RUN addgroup -g 10001 -S choreouser && \
    adduser -u 10001 -S choreouser -G choreouser

# nginx config (inline so the source repo doesn't need to ship one).
RUN cat > /etc/nginx/nginx.conf <<'EOF'
worker_processes auto;
error_log /tmp/nginx/error.log warn;
pid /tmp/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    client_body_temp_path /tmp/nginx/client_body_temp;
    proxy_temp_path /tmp/nginx/proxy_temp;
    fastcgi_temp_path /tmp/nginx/fastcgi_temp;
    uwsgi_temp_path /tmp/nginx/uwsgi_temp;
    scgi_temp_path /tmp/nginx/scgi_temp;

    access_log /tmp/nginx/access.log;
    sendfile on;
    keepalive_timeout 65;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml image/svg+xml;

    server {
        listen 3000;
        server_name _;
        root /usr/share/nginx/html;
        index index.html;

        # Health endpoint used by the Dockerfile HEALTHCHECK and probes.
        location = /health {
            access_log off;
            return 200 'ok';
            add_header Content-Type text/plain;
        }

        # config.json is read at runtime — never cache it so release-binding
        # overrides take effect on container restart.
        location = /config.json {
            add_header Cache-Control "no-store, no-cache, must-revalidate";
            try_files $uri =404;
        }

        # index.html must never be cached — it references hashed JS/CSS filenames,
        # so clients must always fetch the latest copy to pick up new bundles.
        location = /index.html {
            add_header Cache-Control "no-cache";
            try_files $uri =404;
        }

        # Vite-built JS and CSS bundles carry a content hash in the filename
        # (e.g. index-BYM1D2LV.js), so they are safe to cache indefinitely.
        location ~* ^/assets/.*\.(js|css)$ {
            add_header Cache-Control "public, max-age=31536000, immutable";
            try_files $uri =404;
        }

        # Static images and other public assets have no content hash, so use a
        # moderate TTL that still reduces round-trips without risking stale files.
        location ~* \.(svg|png|jpg|jpeg|gif|ico|webp|woff|woff2)$ {
            add_header Cache-Control "public, max-age=604800";
            try_files $uri =404;
        }

        # SPA fallback: every unknown route returns index.html so the React
        # router can handle it client-side.
        location / {
            try_files $uri $uri/ /index.html;
        }
    }
}
EOF

# --chown on the COPY sets ownership; no need to chown -R the same path again.
COPY --from=builder --chown=10001:10001 /app/dist /usr/share/nginx/html

# Temp dirs for read-only root filesystem (nginx writes pid + logs here).
RUN mkdir -p /tmp/nginx/client_body_temp /tmp/nginx/proxy_temp \
             /tmp/nginx/fastcgi_temp /tmp/nginx/uwsgi_temp /tmp/nginx/scgi_temp && \
    chown -R 10001:10001 /tmp/nginx /var/cache/nginx /etc/nginx

USER 10001

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
