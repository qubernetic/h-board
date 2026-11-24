import { codecovVitePlugin } from '@codecov/vite-plugin';
import type { PluginOption } from 'vite';

/**
 * Codecov Bundle Analysis for one package. It uploads only where CI asks for it
 * (`CODECOV_BUNDLE=1`, set in `.github/workflows/ci.yml`); a local build sends nothing.
 */
export function bundleAnalysis(bundleName: string): PluginOption {
  return codecovVitePlugin({
    enableBundleAnalysis: process.env['CODECOV_BUNDLE'] === '1',
    bundleName,
    oidc: { useGitHubOIDC: true },
    telemetry: false,
  });
}
