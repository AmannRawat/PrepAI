# Base image
FROM node:20-alpine

# Setting working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the frontend code
COPY . .

# Expose Vite's default port
EXPOSE 5173

# Capture build-time API URL and set default environment variable
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Start the Vite development server
# NOTE: We add "--host" so Vite allows connections from outside the Docker container!
CMD ["npm", "run", "dev", "--", "--host"]