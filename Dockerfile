
# Xformers
FROM alpine:3.17 as xformers
RUN apk add --no-cache aria2
RUN aria2c -x 5 --dir / --out wheel.whl 'https://github.com/AbdBarho/stable-diffusion-webui-docker/releases/download/5.0.0/xformers-0.0.17.dev449-cp310-cp310-manylinux2014_x86_64.whl'

# Python
FROM python:3.10.9-slim

ENV DEBIAN_FRONTEND=noninteractive PIP_PREFER_BINARY=1

RUN --mount=type=cache,target=/root/.cache/pip pip install torch==1.13.1 torchvision --extra-index-url https://download.pytorch.org/whl/cu117

# RUN apt-get update && apt-get install -y git && apt-get clean

# Install Node.js and Supervisor
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get install -y supervisor && \
    apt-get clean

ENV ROOT=/stable-diffusion

COPY . ${ROOT}

RUN --mount=type=cache,target=/root/.cache/pip \
  cd ${ROOT} && \
  pip install -r requirements.txt

RUN --mount=type=cache,target=/root/.cache/pip  \
  --mount=type=bind,from=xformers,source=/wheel.whl,target=/xformers-0.0.17-cp310-cp310-linux_x86_64.whl \
  pip install triton /xformers-0.0.17-cp310-cp310-linux_x86_64.whl

# Node
# (maybe I'll translate this to python later)
# FROM node:18 as sidecar

# COPY scripts/comfy-api/* ./

# RUN npm ci

WORKDIR ${ROOT}

COPY supervisor/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
RUN chmod +x supervisor/scripts/*.sh

WORKDIR ${ROOT}/scripts/comfy-api

RUN npm ci

WORKDIR ${ROOT}

COPY docker /docker/

RUN chmod +x /docker/entrypoint.sh
# RUN chmod +x /docker/wait_any.sh


ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility NVIDIA_VISIBLE_DEVICES=all
ENV PYTHONPATH="${PYTHONPATH}:${PWD}" CLI_ARGS=""
EXPOSE 8188
ENTRYPOINT ["/docker/entrypoint.sh"]
# CMD python -u main.py --listen --port 8188 ${CLI_ARGS} & node ./scripts/comfy-api/index.js & /docker/wait_any.sh $$! $!
# CMD node ./scripts/comfy-api/index.js
CMD ["/usr/bin/supervisord"]