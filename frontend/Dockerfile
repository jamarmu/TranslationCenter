# Use official Node.js runtime as parent image
FROM node:20-slim

WORKDIR /usr/src/app

# Copy package descriptors
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy server entrypoints, configuration, and pre-built SPA dist folder
COPY server.js users.json ./
COPY dist ./dist

# Expose server gateway port
EXPOSE 8080

# Run the server gateway
CMD ["node", "server.js"]
