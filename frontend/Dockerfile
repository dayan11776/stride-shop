# Production image for the separately deployed Vite frontend.
# Railway provides VITE_* values at build time; they are public values baked
# into the browser bundle, so never place secrets in them.
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . ./

# Docker builds require explicit ARG declarations for Railway build variables.
ARG VITE_API_URL
ARG VITE_USE_MOCK
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_USE_MOCK=${VITE_USE_MOCK}

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# Railway overrides this at runtime; the default also makes `docker run` work
# without an extra environment argument.
ENV PORT=8080
EXPOSE 8080
