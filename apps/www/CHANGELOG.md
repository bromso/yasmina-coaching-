# @repo/www

## 1.1.0

### Minor Changes

- [`0f0350a`](https://github.com/bromso/boilerplate/commit/0f0350aeebb95e9be54047865668ef8b2fa8dabb) Thanks [@bromso](https://github.com/bromso)! - feat: add Kubernetes support with k3d and Helm charts

  - Add k3d for local Kubernetes development in devcontainer
  - Create Helm umbrella chart with subcharts for all apps (app, www, docs, legal)
  - Add environment-specific values files (dev, staging, production)
  - Add health check endpoints (`/api/health`) for K8s probes
  - Add automation scripts and Makefile for K8s operations
  - Add GitHub Actions workflows for Docker builds and K8s deployments
  - Update devcontainer with kubectl, helm, and k3d tooling
  - Add VS Code tasks for K8s operations

### Patch Changes

- Updated dependencies []:
  - @repo/ui@1.1.0
