FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev 2>/dev/null || npm install
COPY prisma ./prisma
COPY src ./src
COPY public ./public
RUN npx prisma generate
ENV NODE_ENV=production
ENV DATABASE_URL="file:./data/signflow.db"
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node src/index.js"]
