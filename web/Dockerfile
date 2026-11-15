# syntax=docker/dockerfile:1

# ---- build: compile the Vue app to static files ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .

# Vite inlines VITE_* variables into the bundle at build time, so they must be
# passed as build args. They end up in public JS, so never pass real secrets.
ARG VITE_PRIMEUI_LICENSE
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_API_BASE_URL
RUN yarn build-only

# ---- runtime: serve with unprivileged nginx ----
FROM nginxinc/nginx-unprivileged:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
