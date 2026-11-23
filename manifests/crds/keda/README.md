<!-- This doc is aggregated into the EKS Forge documentation site: https://eks-forge.readthedocs.io/latest/docs/reference/manifests/crds/keda/. It is not meant to be read directly in this repository. -->

# `crds-keda` Manifests Reference

The [`crds-keda` manifests](./) install the upstream [KEDA](https://keda.sh/) CRDs (`ScaledObject`, `ScaledJob`, `TriggerAuthentication`, and the rest) from the [kedacore/keda](https://github.com/kedacore/keda) repository, at the release tag of the `keda` chart. Installed before any app, so an app can ship its own `ScaledObject` next to its manifests (e.g. [`manifests/podinfo/podinfo-scaledobject.yaml`](../../podinfo/podinfo-scaledobject.yaml)).

## What's Inside

- **[application.yaml](application.yaml)**: a nested ArgoCD `Application` sourcing the CRDs directly from the upstream repo instead of a local chart. `prune: false`, so a sync never deletes them and cascades into every `ScaledObject`
