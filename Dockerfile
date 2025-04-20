# Use Node.js base image
FROM node:20

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the app
COPY . .

# Install Express types (fix TypeScript error)
RUN npm install --save-dev @types/express

# Build TypeScript files
RUN npm run build

# Expose the port
EXPOSE 3000

# Start the Express app
CMD ["npm", "start"]
