<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ConsciousML/eks-forge/main/site/static/img/readme-banner-dark.png">
    <img alt="EKS Forge" src="https://raw.githubusercontent.com/ConsciousML/eks-forge/main/site/static/img/readme-banner-light.png" width="480">
  </picture>
</p>

<p align="center">
  The GitOps repository of EKS Forge
</p>

<p align="center">
  <a href="https://github.com/ConsciousML/eks-forge">EKS Forge</a>&nbsp;|&nbsp;
  <a href="https://eks-forge.readthedocs.io/latest/docs/applications/get-started/">Deploy Your Applications</a>&nbsp;|&nbsp;
  <a href="https://eks-forge.readthedocs.io/latest/docs/overview/">Documentation</a>
</p>

<p align="center">
  <a href="https://opensource.org/licenses/Apache-2.0"><img alt="License" src="https://img.shields.io/badge/License-Apache_2.0-blue.svg"></a>
  <a href="https://github.com/ConsciousML/eks-forge-app-of-apps/releases"><img alt="GitHub Release" src="https://img.shields.io/github/release/ConsciousML/eks-forge-app-of-apps.svg?style=flat"></a>
  <a href="https://github.com/ConsciousML/eks-forge-app-of-apps/actions/workflows/ci.yaml"><img alt="CI" src="https://github.com/ConsciousML/eks-forge-app-of-apps/actions/workflows/ci.yaml/badge.svg"></a>
  <a href="http://makeapullrequest.com"><img alt="PR's Welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat"></a>
</p>

[EKS Forge](https://github.com/ConsciousML/eks-forge) is an open-source platform for building and operating [EKS](https://aws.amazon.com/eks/) clusters.

This repository holds its Kubernetes-side Helm charts and manifests, deployed by ArgoCD through the [App of Apps pattern](https://argo-cd.readthedocs.io/en/latest/operator-manual/cluster-bootstrapping/#app-of-apps-pattern-alternative).

For how the repositories fit together, see [Platform Architecture](https://eks-forge.readthedocs.io/latest/docs/architecture/#platform-architecture).

## Get Started

The [Deploy Your Applications](https://eks-forge.readthedocs.io/latest/docs/applications/get-started/) tutorial walks you through forking this repository and shipping a change to the `dev` cluster through ArgoCD. It builds on the cluster you deploy in the [Quickstart](https://eks-forge.readthedocs.io/latest/docs/quickstart/).

## Support

Support is provided on a best-effort basis. If you have feedback, feature ideas, or wish to report a bug, please use the [issues](https://github.com/ConsciousML/eks-forge-app-of-apps/issues) of this repository, or the [EKS Forge issues](https://github.com/ConsciousML/eks-forge/issues) for anything not specific to it.

## License

EKS Forge is licensed under the [Apache License 2.0](LICENSE).
