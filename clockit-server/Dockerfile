# Build stage
FROM node:18-alpine AS build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy source code and config
COPY . .

# Build TypeScript
RUN npm run build

# Runtime stage
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy compiled JavaScript from build stage (includes all compiled code)
COPY --from=build /app/dist ./dist

# Cloud Run expects PORT=8080
ENV PORT=8080
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
