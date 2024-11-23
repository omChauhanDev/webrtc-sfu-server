FROM node:18

WORKDIR /usr/code

COPY package*.json ./

RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    python3-pip \
    gcc \
    g++ \
    make \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for mediasoup build
ENV MEDIASOUP_SKIP_WORKER_PREBUILT_DOWNLOAD="true"
ENV PYTHON=python3

RUN npm install mediasoup@3 \
    && npm install

COPY . .

# Expose ports (adjust the RTC ports range as needed)
EXPOSE 8000
EXPOSE 2000-2020

CMD ["npm", "run", "dev"]