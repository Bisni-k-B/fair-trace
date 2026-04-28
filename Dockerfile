# Use Node.js for building
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (ignoring scripts to avoid post-install failures in restricted envs)
RUN npm install

# Copy source
COPY . .

# Build the app
RUN npm run build

# Use Nginx to serve the static files
FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html

# Custom nginx config if needed (for SPA routing)
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
