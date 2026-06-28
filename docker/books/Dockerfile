FROM node:22-bookworm-slim

ARG CALIBRE_VERSION=9.9.0
ARG ANNAS_VERSION=v0.0.5
ARG TARGETARCH

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
      ca-certificates curl gosu jq libasound2 libegl1 libfontconfig1 libfreetype6 libgl1 libglib2.0-0 libnss3 libopengl0 libxcb-cursor0 libxkbcommon0 python3 python-is-python3 redis-tools xdg-utils xz-utils zip \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://download.calibre-ebook.com/linux-installer.sh \
    | sh /dev/stdin "version=${CALIBRE_VERSION}"

RUN set -eux; \
    version_no_v="${ANNAS_VERSION#v}"; \
    case "${TARGETARCH:-amd64}" in \
      amd64) suffix=linux_amd64 ;; \
      arm64) suffix=linux_arm64 ;; \
      arm) suffix=linux_arm ;; \
      *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    asset="annas-mcp_${version_no_v}_${suffix}.tar.xz"; \
    checksums="annas-mcp_${version_no_v}--checksums.txt"; \
    url="https://github.com/iosifache/annas-mcp/releases/download/${ANNAS_VERSION}"; \
    tmpdir="$(mktemp -d)"; \
    curl -fsSLo "${tmpdir}/${asset}" "${url}/${asset}"; \
    curl -fsSLo "${tmpdir}/${checksums}" "${url}/${checksums}"; \
    cd "${tmpdir}"; \
    grep "  ${asset}$" "${checksums}" | sha256sum -c -; \
    tar -xJf "${asset}"; \
    install -d -m 0755 /opt/books/bin; \
    install -m 0755 "$(find "${tmpdir}" -type f -name annas-mcp | head -n 1)" /opt/books/bin/annas-mcp; \
    rm -rf "${tmpdir}"

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

COPY . .
RUN chmod +x /app/src/cli.js /app/docker/books/entrypoint.sh

ENTRYPOINT ["/app/docker/books/entrypoint.sh"]
CMD ["node", "src/cli.js", "--help"]
