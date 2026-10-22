FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY . .
# Hardening: chạy bằng user không có đặc quyền (non-root)
RUN chown -R node:node /usr/src/app
USER node
EXPOSE 3000
CMD ["node", "server.js"]
