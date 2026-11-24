# H-Board: the recipes. `just ci` is what .github/workflows/ci.yml runs, in the same order.
# Run `npm ci` once first; the e2e smoke test needs `npx playwright install chromium` once.

default:
    @just --list

# The gate: asset pins, lint, typecheck, unit tests with coverage, build, e2e smoke test.
ci: assets lint typecheck coverage build smoke

# Check the pinned asset files against .config/assets.toml.
assets:
    npm run assets

lint:
    npm run lint

typecheck:
    npm run typecheck

# Unit tests.
test:
    npm test

# Unit tests with coverage (coverage/lcov.info) and JUnit output (test-results/junit.xml).
coverage:
    npm run test:coverage

# Build every package; the unpacked extension lands in packages/host-extension/dist/.
build:
    npm run build

# The Playwright smoke test against the built extension (no build).
smoke:
    npm run e2e

# Build, then the Playwright smoke test.
e2e: build smoke

# The page in the browser with hot reload.
dev:
    npm run dev

# Build the server image and check that it answers on /api/health.
image engine="docker":
    {{engine}} build --file packages/host-server/Dockerfile --tag h-board-server:dev .
    scripts/image-smoke.sh {{engine}} h-board-server:dev
