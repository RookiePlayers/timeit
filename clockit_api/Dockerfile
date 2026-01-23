# Build stage
FROM node:24-alpine AS build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (include dev for build)
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy source code and tsconfig
COPY . .

# Build TypeScript (this will also run tsc-alias via the build script)
RUN npm run build

# Runtime stage
FROM node:24-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy build output
COPY --from=build /app/dist ./dist

# Cloud Run expects PORT=8080
ENV PORT=8080
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
