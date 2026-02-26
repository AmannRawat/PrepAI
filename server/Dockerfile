# Use a lightweight official Node image as foundation
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy only the package files first, then install dependencies 
# (This is a Docker trick to cache your node_modules and speed up future builds!)
COPY package*.json ./
RUN npm install

# Copy the rest of server code into the container
COPY . .

#  Expose the port your backend runs on
EXPOSE 8000

# The command to start your backend server
CMD ["npm", "run", "dev"]