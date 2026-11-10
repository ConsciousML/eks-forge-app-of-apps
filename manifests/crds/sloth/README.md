<!-- This doc is aggregated into the EKS Forge documentation site: https://eks-forge.readthedocs.io/latest/docs/reference/manifests/crds/sloth/. It is not meant to be read directly in this repository. -->

# `crds-sloth` Manifests Reference

The [`crds-sloth` manifests](./) install the upstream [Sloth](https://sloth.dev/) `PrometheusServiceLevel` CRD from the [slok/sloth](https://github.com/slok/sloth) repository, at the release tag of the `sloth` chart. Installed before any app, so an app can ship its own `PrometheusServiceLevel` next to its manifests (see [How SLO Alerting Works](/docs/monitoring/paging/how-slo-alerting-works/#sloth)).

## What's Inside

- **[application.yaml](application.yaml)**: a nested ArgoCD `Application` sourcing the CRD directly from the upstream repo instead of a local chart. `prune: false`, so a sync never deletes it and cascades into every `PrometheusServiceLevel`
