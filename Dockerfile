# OpenAsst Backend
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY dist/ ./dist/
COPY knowledge/ ./knowledge/

# Create data directory
RUN mkdir -p ./data

# Expose port
EXPOSE 3002

# Start
CMD ["npm", "start"]
