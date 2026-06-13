# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RAGFlow is an open-source RAG (Retrieval-Augmented Generation) engine based on deep document understanding. It's a full-stack application with:

- Python backend (Flask-based API server)
- React/TypeScript frontend (built with vitejs)
- Microservices architecture with Docker deployment
- Multiple data stores (MySQL, Elasticsearch/Infinity, Redis, MinIO)

## Architecture

### Backend (`/api/`)

- **Main Server**: `api/ragflow_server.py` - Flask application entry point
- **Apps**: Modular Flask blueprints in `api/apps/` for different functionalities:
  - `kb_app.py` - Knowledge base management
  - `dialog_app.py` - Chat/conversation handling
  - `document_app.py` - Document processing
  - `canvas_app.py` - Agent workflow canvas
  - `file_app.py` - File upload/management
- **Services**: Business logic in `api/db/services/`
- **Models**: Database models in `api/db/db_models.py`

### Core Processing (`/rag/`)

- **Document Processing**: `deepdoc/` - PDF parsing, OCR, layout analysis
- **LLM Integration**: `rag/llm/` - Model abstractions for chat, embedding, reranking
- **RAG Pipeline**: `rag/flow/` - Chunking, parsing, tokenization
- **Graph RAG**: `rag/graphrag/` - Knowledge graph construction and querying

### Agent System (`/agent/`)

- **Components**: Modular workflow components (LLM, retrieval, categorize, etc.)
- **Templates**: Pre-built agent workflows in `agent/templates/`
- **Tools**: External API integrations (Tavily, Wikipedia, SQL execution, etc.)

### Frontend (`/web/`)

- React/TypeScript with vitejs framework
- shadcn/ui components
- State management with Zustand
- Tailwind CSS for styling

### Admin Server (`/admin/`)

A **separate Flask service** (distinct from the main API server), entry point `admin/server/admin_server.py`, listening on port **9381** and serving the `/api/v1/admin/*` endpoints used by the admin console.

- **Routes**: `admin/server/routes.py` (the `admin_bp` blueprint) — all admin HTTP endpoints.
- **Business logic**: `admin/server/services.py` — `XxxMgr` classes (e.g. `EsDataMgr` is a read-only document-store inspector for ES/Infinity: lists KBs, index stats, documents, chunk search/detail). Despite the `es*` naming, "es" denotes the document-store engine layer and is shared by retrieval-test, so do not blindly rename it.
- **Auth/bootstrap**: `admin/server/auth.py` (`setup_auth`, `init_default_admin`); has its own Flask-Login session, independent of the main app.
- **CLI client**: `admin/client/` (`ragflow_cli.py`).
- **Frontend**: lives under `web/src/pages/admin/`, routed via `Routes.Admin*` in `web/src/routes.tsx`, nav in `web/src/pages/admin/layouts/navigation-layout.tsx`, API calls in `web/src/services/admin-service.ts`. Some pages are enterprise-only, gated by `IS_ENTERPRISE` from `web/src/pages/admin/utils`.

### Data-source connectors & department shared-folder sync

RAGFlow has an Onyx/Danswer-style **connector sync engine** that pulls external sources into a KB on a schedule, with incremental + delete reconciliation:

- **Models** (`api/db/db_models.py`): `Connector` (source type, `config` JSON, `refresh_freq` minutes, `department_id`), `Connector2Kb` (connector↔KB link), `SyncLogs` (per-run status/counts).
- **Connectors** live in `common/data_source/` (one class per source, e.g. `webdav_connector.py`), implementing `LoadConnector`/`PollConnector`/`SlimConnectorWithPermSync`. Each is registered in the `func_factory` of the **sync worker** `rag/svr/sync_data_source.py` (a separate long-running process, not the API server) and keyed by a `FileSource` enum value (`common/constants.py`) + a `DocumentSource` enum value (`common/data_source/config.py`).
- **Sync semantics**: synced docs carry `source_type = "<source>/<connector_id>"`. A stable per-file id (reused between document yields and the slim snapshot) drives delete reconciliation. `content_hash` fingerprints skip unchanged files. `Connector2KbService.link_connectors` triggers the first full reindex.

**Department shared-folder feature** (mounted SMB/CIFS/NFS → department KB): the `LocalFolderConnector` (`common/data_source/local_folder_connector.py`, `FileSource.LOCAL_FOLDER`) walks a host-mounted directory — no credentials, `validate_connector_settings()` checks path reachability for the "test" button, `exclude_dirs` skips recycle bins. The mount must be bind-mounted (`:ro`) into the **sync worker, admin server, and API server** containers. Admin CRUD is `FolderMgr` in `admin/server/services.py` (routes `/admin/dept-folders/*`); frontend page `web/src/pages/admin/dept-folders.tsx`. A daily trigger `nightly_folder_sync()` in the sync worker re-syncs all folder connectors at `FOLDER_SYNC_HOUR` (default 1 AM, server-local). Shared-folder docs are **read-only on the user side**: `api/apps/restful_apis/document_api.py` rejects delete/update for `source_type` starting with `local_folder/`, and the dataset document UI hides those actions via `isSharedFolderDocument` (`web/src/pages/dataset/dataset/utils.ts`).

