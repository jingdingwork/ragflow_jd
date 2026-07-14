FROM python:3.11-slim-bookworm

ARG NEED_MIRROR=1

COPY --from=ghcr.io/astral-sh/uv:0.7.5 /uv /uvx /bin/
ENV MPLBACKEND=Agg
ENV MPLCONFIGDIR=/tmp/matplotlib
ENV MATPLOTLIBRC=/usr/local/etc/matplotlibrc
# Playwright: chromium is baked into a world-readable path (sandbox runs as the
# `nobody` user on a read-only rootfs), and all runtime scratch/cache is directed
# to the /tmp tmpfs via HOME so the browser can launch without a writable rootfs.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
ENV HOME=/tmp

COPY requirements.txt .
COPY matplotlibrc /usr/local/etc/matplotlibrc

RUN if [ "$NEED_MIRROR" = 1 ]; then \
        grep -rl 'deb.debian.org' /etc/apt/ | xargs sed -i 's|http[s]*://deb.debian.org|https://mirrors.tuna.tsinghua.edu.cn|g'; \
        export UV_INDEX_URL="https://pypi.tuna.tsinghua.edu.cn/simple"; \
        export PLAYWRIGHT_DOWNLOAD_HOST="https://cdn.npmmirror.com/binaries/playwright"; \
    else \
        export UV_INDEX_URL="https://pypi.org/simple"; \
    fi; \
    apt-get update && \
    apt-get install -y --no-install-recommends curl gcc fonts-noto-cjk && \
    mkdir -p /tmp/matplotlib && \
    uv pip install --system -r requirements.txt && \
    python -m playwright install --with-deps chromium && \
    chmod -R a+rX /opt/ms-playwright && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

CMD ["sleep", "infinity"]