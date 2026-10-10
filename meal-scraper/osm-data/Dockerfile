FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY *.mjs ./
ENV TZ=Europe/Zurich
USER node
EXPOSE 8093
CMD ["node", "server.mjs"]
