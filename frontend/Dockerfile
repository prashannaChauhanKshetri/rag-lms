# ─── Frontend: Vite build served by nginx + reverse-proxy to backend ─────────

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (cached unless package-lock.json changes)
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage
FROM nginx:1.27-alpine

# Replace default nginx config with one that:
#  - serves /app/dist as SPA (falls back to index.html)
#  - proxies /auth, /chatbots, /admin, /instructor, /student, /notifications,
#    /feedback, /uploads, /static, /health to the backend container
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -qO- http://localhost/ >/dev/null || exit 1
