FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --production
COPY backend/ ./
COPY frontend/ ./frontend/
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD curl -f http://localhost:5000/health || exit 1
CMD ["npm", "start"]
