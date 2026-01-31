# OpenAsst Backend
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./
COPY knowledge/ ./knowledge/

# Build TypeScript
RUN npm run build

# Create data directory
RUN mkdir -p ./data

# Expose port
EXPOSE 3002

# Start
CMD ["npm", "start"]
