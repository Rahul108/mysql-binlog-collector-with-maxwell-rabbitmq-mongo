FROM node:16-slim

WORKDIR /app

# Install Node.js dependencies
COPY package.json package*.json ./
RUN npm install

# Copy application code
COPY ./src /app/

# Make scripts executable
RUN chmod +x /app/*.js || true

CMD ["node", "consumer.js"]
