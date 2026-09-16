# 多阶段构建：Vue 3 + TS + Vite
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# 运行阶段：非 root nginx
FROM nginx:stable-alpine
LABEL maintainer="urban-studyroom"

# 非 root 用户 nginx（镜像内置 uid=101）所需目录权限
RUN touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/cache/nginx /var/log/nginx /var/run/nginx.pid /usr/share/nginx/html && \
    rm /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx --from=builder /app/dist /usr/share/nginx/html
RUN printf 'ok' > /usr/share/nginx/html/healthz && chown nginx:nginx /usr/share/nginx/html/healthz

USER nginx
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=8s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
