FROM node:latest

WORKDIR /opt/app

ADD . /opt/app

RUN npm install --unsafe-perm --production

CMD ["bash","-c","if [ -d /meshage ]; then rm -rf node_modules/meshage && npm install /meshage; fi; node index.js"]