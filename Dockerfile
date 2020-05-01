FROM node:lts-slim

WORKDIR /opt/app

COPY package.json /opt/app/
RUN npm install --unsafe-perm --production

COPY . /opt/app
RUN chmod +x docker-entrypoint.sh

ENTRYPOINT ["sh", "docker-entrypoint.sh"]