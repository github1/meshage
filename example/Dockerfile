FROM node:latest

WORKDIR /opt/app

ADD . /opt/app
RUN npm install --unsafe-perm

CMD node index.js