### Brand & UI style (京鼎 / CTCI)

This fork is rebranded from RAGFlow to **京鼎工程 / CTCI**. All new/edited frontend pages must follow this style — **UI only, never change functionality to fit styling**:

- **Brand color = orange `#F39800`** (rgb `243 152 0`), gradient `#F39800 → #FF8C00 → #FFC373`. It is the global token `--accent-primary` in `web/tailwind.css` (plus `--brand-from/--brand-via/--brand-to`). **Use tokens** (`accent-primary`, `bg-base`/`bg-component`/`bg-card`, `text-primary`/`text-secondary`) — never hardcode the old RAGFlow teal/cyan/blue (`#00BEB4`, `#40EBE3`, `#4A51FF`, `rgba(76,164,231,…)`); the orange cascades automatically.
- **Brand lockup**: use `CtciLogo` / `CtciBrand` from `web/src/components/ctci-logo.tsx` for any logo/header/sidebar block. Never reintroduce `/logo.svg` or a visible "RAGFlow" wordmark in chrome (internal "RAGFlow" strings in agent/model/system code are not chrome — leave them).
- **Operation pages**: keep dark default + light/dark toggle; only the accent is orange.
- **Premium/login-style surfaces**: reference `web/src/pages/login-next/index.tsx` (scoped light palette: concrete-gray gradient + faint grid + orange radial glow, orange gradient button with shimmer, footer "© 京鼎工程股份有限公司 · CTCI CORPORATION"); admin login `web/src/pages/admin/login.tsx` mirrors it.
- **No external community links** (Discord/GitHub) in chrome — corporate intranet product.
- Brand i18n keys: `header.brand` / `header.brandTagline`, admin `admin.title`.

### Frontend conventions

- `web/src/components/ui/` (shadcn primitives) is **locked** — compose/wrap these, never modify them. `RAGFlowSelect` (`ui/select.tsx`) has no search; use `SelectWithSearch` (`web/src/components/originui/select-with-search.tsx`) when a searchable dropdown is needed (drop-in: same `value`/`onChange(value)`/`options` API; auto-shows a search box when options > 5).
- i18n: add keys to **both** `web/src/locales/zh.ts` and `web/src/locales/en.ts`; en.ts uses Sentence case.
- Type-check with `cd web && npm run type-check`. The repo has many pre-existing unrelated type errors, so exit code 2 is expected — filter the output for the file(s) you edited to confirm your changes are clean.

## Common Development Commands

### Backend Development

```bash
# Install Python dependencies
uv sync --python 3.12 --all-extras
uv run python3 download_deps.py
pre-commit install

# Start dependent services
docker compose -f docker/docker-compose-base.yml up -d

# Run backend (requires services to be running)
source .venv/bin/activate
export PYTHONPATH=$(pwd)
bash docker/launch_backend_service.sh

# Run tests
uv run pytest

# Linting
ruff check
ruff format
```

### Frontend Development

```bash
cd web
npm install
npm run dev        # Development server
npm run build      # Production build
npm run lint       # ESLint
npm run test       # Jest tests
```

### Docker Development

```bash
# Full stack with Docker
cd docker
docker compose -f docker-compose.yml up -d

# Check server status
docker logs -f ragflow-server

# Rebuild images
docker build --platform linux/amd64 -f Dockerfile -t infiniflow/ragflow:nightly .
```

## Key Configuration Files

- `docker/.env` - Environment variables for Docker deployment
- `docker/service_conf.yaml.template` - Backend service configuration
- `pyproject.toml` - Python dependencies and project configuration
- `web/package.json` - Frontend dependencies and scripts

## Testing

- **Python**: pytest (`testpaths = ["test"]`); markers defined in `pyproject.toml` are `p0`/`p1`/`p2`/`p3` (priority), `smoke`, `auth`, `asyncio`. Note `filterwarnings` treats warnings as errors.
  - Run one file: `uv run pytest test/unit_test/rag/llm/test_xxx.py`
  - Run one test: `uv run pytest test/path/test_file.py::TestClass::test_name`
  - Run by marker: `uv run pytest -m p1` (or `-m smoke`)
- **Frontend**: `cd web && npm run test` (Jest); `npm run type-check` for `tsc --noEmit`
- **API Tests**: HTTP API and SDK integration tests in `test/testcases/` (require a running backend); unit tests in `test/unit_test/`

## Database Engines

RAGFlow supports switching between Elasticsearch (default) and Infinity:

- Set `DOC_ENGINE=infinity` in `docker/.env` to use Infinity
- Requires container restart: `docker compose down -v && docker compose up -d`

## Development Environment Requirements

- Python >=3.12,<3.15 (`pyproject.toml`; install with `uv sync --python 3.12`)
- Node.js >=18.20.4
- Docker & Docker Compose
- uv package manager
- 16GB+ RAM, 50GB+ disk space

1. Think before acting. Read existing files before writing code.
2. Be concise in output but thorough in reasoning.
3. Prefer editing over rewriting whole files.
4. Do not re-read files you have already read.
5. Test your code before declaring done.
6. No sycophantic openers or closing fluff.
7. Keep solutions simple and direct.
8. User instructions always override this file.
