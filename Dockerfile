FROM node:23.7.0-slim
WORKDIR /usr/src/app

ENV NODE_ENV=container

COPY package-docker.json package.json
RUN npm install
